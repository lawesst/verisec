import Fastify from "fastify";
import type { AuditReport } from "@verisec/schema";
import { AuditSchemaId } from "@verisec/schema";
import { getAuditValidator } from "./validation.js";
import {
  insertAudit,
  getAuditRaw,
  listFindings,
  auditExists,
  listAudits
} from "./storage.js";
import { runMigrations } from "./migrate.js";

const app = Fastify({ logger: true });

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

app.get("/v1/audits/:auditId/findings/:findingId/proof", async (request) => {
  const { auditId, findingId } = request.params as { auditId: string; findingId: string };
  return { auditId, findingId, proof: [] };
});

const start = async () => {
  try {
    await runMigrations();
    await app.listen({ port: 3000, host: "0.0.0.0" });
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
