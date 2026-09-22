# ADR-001: Bitemporal Append-Only Credit Ledger

## Status
Accepted

## Date
2026-09-20

## Context
In credit reporting under the Australian *Privacy Act 1988 Part IIIA* and the *Credit Reporting Code 2014*, credit files are frequently subjected to retroactive corrections, delayed dispute resolutions, and legal challenges. When a bank retroactively corrects a default listed six months ago, simply updating the database row destroys historical reality: it becomes impossible to prove what data was visible to a lender on a specific date when an adverse loan decision was made.

A credit bureau must be capable of answering two fundamental questions:
1. What was the true state of a consumer's credit history on date $T_{\text{valid}}$?
2. What did the bureau know and present on system date $T_{\text{recorded}}$?

## Decision
We decided to model all credit events in an **append-only bitemporal ledger** (`models.CreditLedger`) tracking two independent time dimensions:
- **Valid Time** (`valid_from`, `valid_to`): When the financial event was true in the real world.
- **Recorded Time** (`recorded_at`, `superseded_at`): The immutable transaction timestamp when the bureau committed the record.

Mutations are forbidden at the database layer. When a record is corrected, adjudicated under Section 20V, or superseded, the old record has its `superseded_at` set to the current transaction timestamp, and a new record is appended. Queries for historical reports supply an `as_of` timestamp to reconstruct the exact view available at that historical moment.

## Alternatives Considered
1. **Single-timestamp with traditional SQL updates**:
   - *Rejected*: Irretrievably loses previous file states upon update, violating regulatory auditability under Privacy Act Section 20U and APRA CPS 234.
2. **Audit log tables (Change Data Capture)**:
   - *Rejected*: Requires stitching together separate delta logs across multiple tables, introducing high query latency and complexity when reconstructing point-in-time scores.
3. **Event Sourcing with EventStore / Kafka**:
   - *Considered*: Excellent auditability, but adds operational overhead for query-heavy relational joins and scoring aggregations.

## Consequences
### Positive
- Complete historical reproducibility: every score ever generated can be re-calculated at any time.
- Ironclad regulatory compliance: dispute adjudications preserve full chain of custody.
- Append-only semantics minimize deadlocks during concurrent provider ingestion.

### Negative / Trade-offs
- Table storage grows monotonically; requires indexing on `(entity_id, recorded_at, superseded_at)`.
- Query complexity: queries must include temporal filtering conditions (`recorded_at <= :as_of AND (superseded_at IS NULL OR superseded_at > :as_of)`).
