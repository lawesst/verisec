# Canonical Audit Schema (v1)

## Goals
- Deterministic representation of audit findings
- Machine-readable severity and status fields
- Traceable code references and remediation lifecycle

## Schema File
- `packages/schema/schema/v1/audit.schema.json`

## Leaf Canonicalization (Draft)
1. Sort findings by `id` ascending.
2. For each finding, serialize a canonical JSON object with stable key ordering.
3. Hash each serialized finding using `keccak256`.
4. Build a Merkle tree with pairwise hashing (sorted pairs) to derive the root.

This is a draft and will be finalized alongside the proof utilities.
