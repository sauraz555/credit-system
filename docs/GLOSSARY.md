# CRMS Regulatory & Technical Glossary

This glossary defines statutory legal terms, regulatory frameworks, cryptographic concepts, and statistical metrics used throughout the Credit Reporting Mechanism (CRMS).

---

## Statutory & Credit Bureau Terms

### ACL (Australian Credit Licence)
A licence issued by the Australian Securities and Investments Commission (ASIC) under the *National Consumer Credit Protection Act 2009 (NCCPA)* authorizing an entity to engage in consumer credit activities.

### ADI (Authorised Deposit-taking Institution)
A corporation authorized under the *Banking Act 1959 (Cth)* by the Australian Prudential Regulation Authority (APRA) to take deposits and conduct banking business (e.g. Australian banks, building societies, and credit unions). Only licensed ADIs and ACL credit providers are legally permitted to report Repayment History Information (RHI).

### APRA (Australian Prudential Regulation Authority)
The statutory regulator of the Australian financial services industry, responsible for prudential standards including CPS 234 (Information Security) and CPS 220 (Risk Management).

### ASIC (Australian Securities and Investments Commission)
The statutory regulator governing Australian corporate entities, financial markets, and consumer credit licensing under the *Corporations Act 2001* and *National Consumer Credit Protection Act 2009*.

### CCR (Comprehensive Credit Reporting)
The Australian credit reporting regime established under Part IIIA of the *Privacy Act 1988 (Cth)*. Unlike traditional "negative-only" credit reporting (which recorded only defaults, bankruptcies, and court judgments), CCR captures both positive and negative financial performance, including 24-month rolling repayment history (RHI), open dates, credit limits, and financial hardship indicators.

### CRB (Credit Reporting Body)
An organization that carries on a credit reporting business under Part IIIA of the *Privacy Act 1988*. CRBs collect, hold, compile, and disseminate credit information to eligible credit providers and consumer subjects.

### CR Code (Privacy (Credit Reporting) Code 2014)
The legally binding operational code registered by the Australian Information Commissioner that supplements Part IIIA of the *Privacy Act 1988*, detailing rules for listing defaults, issuing statutory notices, managing hardship information, and resolving consumer disputes.

### Default (Section 6Q Default)
An adverse credit listing registered against a consumer credit account. Under *Privacy Act Section 6Q(1)*, a default can only be listed if:
1. The overdue amount is $\ge \$150.00$.
2. The payment is at least 60 days overdue.
3. A formal Section 6Q notice was served requesting payment $\ge 30$ days prior.
4. A formal Section 21D notice stating intent to list was served $\ge 14$ days prior.
Defaults remain on a consumer's credit file for **5 years** (Section 20W).

### Hardship Information (Codes A & V)
Information regarding a financial hardship arrangement between a consumer and a credit provider under *Privacy Act Part IIIA Section 6QA*:
- **Code `A` (Temporary Variance)**: A temporary variation to repayments or deferral of terms.
- **Code `V` (Permanent Variation)**: A permanent variation to loan terms, such as a term extension or capitalization of arrears.
*Statutory Invariant*: Under Section 20V, hardship information must be excluded from scoring penalties and cannot be treated as an adverse event. Retained for **1 year** (Section 20W).

### OAIC (Office of the Australian Information Commissioner)
The independent statutory agency established under the *Australian Information Commissioner Act 2010* with regulatory oversight of the *Privacy Act 1988*.

### PAYDEX
A dollar-weighted commercial credit score ranging from 1 to 100 developed to measure supplier trade credit payment promptness based on Days Beyond Terms (DBT). A score of 80 indicates prompt payment strictly on terms; $>80$ indicates early payments taking prompt cash discounts; $<80$ indicates late payments.

### PPSR (Personal Property Securities Register)
The national electronic register established under the *Personal Property Securities Act 2009 (Cth)* for recording security interests in personal property (e.g. chattel mortgages, equipment leases, General Security Agreements).

### RHI (Repayment History Information)
A 24-month rolling monthly record of whether a consumer has met their monthly credit repayment obligations. Expressed using standardized characters:
- `0`: Paid on time.
- `1` to `6`: Overdue brackets (1 = 1–29 days, 2 = 30–59 days, up to 6 = 150–179 days).
- `X`: No data / grace period / pending.
- `C`: Account closed.
- `A` / `V`: Hardship arrangement.
RHI has a statutory retention period of **2 years** (Privacy Act Section 20W).

### SCI (Seriously Infringing Credit / Serious Credit Infringement)
An adverse credit listing registered when a debtor has engaged in fraudulent conduct or intentional evasion of process. Retained for **7 years**.

### Section 20V Dispute
The formal statutory mechanism under *Privacy Act 1988 Section 20V* enabling a consumer or credit provider to challenge the accuracy, completeness, or timeliness of a credit listing. The bureau must investigate and resolve the dispute within **30 days**.

### TFN (Tax File Number)
A unique identifier issued by the Australian Taxation Office (ATO). Under *Privacy Act 1988 Part IIIA Section 20E* and the *Privacy (Tax File Number) Rule 2015*, CRBs are strictly prohibited from collecting, storing, or using TFNs.

---

## Technical & Cryptographic Terms

### AES-256-GCM
Advanced Encryption Standard using a 256-bit key in Galois/Counter Mode. An Authenticated Encryption with Associated Data (AEAD) cipher providing both high-speed confidentiality and cryptographic integrity verification via a 16-byte authentication tag.

### Argon2id
A hybrid memory-hard cryptographic password hashing algorithm designed to resist GPU, FPGA, and ASIC brute-force attacks. Winner of the Password Hashing Competition.

### Bitemporal
A data modeling pattern that independently records two orthogonal time dimensions:
- **Valid Time**: When an event occurred in the real world.
- **Recorded Time**: When the event was committed into the database ledger.
Enables exact point-in-time (`as_of`) query reconstruction and prevents audit trail destruction during retroactive corrections.

### Blind Index (HMAC Blind Index)
A privacy-preserving technique that enables fast exact-match lookups on encrypted database columns. An HMAC-SHA256 digest is generated from the normalized plaintext and a secret salt held separately from the encryption key. Searches query the blind index column in $O(1)$ time without decrypting the dataset or exposing deterministic ciphertexts.

### Refresh Token Rotation (RTR)
A security practice where every invocation of a refresh token issues a brand-new refresh token and invalidates the previous one. If an invalidated refresh token is subsequently presented, the system detects a token reuse attack and revokes the entire token family.

### TOTP (Time-Based One-Time Password)
An algorithm specified in RFC 6238 that computes a dynamic 6-digit one-time password from a shared secret key and the current epoch timestamp, providing Authenticator Assurance Level 2 (AAL2) multi-factor security.

---

## Statistical & Model Evaluation Terms

### AUC-ROC (Area Under the Receiver Operating Characteristic)
A statistical performance metric measuring a credit scoring model's ability to discriminate between good (non-defaulting) and bad (defaulting) borrowers across all possible classification thresholds. An AUC of 0.50 represents random guessing; an AUC $\ge 0.75$ represents institutional-grade discrimination.

### Gini Coefficient
A measure of credit score predictive discrimination derived from AUC:
$$\text{Gini} = 2 \times \text{AUC} - 1$$
A Gini of 0 indicates zero predictive ability; a Gini $\ge 0.50$ is typical of well-calibrated credit risk models.

### Kolmogorov-Smirnov (KS) Statistic
The maximum vertical separation between the cumulative distribution functions of defaulting and non-defaulting borrowers across score deciles. Evaluates how effectively the model separates good borrowers from bad borrowers. A KS value $\ge 40\%$ is considered strong.

### PSI (Population Stability Index)
A statistical metric measuring whether a score distribution has drifted over time due to macroeconomic changes or sample selection bias:
- $\text{PSI} < 0.10$: Minimal shift; model remains stable.
- $0.10 \le \text{PSI} < 0.25$: Moderate shift; warranting investigation.
- $\text{PSI} \ge 0.25$: Significant shift; requiring model recalibration.
