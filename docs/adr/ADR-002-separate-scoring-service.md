# ADR-002: Decoupled Feature Extraction & Deterministic Scoring Service

## Status
Accepted

## Date
2026-09-20

## Context
Credit scoring models must satisfy strict regulatory transparency standards under *Privacy Act 1988 Part IIIA Section 20R*, APRA Prudential Practice Guide *CPG 223*, and anti-discrimination laws. Black-box machine learning models (e.g. deep neural networks or complex gradient boosted trees) frequently suffer from lack of explainability, covariate shift, and hidden algorithmic bias (e.g. proxy discrimination). Furthermore, model parameters (weights, thresholds, penalty sizes) must be versioned, audited, and back-tested without redeploying the core application.

## Decision
We decoupled scoring into two distinct modules:
1. **Feature Store Service (`app.services.features`)**:
   - Pure functional feature extractors that aggregate raw ledger records into standardized statistical metrics (decayed RHI performance, revolving utilization, credit history longevity, director structural contagion risk).
2. **Deterministic Scoring Engine (`app.services.scoring`)**:
   - Applies versioned model configurations (`models.ModelVersion`) with explicit mathematical weights (summing to exactly 100%), calibrated bands, and statutory penalty deductions.
   - Generates top positive and negative contributing factor explanations for every score.
   - Strictly enforces the thin-file 499-point cap for entities with $< 3$ months of history.

## Alternatives Considered
1. **Embedding scoring logic directly in API routes**:
   - *Rejected*: Violates separation of concerns, prevents offline back-testing and batch evaluation, and makes unit testing difficult.
2. **Black-box ML models (XGBoost / LightGBM) inside the API**:
   - *Rejected*: Inability to provide deterministic factor breakdowns required by Privacy Act Section 20R, and complex model governance requirements under APRA CPS 220.

## Consequences
### Positive
- Strict reproducibility: given identical features and model version, score output is 100% deterministic.
- Model governance: new model versions can be authored in the database, back-tested against synthetic/historical loan portfolios, and activated without code changes.
- Explainability: provides legally compliant factor explanations ("Adverse default listed", "Low revolving utilization").

### Negative / Trade-offs
- Linear weighted formulas require rigorous manual calibration compared to auto-trained ML models.
