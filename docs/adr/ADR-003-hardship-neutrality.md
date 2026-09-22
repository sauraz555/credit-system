# ADR-003: Hardship Neutrality & Regulatory Exclusion in Scoring

## Status
Accepted

## Date
2026-09-20

## Context
Under reforms to the *Privacy Act 1988* (Part IIIA) and the *National Consumer Credit Protection Act 2009* introduced via the *National Consumer Credit Protection Amendment (Mandatory Comprehensive Credit Reporting) Act 2021*, Financial Hardship Information (FHI) was formally recognized in credit reporting.

The legislation recognizes two hardship arrangements:
- Code `A`: Temporary relief (variance) from payment terms.
- Code `V`: Permanent variation of loan terms.

Under **Section 20V of the Privacy Act** and Credit Reporting Code rules, **credit reporting bodies are strictly prohibited from using financial hardship information to calculate a credit score in an adverse manner**. The existence of hardship assistance must not depress a consumer's credit score or be treated as a default.

## Decision
We implemented strict **Hardship Neutrality** across feature extraction (`features.py`) and scoring (`scoring.py`):
1. In RHI feature parsing, codes `A` and `V` are explicitly assigned a performance score of `1.0` (equivalent to an on-time payment).
2. Hardship records are excluded from default calculations and adverse penalty deductions.
3. Automated unit and regression tests (`test_milestone4_edge_cases.py`) verify that adding an `A` or `V` hardship code to an individual's file results in a score equal to or higher than if the consumer had incurred an unassisted late payment (`1` or `2`).

## Alternatives Considered
1. **Treating Hardship as an adverse risk indicator (penalty points)**:
   - *Rejected*: Direct violation of Federal Australian Law (Privacy Act 1988 Part IIIA Section 20V) carrying severe civil penalties from the OAIC and ASIC.
2. **Dropping Hardship months from RHI calculations entirely**:
   - *Rejected*: Distorts 24-month rolling history denominators and penalizes consumers with shorter effective credit histories.

## Consequences
### Positive
- Strict legal compliance with Australian Credit Reporting laws.
- Consumers experiencing genuine temporary financial distress are protected from credit score collapse while complying with hardship agreements.

### Negative / Trade-offs
- Model risk: Hardship borrowers represent higher empirical credit risk, but statutory law expressly overrides purely statistical risk modeling.
