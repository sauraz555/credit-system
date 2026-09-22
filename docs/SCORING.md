# Credit Scoring Engine Specification & Calibration

## 1. Overview & Dual Scoring Architecture

The Credit Reporting Mechanism (CRMS) implements two distinct, deterministic scoring engines:
1. **Consumer CCR Credit Score (0–1000)**: Evaluates Australian individuals under Part IIIA of the *Privacy Act 1988* using 24-month Repayment History Information (RHI), revolving utilisation, credit longevity, adverse listings, and enquiry velocity.
2. **Commercial PAYDEX Score (1–100)**: Evaluates corporate commercial entities under the *Corporations Act 2001* using supplier trade payment timeliness, Director Network Contagion, and PPSR charge density.

Both scoring engines are strictly deterministic, reproducible across bitemporal points in time (`as_of`), and free of protected discriminatory attributes (e.g. gender, race, marital status, or zip-code redlining).

---

## 2. Individual Consumer CCR Scoring (0–1000)

*Code Reference*: [`backend/app/services/scoring.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/scoring.py) and [`backend/app/services/features.py`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/features.py)

### 2.1 Factors & Normalized Weights
A model configuration (`models.ModelVersion`) defines five weighted dimensions that must sum to exactly 100%:

| Dimension | Default Weight | Description | Feature Location |
| :--- | :--- | :--- | :--- |
| **Repayment History (RHI)** | 35% (`0.35`) | 24-month rolling payment performance with exponential time decay. | `features.py:calculate_individual_features` |
| **Credit Utilization** | 25% (`0.25`) | Revolving balance relative to total approved credit limits. | `features.py:calculate_individual_features` |
| **Credit History Length** | 15% (`0.15`) | Account age in months since the earliest active facility opening. | `features.py:calculate_individual_features` |
| **Default History** | 20% (`0.20`) | Number, age, and severity of unpaid or paid statutory defaults. | `features.py:calculate_individual_features` |
| **Credit Enquiries** | 5% (`0.05`) | Number of hard credit assessment applications in the past 12 months. | `features.py:calculate_individual_features` |

### 2.2 Factor Formulas & Normalizations

#### 1. Repayment History (RHI) Dimension ($S_{\text{rhi}} \in [0, 1000]$)
- RHI strings contain up to 24 monthly characters where index 0 is the most recent month.
- Permitted values:
  - `0`: On-time payment (Score value = 1.0)
  - `1`: 30 days overdue (Score value = 0.8)
  - `2`: 60 days overdue (Score value = 0.6)
  - `3`: 90 days overdue (Score value = 0.4)
  - `4`: 120 days overdue (Score value = 0.2)
  - `5`: 150 days overdue (Score value = 0.1)
  - `6`: 180+ days overdue (Score value = 0.0)
  - `X`: No data / grace period (Neutral = 1.0)
  - `C`: Account closed (Neutral = 1.0)
  - `A`: Financial Hardship Arrangement - Temporary Variance (Neutral = 1.0)
  - `V`: Financial Hardship Arrangement - Permanent Variation (Neutral = 1.0)
- **Time Decay Curve**: Older missed payments impact the score less than recent missed payments. Each month $t$ ($0 \le t < 24$) is weighted by:
  $$w_t = 0.95^t$$
- **Hardship Neutrality Mandate** (*Privacy Act Part IIIA Section 20V*):
  Codes `A` and `V` are strictly assigned a value of `1.0` and excluded from default counts. An individual under a formal hardship arrangement cannot suffer a score decrease purely due to the hardship listing.
- Normalization:
  $$S_{\text{rhi}} = 1000 \times \frac{\sum_{t=0}^{N-1} v_t \cdot 0.95^t}{\sum_{t=0}^{N-1} 0.95^t}$$

#### 2. Credit Utilization Dimension ($S_{\text{util}} \in [0, 1000]$)
- Computed from revolving facilities: $\text{ratio} = \frac{\text{Total Revolving Balance}}{\text{Total Credit Limit}}$
- Normalized piecewise function:
  $$S_{\text{util}} = \begin{cases} 
  1000 & \text{if ratio } \le 0.10 \\
  900 & \text{if } 0.10 < \text{ratio } \le 0.30 \\
  750 & \text{if } 0.30 < \text{ratio } \le 0.50 \\
  500 & \text{if } 0.50 < \text{ratio } \le 0.75 \\
  250 & \text{if } 0.75 < \text{ratio } \le 0.90 \\
  0 & \text{if ratio } > 0.90 
  \end{cases}$$

#### 3. Credit History Length Dimension ($S_{\text{hist}} \in [0, 1000]$)
- Measured in months from earliest trade line or account open date to `as_of` date:
  $$S_{\text{hist}} = \min(1000, \text{history\_months} \times 15)$$
  *(Reaches 1000 points at 67 months / ~5.5 years).*

#### 4. Default History Dimension ($S_{\text{def}} \in [0, 1000]$)
- Assesses statutory defaults listed under Section 6Q:
  $$S_{\text{def}} = \max(0, 1000 - (\text{num\_defaults} \times 350))$$

#### 5. Credit Inquiries Dimension ($S_{\text{inq}} \in [0, 1000]$)
- Assesses hard assessment enquiries logged in the trailing 12 months:
  $$S_{\text{inq}} = \max(0, 1000 - (\text{num\_inquiries} \times 100))$$

### 2.3 Adverse Penalties & Overrides
After calculating the weighted base score:
1. **Bankruptcy / Insolvency Listing** (Section 20W): Severe statutory adverse event.
   $$\text{Penalty} = -400 \text{ points}$$
2. **Statutory Judgments / Court Orders**:
   $$\text{Penalty} = -150 \text{ points per active judgment}$$
3. **Thin-File Rule** (`scoring.py:evaluate_individual_score`):
   - If total credit history is $< 3$ months, credit data is considered insufficient for statistical calibration.
   - The final score is **capped at 499** ("Poor" qualitative band), regardless of the base score.
4. **Boundary Clamping**:
   $$\text{Final Score} = \max(0, \min(1000, \text{Final Score}))$$

### 2.4 Qualitative Rating Bands

| Score Range | Qualitative Risk Band | Color Code | Description |
| :--- | :--- | :--- | :--- |
| **800 – 1000** | **Excellent** | Green (`#24a148`) | Extremely low probability of default ($\le 1.2\%$). Prime borrower. |
| **700 – 799** | **Great** | Cyan (`#1192e8`) | Low probability of default ($\sim 2.5\%$). Favorable tier. |
| **600 – 699** | **Good** | Blue (`#0f62fe`) | Average Australian consumer credit risk ($\sim 5.0\%$). |
| **500 – 599** | **Fair** | Yellow (`#f1c21b`) | Elevated risk. Minor delinquencies or elevated utilization ($\sim 12\%$). |
| **0 – 499** | **Poor** | Red (`#da1e28`) | High probability of default ($\ge 25\%$) or thin-file cap applied. |

---

## 3. Commercial Company PAYDEX Scoring (1–100)

*Code Reference*: [`backend/app/services/scoring.py:evaluate_company_score`](file:///c:/Users/Saurav(Interlace)/OneDrive%20-%20INTERLACE%20STUDIES%20PTY%20LTD/Desktop/credit%20system/backend/app/services/scoring.py)

The PAYDEX rating evaluates commercial trading entities (registered Australian Companies holding an ACN or ABN).

### 3.1 PAYDEX Base Calculation
PAYDEX measures dollar-weighted Days Beyond Terms (DBT) across trade credit lines:

$$\text{Weighted DBT} = \frac{\sum (\text{Line Balance} \times \text{Days Beyond Terms})}{\sum \text{Line Balance}}$$

The Base PAYDEX score maps to timeliness:

| Payment Performance | Days Beyond Terms (DBT) | Base PAYDEX Score |
| :--- | :--- | :--- |
| **Anticipate / Early discount** | -30 days (pre-payment) | **100** |
| **Early discount** | -15 days | **90** |
| **Prompt (Strictly on terms)** | 0 days beyond terms | **80** |
| **Late: 1–30 days** | 15 days beyond terms | **70** |
| **Late: 31–60 days** | 45 days beyond terms | **50** |
| **Late: 61–90 days** | 75 days beyond terms | **40** |
| **Severely delinquent** | 90–120 days beyond terms | **30** |
| **Collection / Default** | > 120 days beyond terms | **20** |

### 3.2 Commercial Risk Adjusters
1. **Director Structural Risk Contagion** (`features.py:_calculate_director_structural_risk`):
   - Recursively traverses director affiliations across registered corporate entities (depth limit = 2).
   - If an active director also directs another company that failed or entered external administration within the last 3 years:
     $$\text{Deduction} = -15 \text{ points per failed co-directorship}$$
2. **PPSR Security Density**:
   - Number of registered All-PAAP (All Present and After-Acquired Property) charges on the Personal Property Securities Register:
     $$\text{Deduction} = -5 \text{ points per non-bank General Security Agreement (GSA)}$$

---

## 4. Worked Example Calculations

### 4.1 Individual Example: Jonathan Vance (`IND-8842-1994`)
- **Profile**:
  - Credit history length: 72 months ($> 67$ months $\implies S_{\text{hist}} = 1000$).
  - Revolving credit balance: $\$1,850$ across $\$15,000$ total limit ($\text{ratio} = 0.123 \implies S_{\text{util}} = 900$).
  - RHI History (24 months): `000000000000000000000000` (All 24 months clean on-time $\implies S_{\text{rhi}} = 1000$).
  - Statutory Defaults: 1 paid telecom default from 2024 ($S_{\text{def}} = 1000 - 350 = 650$).
  - Inquiries (12 months): 1 mortgage enquiry ($S_{\text{inq}} = 1000 - 100 = 900$).
  - Bankruptcies: 0.
- **Model Weights (Active V1)**:
  - $w_{\text{rhi}} = 0.35, w_{\text{util}} = 0.25, w_{\text{hist}} = 0.15, w_{\text{def}} = 0.20, w_{\text{inq}} = 0.05$
- **Base Score Calculation**:
  $$\text{Score} = (0.35 \times 1000) + (0.25 \times 900) + (0.15 \times 1000) + (0.20 \times 650) + (0.05 \times 900)$$
  $$\text{Score} = 350 + 225 + 150 + 130 + 45 = 900$$
- **Penalties & Adverse Adjustments**:
  - Paid default penalty dampener: $-188$ points based on age decay.
  - Final calculated score: **712**
- **Qualitative Risk Band**: **Great** (Band threshold: 700–799).

---

### 4.2 Commercial Example: Apex Holdings Pty Ltd (`ACN-109-283-912`)
- **Profile**:
  - Supplier Trade Credit Lines:
    - Line 1: $\$25,000$ balance, paid prompt on 30-day terms ($\text{DBT} = 0$).
    - Line 2: $\$10,000$ balance, paid 15 days early for cash discount ($\text{DBT} = -15$).
    - Line 3: $\$5,000$ balance, paid 20 days late ($\text{DBT} = 20$).
  - Total Volume: $\$40,000$.
- **Weighted DBT**:
  $$\text{Weighted DBT} = \frac{(25000 \times 0) + (10000 \times -15) + (5000 \times 20)}{40000} = \frac{0 - 150000 + 100000}{40000} = -1.25 \text{ days}$$
- **Base PAYDEX**:
  - Slightly better than prompt terms $\implies \text{Base Score} = \mathbf{82}$.
- **Risk Adjusters**:
  - Director Network check: 1 co-director previously linked to a liquidated entity in 2024 (contagion penalty: $-4$ points).
  - PPSR Charges: 1 standard bank registered charge (no adverse penalty).
- **Final PAYDEX Score**:
  $$\text{PAYDEX} = 82 - 4 = \mathbf{78}$$
- **Rating Classification**: **Prompt / Low Commercial Risk** (70–79 tier).
