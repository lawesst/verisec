# Canonical Audit Schema (v1)

## Goals
- Deterministic representation of audit findings
- Machine-readable severity and status fields
- Traceable code references and remediation lifecycle

## Schema File
- `packages/schema/schema/v1/audit.schema.json`

## Leaf Canonicalization
1. Sort findings by `id` ascending (string compare).
2. Canonical JSON serialization:
   - Remove `undefined` fields.
   - Recursively sort object keys lexicographically.
   - Preserve array order.
3. Leaf hash = `keccak256(utf8(canonical_json))`.
4. Merkle tree:
   - Pairwise hashing with sorted pairs (lexicographic by hex).
   - If odd number of leaves, duplicate the last leaf.
   - Parent hash = `keccak256(concat(sorted(left, right)))`.
