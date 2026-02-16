import type { AuditReport, Finding, Signature } from "@verisec/schema";
import { pool } from "./db.js";

export interface ListFindingsOptions {
  limit: number;
  offset: number;
}

export interface ListAuditsOptions {
  limit: number;
  offset: number;
}

export interface AuditListItem {
  auditId: string;
  projectName: string;
  reportDate: string;
  auditorName: string;
  network?: string;
  createdAt?: string;
}

export interface AnchorRecord {
  auditId: string;
  chainId: number;
  contractAddress: string;
  merkleRoot: string;
  txHash: string;
  uri?: string;
  anchoredAt?: string;
}

export interface AuditorRecord {
  address: string;
  name: string;
  website?: string;
  identity?: string;
  publicKey?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListAuditorsOptions {
  limit: number;
  offset: number;
}

export async function insertAudit(report: AuditReport): Promise<{ exists: boolean }> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      "SELECT audit_id FROM audits WHERE audit_id = ? LIMIT 1",
      [report.auditId]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      await connection.rollback();
      return { exists: true };
    }

    await connection.execute(
      `INSERT INTO audits (
        audit_id,
        schema_version,
        report_date,
        project_name,
        project_slug,
        project_repository,
        project_version,
        project_contract_addresses,
        auditor_name,
        auditor_website,
        auditor_public_key,
        auditor_identity,
        commit_hash,
        network,
        artifacts_ipfs_cid,
        artifacts_report_url,
        metadata,
        raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
      [
        report.auditId,
        report.schemaVersion,
        report.reportDate,
        report.project.name,
        report.project.slug ?? null,
        report.project.repository ?? null,
        report.project.version ?? null,
        jsonOrNull(report.project.contractAddresses),
        report.auditor.name,
        report.auditor.website ?? null,
        report.auditor.publicKey ?? null,
        report.auditor.identity ?? null,
        report.commit ?? null,
        report.network ?? null,
        report.artifacts?.ipfsCid ?? null,
        report.artifacts?.reportUrl ?? null,
        jsonOrNull(report.metadata),
        jsonOrNull(report)
      ]
    );

    for (const finding of report.findings) {
      await insertFinding(connection, report.auditId, finding);
    }

    if (report.signatures) {
      for (const signature of report.signatures) {
        await insertSignature(connection, report.auditId, signature);
      }
    }

    await connection.commit();
    return { exists: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteAudit(auditId: string): Promise<void> {
  await pool.execute("DELETE FROM audits WHERE audit_id = ?", [auditId]);
}

export async function getAuditRaw(auditId: string): Promise<AuditReport | null> {
  const [rows] = await pool.execute(
    "SELECT raw_json FROM audits WHERE audit_id = ? LIMIT 1",
    [auditId]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const raw = (rows[0] as { raw_json: unknown }).raw_json;

  if (!raw) {
    return null;
  }

  if (typeof raw === "string") {
    return JSON.parse(raw) as AuditReport;
  }

  return raw as AuditReport;
}

export async function auditExists(auditId: string): Promise<boolean> {
  const [rows] = await pool.execute(
    "SELECT audit_id FROM audits WHERE audit_id = ? LIMIT 1",
    [auditId]
  );

  return Array.isArray(rows) && rows.length > 0;
}

export async function listAudits(
  options: ListAuditsOptions
): Promise<{ items: AuditListItem[]; total: number }> {
  const [countRows] = await pool.execute("SELECT COUNT(*) as total FROM audits");

  const total =
    Array.isArray(countRows) && countRows.length > 0
      ? Number((countRows[0] as { total: string | number }).total)
      : 0;

  if (total === 0) {
    return { items: [], total };
  }

  const limit = sanitizeLimit(options.limit, 200, 20);
  const offset = sanitizeOffset(options.offset, 10_000);

  const [rows] = await pool.query(
    `SELECT
        audit_id,
        project_name,
        report_date,
        auditor_name,
        network,
        created_at
     FROM audits
     ORDER BY report_date DESC, created_at DESC
     LIMIT ${limit}
     OFFSET ${offset}`
  );

  const items = Array.isArray(rows)
    ? rows.map((row) => mapAuditListItem(row as Record<string, unknown>))
    : [];

  return { items, total };
}

export async function listFindings(
  auditId: string,
  options: ListFindingsOptions
): Promise<{ items: Finding[]; total: number }> {
  const [countRows] = await pool.execute(
    "SELECT COUNT(*) as total FROM audit_findings WHERE audit_id = ?",
    [auditId]
  );

  const total =
    Array.isArray(countRows) && countRows.length > 0
      ? Number((countRows[0] as { total: string | number }).total)
      : 0;

  if (total === 0) {
    return { items: [], total };
  }

  const limit = sanitizeLimit(options.limit, 200, 50);
  const offset = sanitizeOffset(options.offset, 10_000);

  const [rows] = await pool.query(
    `SELECT
        finding_id,
        title,
        severity,
        status,
        description,
        category,
        cwe,
        affected_contracts,
        affected_addresses,
        code_references,
        recommendation,
        remediation,
        finding_created_at,
        finding_updated_at,
        tags
     FROM audit_findings
     WHERE audit_id = ?
     ORDER BY finding_id ASC
     LIMIT ${limit}
     OFFSET ${offset}`,
    [auditId]
  );

  const items = Array.isArray(rows)
    ? rows.map((row) => mapFinding(row as Record<string, unknown>))
    : [];

  return { items, total };
}

export async function insertAnchor(record: AnchorRecord) {
  await pool.execute(
    `INSERT INTO audit_anchors (
      audit_id,
      chain_id,
      contract_address,
      merkle_root,
      tx_hash,
      uri,
      anchored_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.auditId,
      record.chainId,
      record.contractAddress,
      record.merkleRoot,
      record.txHash,
      record.uri ?? null,
      toMysqlDateTime(record.anchoredAt)
    ]
  );
}

export async function listAnchors(auditId: string): Promise<AnchorRecord[]> {
  const [rows] = await pool.execute(
    `SELECT
        audit_id,
        chain_id,
        contract_address,
        merkle_root,
        tx_hash,
        uri,
        anchored_at
     FROM audit_anchors
     WHERE audit_id = ?
     ORDER BY created_at DESC`,
    [auditId]
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    auditId: String((row as Record<string, unknown>).audit_id),
    chainId: Number((row as Record<string, unknown>).chain_id),
    contractAddress: String((row as Record<string, unknown>).contract_address),
    merkleRoot: String((row as Record<string, unknown>).merkle_root),
    txHash: String((row as Record<string, unknown>).tx_hash),
    uri: (row as Record<string, unknown>).uri
      ? String((row as Record<string, unknown>).uri)
      : undefined,
    anchoredAt: toIsoDateTime((row as Record<string, unknown>).anchored_at)
  }));
}

export async function upsertAuditor(record: AuditorRecord): Promise<AuditorRecord> {
  await pool.execute(
    `INSERT INTO auditors (
      address,
      name,
      website,
      identity,
      public_key,
      active
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      website = VALUES(website),
      identity = VALUES(identity),
      public_key = VALUES(public_key),
      active = VALUES(active)`,
    [
      record.address,
      record.name,
      record.website ?? null,
      record.identity ?? null,
      record.publicKey ?? null,
      record.active ? 1 : 0
    ]
  );

  const stored = await getAuditorByAddress(record.address);
  if (!stored) {
    throw new Error("failed_to_persist_auditor");
  }
  return stored;
}

export async function getAuditorByAddress(address: string): Promise<AuditorRecord | null> {
  const [rows] = await pool.execute(
    `SELECT
      address,
      name,
      website,
      identity,
      public_key,
      active,
      created_at,
      updated_at
    FROM auditors
    WHERE address = ?
    LIMIT 1`,
    [address]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return mapAuditorRecord(rows[0] as Record<string, unknown>);
}

export async function listAuditors(
  options: ListAuditorsOptions
): Promise<{ items: AuditorRecord[]; total: number }> {
  const [countRows] = await pool.execute("SELECT COUNT(*) as total FROM auditors");
  const total =
    Array.isArray(countRows) && countRows.length > 0
      ? Number((countRows[0] as { total: string | number }).total)
      : 0;

  if (total === 0) {
    return { items: [], total };
  }

  const limit = sanitizeLimit(options.limit, 200, 20);
  const offset = sanitizeOffset(options.offset, 10_000);

  const [rows] = await pool.query(
    `SELECT
      address,
      name,
      website,
      identity,
      public_key,
      active,
      created_at,
      updated_at
    FROM auditors
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}`
  );

  if (!Array.isArray(rows)) {
    return { items: [], total };
  }

  return {
    items: rows.map((row) => mapAuditorRecord(row as Record<string, unknown>)),
    total
  };
}
async function insertFinding(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  auditId: string,
  finding: Finding
) {
  await connection.execute(
    `INSERT INTO audit_findings (
      audit_id,
      finding_id,
      title,
      severity,
      status,
      description,
      category,
      cwe,
      affected_contracts,
      affected_addresses,
      code_references,
      recommendation,
      remediation,
      finding_created_at,
      finding_updated_at,
      tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      auditId,
      finding.id,
      finding.title,
      finding.severity,
      finding.status,
      finding.description ?? null,
      finding.category ?? null,
      jsonOrNull(finding.cwe),
      jsonOrNull(finding.affectedContracts),
      jsonOrNull(finding.affectedAddresses),
      jsonOrNull(finding.codeReferences),
      finding.recommendation ?? null,
      finding.remediation ?? null,
      toMysqlDateTime(finding.createdAt),
      toMysqlDateTime(finding.updatedAt),
      jsonOrNull(finding.tags)
    ]
  );
}

async function insertSignature(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  auditId: string,
  signature: Signature
) {
  await connection.execute(
    `INSERT INTO audit_signatures (
      audit_id,
      signer,
      signature,
      scheme,
      signed_at
    ) VALUES (?, ?, ?, ?, ?)`
    ,
    [
      auditId,
      signature.signer,
      signature.signature,
      signature.scheme,
      toMysqlDateTime(signature.signedAt)
    ]
  );
}

function jsonOrNull(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

function sanitizeLimit(value: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function sanitizeOffset(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function toMysqlDateTime(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toIsoDateTime(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  const text = typeof value === "string" ? value : String(value);
  const withZulu = text.includes("T") ? text : `${text}Z`;
  const date = new Date(withZulu);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function mapFinding(row: Record<string, unknown>): Finding {
  return {
    id: String(row.finding_id),
    title: String(row.title),
    severity: String(row.severity) as Finding["severity"],
    status: String(row.status) as Finding["status"],
    description: row.description ? String(row.description) : undefined,
    category: row.category ? String(row.category) : undefined,
    cwe: parseJson<string[]>(row.cwe),
    affectedContracts: parseJson<string[]>(row.affected_contracts),
    affectedAddresses: parseJson<string[]>(row.affected_addresses),
    codeReferences: parseJson<Finding["codeReferences"]>(row.code_references),
    recommendation: row.recommendation ? String(row.recommendation) : undefined,
    remediation: row.remediation ? String(row.remediation) : undefined,
    createdAt: toIsoDateTime(row.finding_created_at),
    updatedAt: toIsoDateTime(row.finding_updated_at),
    tags: parseJson<string[]>(row.tags)
  };
}

function mapAuditListItem(row: Record<string, unknown>): AuditListItem {
  return {
    auditId: String(row.audit_id),
    projectName: String(row.project_name),
    reportDate: String(row.report_date),
    auditorName: String(row.auditor_name),
    network: row.network ? String(row.network) : undefined,
    createdAt: toIsoDateTime(row.created_at)
  };
}

function mapAuditorRecord(row: Record<string, unknown>): AuditorRecord {
  return {
    address: String(row.address),
    name: String(row.name),
    website: row.website ? String(row.website) : undefined,
    identity: row.identity ? String(row.identity) : undefined,
    publicKey: row.public_key ? String(row.public_key) : undefined,
    active: Number(row.active) === 1,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at)
  };
}
