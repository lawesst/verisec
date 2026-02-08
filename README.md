# VeriSec

VeriSec is a security data oracle that converts smart contract audit reports into structured, cryptographically verifiable, and composable on-chain security data.

## Repo Structure
- `apps/api`: REST API for ingestion, querying, and proof retrieval
- `apps/web`: Security explorer frontend
- `packages/schema`: Canonical audit schema and types
- `packages/sdk`: TypeScript SDK
- `contracts`: On-chain security anchor contract
- `docs`: Architecture and schema notes

## Quick Start (Local)
1. Install dependencies at the repo root with your preferred package manager.
2. Run the API in dev mode (once scripts are wired).
3. Run the web app in dev mode (once scripts are wired).

## Database Setup (MVP)
- Create a MySQL database named `verisec`.
- Apply the schema in `apps/api/db/schema.sql`.
- Configure environment variables using `apps/api/.env.example`.
- API auto-runs migrations on boot by default (`DB_AUTO_MIGRATE=true`).

## Seed Data
- `npm run seed` in `apps/api` will load `apps/api/fixtures/sample-audit.json`.

## Web UI
- Configure `apps/web/.env.example` if the API runs on a non-default host.
- UI reads live data from `/v1/audits` and `/v1/audits/:auditId`.

## Status
This repo is an MVP scaffold. Next steps are to finalize the schema, wire ingestion storage, and anchor proofs on Arbitrum.
