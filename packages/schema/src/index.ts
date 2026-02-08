export const AuditSchemaId = "verisec.audit.v1";

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
  schemaVersion: typeof AuditSchemaId;
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
