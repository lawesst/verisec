# VeriSec

VeriSec turns smart contract audit reports into structured, verifiable security data.

## Repo

- `apps/api` REST API + MySQL + proof + anchor endpoints
- `apps/web` Explorer UI
- `packages/schema` Shared schema/types
- `contracts` `SecurityAnchor` contract

## Quick Start

1. Install dependencies

```bash
cd "/Users/vicgunga/Documents/New project"
npm install
```

2. Start MySQL

```bash
docker start verisec-mysql
```

If container does not exist yet:

```bash
docker run --name verisec-mysql \
  -e MYSQL_ROOT_PASSWORD=verisec \
  -e MYSQL_DATABASE=verisec \
  -p 3307:3306 \
  -d mysql:8
```

3. Create env files

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

# Optional: required only for on-chain anchoring
ANCHOR_RPC_URL=
ANCHOR_PRIVATE_KEY=
ANCHOR_CONTRACT_ADDRESS=
ANCHOR_CHAIN_ID=
```

`apps/web/.env.local`

```env
PORT=3005
NEXT_PUBLIC_VERISEC_API_BASE_URL=http://localhost:4010
```

4. Start API

```bash
cd "/Users/vicgunga/Documents/New project/apps/api"
npm run dev
```

5. Seed audits

```bash
cd "/Users/vicgunga/Documents/New project/apps/api"
npm run seed:all
```

6. Start web

```bash
cd "/Users/vicgunga/Documents/New project/apps/web"
npm run dev
```

Open:
- `http://localhost:3005`
- `http://localhost:4010/health`

## Main API Routes

- `GET /v1/audits`
- `POST /v1/audits`
- `GET /v1/audits/:auditId`
- `GET /v1/audits/:auditId/findings`
- `GET /v1/audits/:auditId/findings/:findingId/proof`
- `POST /v1/audits/:auditId/anchor`
- `GET /v1/audits/:auditId/anchors`
