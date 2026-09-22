# ADR-005: Field-Level AES-256-GCM Encryption with HMAC Blind Indexing

## Status
Accepted

## Date
2026-09-21

## Context
Under the *Privacy Act 1988 (Cth)* and *APRA CPS 234*, credit reporting repositories hold sensitive Personally Identifiable Information (PII) that constitutes prime targets for cyber exfiltration. In the event of a database compromise (e.g. stolen database backups or SQL injection vulnerabilities), sensitive fields (such as individual full names, dates of birth, drivers licence numbers, and consumer identifiers) must remain cryptographically secure at rest.

However, credit bureaus require fast, indexed lookups on identifiers (e.g. searching for `IND-8842-1994`). Standard randomized encryption nonces (IVs) yield non-deterministic ciphertexts, making direct SQL index lookups (`SELECT * FROM entities WHERE identifier = ?`) impossible without scanning and decrypting every row in the database.

## Decision
We implemented a two-pillar cryptographic pattern:
1. **Field-Level Encryption via AES-256-GCM**:
   - Every encrypted field generates a fresh, cryptographically random 12-byte initialization vector (`os.urandom(12)`).
   - Encrypts the plaintext using AES-256 in Galois/Counter Mode (GCM), producing ciphertext and a 16-byte authentication tag that guarantees ciphertext integrity.
   - Stored as `Base64(IV + Ciphertext + Tag)`.
2. **Deterministic Search via HMAC-SHA256 Blind Indexing**:
   - A dedicated, high-entropy cryptographic salt (`BLIND_INDEX_SALT`) is maintained separately from the encryption key.
   - An HMAC-SHA256 digest is computed over the normalized plaintext identifier:
     $$\text{Blind Index} = \text{HMAC-SHA256}(\text{Salt}, \text{Normalize}(Identifier))$$
   - The digest is stored in an indexed database column (`identifier_blind_index`).
   - Lookups search by blind index in $O(1)$ time; raw SQL queries never expose cleartext identifiers or deterministic ciphertexts.

## Alternatives Considered
1. **Full Database Transparent Data Encryption (TDE)**:
   - *Rejected*: Protects data at rest on disk, but exposes cleartext data in SQL memory, database query logs, and to database administrators.
2. **Deterministic AES Encryption (ECB or fixed-IV CBC)**:
   - *Rejected*: Highly insecure; identical identifiers produce identical ciphertexts, enabling frequency analysis and rainbow table correlation attacks.

## Consequences
### Positive
- Zero cleartext PII stored in raw database columns.
- Immune to ciphertext tampering via GCM authentication tags.
- $O(1)$ fast indexed lookups for exact match queries without decrypting the dataset.

### Negative / Trade-offs
- Does not support partial-match (`LIKE '%foo%'`) queries without specialized secure enclave search mechanisms.
- Key management: Requires securing both `ENCRYPTION_KEY` and `BLIND_INDEX_SALT`.
