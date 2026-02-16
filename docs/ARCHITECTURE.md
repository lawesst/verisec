# VeriSec Architecture (MVP)

## Core Flow
1. Ingest structured audit data (JSON/SARIF + curated manual submissions).
2. Normalize to the canonical schema and persist to MySQL.
3. Store full artifacts on IPFS and compute Merkle roots for findings.
4. Anchor the Merkle root on Arbitrum with audit metadata.
5. Expose proofs and queries via REST APIs and SDK.

## Components
- API service: ingestion, normalization, proof generation, query endpoints
- Schema package: canonical audit schema and shared types
- SDK: client utilities for querying and verification helpers
- Contracts: lightweight anchor contract for Merkle roots
- Web explorer: audit browsing and verification views

## Trust Model (MVP)
- VeriSec attests to audit integrity and provenance, not correctness.
- Auditors sign normalized findings; VeriSec anchors those signatures.
- On-chain verification proves inclusion of a finding in an anchored audit.
