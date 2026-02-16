import "./env.js";
import Fastify from "fastify";
import type { AuditReport } from "@verisec/schema";
import { AuditSchemaId } from "@verisec/schema";
import { getAuditValidator } from "./validation.js";
import {
  insertAudit,
  getAuditRaw,
  listFindings,
  auditExists,
  listAudits,
  insertAnchor,
  listAnchors
} from "./storage.js";
import { runMigrations } from "./migrate.js";
import { buildProofForFinding, computeMerkleRoot } from "./proofs.js";
import { anchorAuditOnChain } from "./anchor.js";

const app = Fastify({ logger: true });
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.options("/*", async (_request, reply) => {
  reply
    .header("Access-Control-Allow-Origin", corsOrigin)
    .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return reply.code(204).send();
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply
    .header("Access-Control-Allow-Origin", corsOrigin)
    .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return payload;
});

app.get("/health", async () => ({ ok: true }));

app.get("/v1/schema", async () => ({ schema: AuditSchemaId }));

app.get("/v1/audits", async (request) => {
  const query = request.query as { limit?: string; offset?: string };
  const limit = clampNumber(query.limit, 20, 1, 200);
  const offset = clampNumber(query.offset, 0, 0, 10_000);

  const { items, total } = await listAudits({ limit, offset });

  return {
    items,
    pagination: {
      limit,
      offset,
      total
    }
  };
});

app.post("/v1/audits", async (request, reply) => {
  const validator = await getAuditValidator();
  const payload = request.body as AuditReport;

  if (!validator(payload)) {
    return reply.code(400).send({
      error: "invalid_audit",
      details: validator.errors
    });
  }

  const result = await insertAudit(payload);

  if (result.exists) {
    return reply.code(409).send({ error: "audit_exists", auditId: payload.auditId });
  }

  return reply.code(201).send({
    auditId: payload.auditId,
    status: "stored"
  });
});

app.get("/v1/audits/:auditId", async (request, reply) => {
  const { auditId } = request.params as { auditId: string };
  const audit = await getAuditRaw(auditId);

  if (!audit) {
    return reply.code(404).send({ error: "not_found" });
  }

  return audit;
});

app.get("/v1/audits/:auditId/findings", async (request, reply) => {
  const { auditId } = request.params as { auditId: string };
  const query = request.query as { limit?: string; offset?: string };

  const limit = clampNumber(query.limit, 50, 1, 200);
  const offset = clampNumber(query.offset, 0, 0, 10_000);

  const { items, total } = await listFindings(auditId, { limit, offset });

  if (total === 0) {
    const exists = await auditExists(auditId);
    if (!exists) {
      return reply.code(404).send({ error: "not_found" });
    }
  }

  return {
    auditId,
    items,
    pagination: {
      limit,
      offset,
      total
    }
  };
});

app.get("/v1/audits/:auditId/findings/:findingId/proof", async (request, reply) => {
  const { auditId, findingId } = request.params as { auditId: string; findingId: string };
  const audit = await getAuditRaw(auditId);

  if (!audit) {
    return reply.code(404).send({ error: "not_found" });
  }

  const proof = buildProofForFinding(audit, findingId);
  if (!proof) {
    return reply.code(404).send({ error: "finding_not_found" });
  }

  return proof;
});

app.post("/v1/audits/:auditId/anchor", async (request, reply) => {
  const { auditId } = request.params as { auditId: string };
  const { uri } = (request.body as { uri?: string }) ?? {};

  const audit = await getAuditRaw(auditId);
  if (!audit) {
    return reply.code(404).send({ error: "not_found" });
  }

  const rpcUrl = process.env.ANCHOR_RPC_URL;
  const privateKey = process.env.ANCHOR_PRIVATE_KEY;
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS;
  const chainId = process.env.ANCHOR_CHAIN_ID
    ? Number(process.env.ANCHOR_CHAIN_ID)
    : undefined;

  if (!rpcUrl || !privateKey || !contractAddress) {
    return reply.code(400).send({
      error: "anchor_config_missing",
      missing: [
        !rpcUrl ? "ANCHOR_RPC_URL" : null,
        !privateKey ? "ANCHOR_PRIVATE_KEY" : null,
        !contractAddress ? "ANCHOR_CONTRACT_ADDRESS" : null
      ].filter(Boolean)
    });
  }

  const merkleRoot = computeMerkleRoot(audit);
  const finalUri = uri ?? audit.artifacts?.reportUrl ?? "";

  const tx = await anchorAuditOnChain(
    { rpcUrl, privateKey, contractAddress, chainId },
    auditId,
    merkleRoot,
    finalUri
  );

  await insertAnchor({
    auditId,
    chainId: tx.chainId,
    contractAddress: tx.contractAddress,
    merkleRoot: tx.merkleRoot,
    txHash: tx.txHash,
    uri: tx.uri,
    anchoredAt: tx.blockTimestamp ? new Date(tx.blockTimestamp * 1000).toISOString() : undefined
  });

  return tx;
});

app.get("/v1/audits/:auditId/anchors", async (request, reply) => {
  const { auditId } = request.params as { auditId: string };
  const audit = await getAuditRaw(auditId);

  if (!audit) {
    return reply.code(404).send({ error: "not_found" });
  }

  const anchors = await listAnchors(auditId);
  return { auditId, items: anchors };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT ?? 3000);
    await runMigrations();
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

function clampNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
