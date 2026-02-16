import "./env.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { Wallet } from "ethers";
import { canonicalAuditMessage } from "@verisec/schema";
import type { AuditReport } from "@verisec/schema";
import { buildApp } from "./app.js";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { computeMerkleRoot } from "./proofs.js";

const app = buildApp();
let fixtureAudit: AuditReport;

before(async () => {
  await runMigrations();
  fixtureAudit = await readFixtureAudit("sample-audit.json");
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await app.close();
  await pool.end();
});

test("POST /v1/auditors and GET /v1/auditors list registered auditors", async () => {
  const auditorWallet = Wallet.createRandom();

  const createResponse = await app.inject({
    method: "POST",
    url: "/v1/auditors",
    payload: {
      address: auditorWallet.address.toLowerCase(),
      name: "Registry Auditor",
      website: "https://registry.example",
      identity: "@registry"
    }
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json() as {
    status: string;
    auditor: { address: string; name: string; active: boolean };
  };
  assert.equal(created.status, "stored");
  assert.equal(created.auditor.address, auditorWallet.address);
  assert.equal(created.auditor.name, "Registry Auditor");
  assert.equal(created.auditor.active, true);

  const listResponse = await app.inject({
    method: "GET",
    url: "/v1/auditors?limit=10&offset=0"
  });

  assert.equal(listResponse.statusCode, 200);
  const listed = listResponse.json() as {
    items: Array<{ address: string; name: string }>;
    pagination: { total: number };
  };
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0]?.address, auditorWallet.address);
  assert.equal(listed.items[0]?.name, "Registry Auditor");
});

test("POST /v1/submissions stores signed audits after verification", async () => {
  const auditorWallet = Wallet.createRandom();
  const audit = buildTestAudit("signed-submission-it", "Submission Auditor");
  const signature = await auditorWallet.signMessage(canonicalAuditMessage(audit));

  const registerAuditorResponse = await app.inject({
    method: "POST",
    url: "/v1/auditors",
    payload: {
      address: auditorWallet.address,
      name: "Submission Auditor",
      active: true
    }
  });
  assert.equal(registerAuditorResponse.statusCode, 200);

  const submitResponse = await app.inject({
    method: "POST",
    url: "/v1/submissions",
    payload: {
      audit,
      signature: {
        signer: auditorWallet.address,
        signature,
        scheme: "eip191",
        signedAt: "2026-02-16T00:00:00.000Z"
      }
    }
  });

  assert.equal(submitResponse.statusCode, 201);
  const submitted = submitResponse.json() as {
    auditId: string;
    signer: string;
    verified: boolean;
    status: string;
  };
  assert.equal(submitted.auditId, audit.auditId);
  assert.equal(submitted.signer, auditorWallet.address);
  assert.equal(submitted.verified, true);
  assert.equal(submitted.status, "stored");

  const auditResponse = await app.inject({
    method: "GET",
    url: `/v1/audits/${audit.auditId}`
  });
  assert.equal(auditResponse.statusCode, 200);

  const storedAudit = auditResponse.json() as AuditReport;
  assert.equal(storedAudit.auditId, audit.auditId);
  assert.equal(storedAudit.signatures?.length, 1);
  assert.equal(storedAudit.signatures?.[0]?.signer, auditorWallet.address);
  assert.equal(storedAudit.signatures?.[0]?.scheme, "eip191");
});

test("GET /v1/audits/:auditId/findings/:findingId/proof returns deterministic root", async () => {
  const audit = buildTestAudit("proof-regression-it", "Proof Auditor");
  const targetFindingId = audit.findings[0]?.id;
  assert.ok(targetFindingId, "fixture must include at least one finding");

  const createAuditResponse = await app.inject({
    method: "POST",
    url: "/v1/audits",
    payload: audit
  });
  assert.equal(createAuditResponse.statusCode, 201);

  const proofResponse = await app.inject({
    method: "GET",
    url: `/v1/audits/${audit.auditId}/findings/${targetFindingId}/proof`
  });

  assert.equal(proofResponse.statusCode, 200);
  const proof = proofResponse.json() as {
    auditId: string;
    findingId: string;
    root: string;
    proof: string[];
    canonicalization?: { sort?: string };
  };
  assert.equal(proof.auditId, audit.auditId);
  assert.equal(proof.findingId, targetFindingId);
  assert.equal(proof.root, computeMerkleRoot(audit));
  assert.ok(Array.isArray(proof.proof));
  assert.ok(proof.proof.length > 0);
  assert.equal(proof.canonicalization?.sort, "finding.id:asc");
});

function buildTestAudit(auditId: string, auditorName: string): AuditReport {
  return {
    ...fixtureAudit,
    auditId,
    auditor: {
      ...fixtureAudit.auditor,
      name: auditorName
    },
    findings: fixtureAudit.findings.map((finding) => ({ ...finding })),
    signatures: undefined
  };
}

async function readFixtureAudit(fileName: string): Promise<AuditReport> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(currentDir, "../fixtures", fileName);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as AuditReport;
}

async function resetDatabase() {
  await pool.query("DELETE FROM audit_anchors");
  await pool.query("DELETE FROM audit_signatures");
  await pool.query("DELETE FROM audit_findings");
  await pool.query("DELETE FROM audits");
  await pool.query("DELETE FROM auditors");
}
