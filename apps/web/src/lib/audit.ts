export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "mitigated" | "resolved" | "accepted";

export interface CodeReference {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  commit?: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  description?: string;
  category?: string;
  cwe?: string[];
  affectedContracts?: string[];
  affectedAddresses?: string[];
  codeReferences?: CodeReference[];
  recommendation?: string;
  remediation?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

export interface Auditor {
  name: string;
  website?: string;
  publicKey?: string;
  identity?: string;
}

export interface ProjectMetadata {
  name: string;
  slug?: string;
  repository?: string;
  version?: string;
  contractAddresses?: string[];
}

export interface Signature {
  signer: string;
  signature: string;
  scheme: "eip191" | "eip712" | "pgp" | "other";
  signedAt?: string;
}

export interface AuditReport {
  schemaVersion: string;
  auditId: string;
  project: ProjectMetadata;
  auditor: Auditor;
  reportDate: string;
  commit?: string;
  network?: string;
  artifacts?: {
    ipfsCid?: string;
    reportUrl?: string;
  };
  findings: Finding[];
  signatures?: Signature[];
  metadata?: Record<string, unknown>;
}

export function canonicalAuditMessage(audit: AuditReport): string {
  const { signatures, ...unsignedAudit } = audit;
  return stableStringify(unsignedAudit);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      normalized[key] = normalizeValue(entryValue);
    }
    return normalized;
  }

  return value;
}
