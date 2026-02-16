# VeriSec

VeriSec converts smart contract audit reports into structured, cryptographically verifiable, and composable security data for Arbitrum.

The project provides:
- A REST API for audit ingestion, querying, Merkle proof generation, and on-chain anchoring
- A web explorer for live audit/finding/anchor visibility
- A canonical schema package shared across services
- A lightweight `SecurityAnchor` contract

## Repository Layout

- `apps/api` Fastify API + MySQL persistence + Merkle proofs + anchor integration
- `apps/web` Next.js explorer UI
- `packages/schema` Canonical schema and shared TypeScript types
- `packages/sdk` SDK scaffold
- `contracts` Hardhat project with `SecurityAnchor.sol`
- `docs` Architecture and schema notes

## Current Status

Implemented:
- Audit ingestion and JSON schema validation
- MySQL storage with auto-migrate on boot
- Findings listing with pagination
- Merkle root/proof generation and proof endpoint
- On-chain anchor endpoint + anchor history endpoint
- Explorer UI with live API data and anchor status/action panel
- Seed fixtures (sample + real audits)

Not implemented yet:
- Auditor registry flows
- GraphQL/webhooks
- Full automated test suite and CI hardening

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for local MySQL)

## Local Setup

### 1. Install dependencies

```bash
cd "/Users/vicgunga/Documents/New project"
npm install
```

### 2. Start MySQL (Docker)

If container already exists:

```bash
docker start verisec-mysql
```

If not created yet:

```bash
docker run --name verisec-mysql \
  -e MYSQL_ROOT_PASSWORD=verisec \
  -e MYSQL_DATABASE=verisec \
  -p 3307:3306 \
  -d mysql:8
```

### 3. Configure environment files

`apps/api/.env.local`

```env
PORT=4010
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=verisec
DB_NAME=verisec
DB_AUTO_MIGRATE=true
CORS_ORIGIN=http://localhost:3005
ANCHOR_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ANCHOR_PRIVATE_KEY=0xYOUR_KEY
ANCHOR_CONTRACT_ADDRESS=0x9b5E880FA18b1d31b44fa736f2eaeD9013E2a36C
ANCHOR_CHAIN_ID=421614
```

`apps/web/.env.local`

```env
PORT=3005
NEXT_PUBLIC_VERISEC_API_BASE_URL=http://localhost:4010
```

### 4. Run API

```bash
cd "/Users/vicgunga/Documents/New project/apps/api"
npm run dev
```

### 5. Seed data

```bash
cd "/Users/vicgunga/Documents/New project/apps/api"
npm run seed:all
# or refresh existing seeded audits
npm run seed:refresh
```

### 6. Run web

```bash
cd "/Users/vicgunga/Documents/New project/apps/web"
npm run dev
```

Open:
- Web: `http://localhost:3005`
- API health: `http://localhost:4010/health`

## API Endpoints

- `GET /health`
- `GET /v1/schema`
- `GET /v1/audits`
- `POST /v1/audits`
- `GET /v1/audits/:auditId`
- `GET /v1/audits/:auditId/findings`
- `GET /v1/audits/:auditId/findings/:findingId/proof`
- `POST /v1/audits/:auditId/anchor`
- `GET /v1/audits/:auditId/anchors`

Anchor example:

```bash
curl -X POST "http://localhost:4010/v1/audits/camelot-router-bailsec/anchor" \
  -H "content-type: application/json" \
  -d '{"uri":"ipfs://example"}'
```

## Contract Deployment

From `contracts`:

```bash
cd "/Users/vicgunga/Documents/New project/contracts"
npm install

export ARB_RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
export DEPLOYER_PRIVATE_KEY="0xYOUR_KEY"
npm run deploy:sepolia
```

For Arbitrum One:

```bash
export ARB_ONE_RPC_URL="https://arb1-rpc"
export DEPLOYER_PRIVATE_KEY="0xYOUR_KEY"
npm run deploy:arb
```

## Notes

- Do not commit private keys or `.env.local` files.
- If you see `anchor_config_missing`, check `ANCHOR_*` vars and restart API.
- If you see `ECONNREFUSED 127.0.0.1:3307`, MySQL container is not running.
- If ports are busy, inspect with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/SCHEMA.md`
- `packages/schema/schema/v1/audit.schema.json`
