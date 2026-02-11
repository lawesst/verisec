import type { AuditReport, Finding } from "@verisec/schema";

interface AuditListItem {
  auditId: string;
  projectName: string;
  reportDate: string;
  auditorName: string;
  network?: string;
}

interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

interface AuditListResponse {
  items: AuditListItem[];
  pagination: Pagination;
}

interface FindingsResponse {
  items: Finding[];
  pagination: Pagination;
}

const API_BASE_URL = process.env.VERISEC_API_BASE_URL ?? "http://localhost:3000";

function buildUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const res = await fetch(buildUrl(path), { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new Error(`API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function severityTag(severity?: string) {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    case "info":
      return "info";
    default:
      return "muted";
  }
}

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function normalizeUrl(raw?: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes(".")) {
    return `https://${trimmed}`;
  }
  return null;
}

export default async function Page({
  searchParams
}: {
  searchParams?: { audit?: string };
}) {
  let audits: AuditListResponse | null = null;
  let audit: AuditReport | null = null;
  let findings: FindingsResponse | null = null;
  let apiStatus: "online" | "offline" = "online";
  let auditNotFound = false;

  try {
    audits = await fetchJson<AuditListResponse>("/v1/audits?limit=25&offset=0");
  } catch {
    apiStatus = "offline";
  }

  const selectedAuditId = searchParams?.audit ?? audits?.items?.[0]?.auditId;

  if (selectedAuditId && apiStatus === "online") {
    try {
      const [auditResponse, findingsResponse] = await Promise.all([
        fetchJson<AuditReport>(`/v1/audits/${selectedAuditId}`),
        fetchJson<FindingsResponse>(
          `/v1/audits/${selectedAuditId}/findings?limit=50&offset=0`
        )
      ]);
      audit = auditResponse;
      findings = findingsResponse;
      if (!auditResponse) {
        auditNotFound = true;
      }
    } catch {
      apiStatus = "offline";
    }
  }

  const metadataSource =
    audit && typeof audit.metadata === "object" && audit.metadata
      ? (audit.metadata as Record<string, unknown>).source
      : undefined;
  const sourceUrl = normalizeUrl(metadataSource) ?? normalizeUrl(audit?.project.repository);

  const findingsItems = findings?.items ?? [];
  const totalFindings = findings?.pagination.total ?? 0;
  const criticalOpen = findingsItems.filter(
    (finding) => finding.severity === "critical" && finding.status === "open"
  ).length;
  const proofsAvailable = totalFindings;

  return (
    <main>
      <div className="page">
        <section className="hero reveal" style={{ animationDelay: "0.05s" }}>
          <div className="badges">
            <span className="badge">VeriSec Explorer</span>
            <span className="badge">Arbitrum • MVP</span>
            <span className="badge">Live API</span>
          </div>
          <h1>Verifiable audit intelligence, anchored on-chain.</h1>
          <p>
            VeriSec turns static audit PDFs into structured, cryptographically verifiable
            security data. Protocols can gate deployments, governance, and upgrades on real
            findings instead of trust assumptions.
          </p>
          <div className="actions">
            <span className={`status-pill ${apiStatus}`}>
              {apiStatus === "online" ? "API Online" : "API Offline"}
            </span>
            <a className="button" href="#audits">Browse audits</a>
          </div>
        </section>

        <section className="stats reveal" style={{ animationDelay: "0.12s" }}>
          <div className="card">
            <div className="label">Audits anchored</div>
            <div className="value">{audits?.pagination.total ?? 0}</div>
          </div>
          <div className="card">
            <div className="label">Findings tracked</div>
            <div className="value">{totalFindings}</div>
          </div>
          <div className="card">
            <div className="label">Critical open</div>
            <div className="value">{criticalOpen}</div>
          </div>
          <div className="card">
            <div className="label">Proofs available</div>
            <div className="value">{proofsAvailable}</div>
          </div>
        </section>

        <section className="section reveal" style={{ animationDelay: "0.16s" }} id="audits">
          <h2>Audit index</h2>
          {!audits || audits.items.length === 0 ? (
            <div className="notice">
              No audits found. Seed the API with `npm run seed` in `apps/api` and refresh this
              page.
            </div>
          ) : (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Audit ID</th>
                    <th>Project</th>
                    <th>Auditor</th>
                    <th>Network</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.items.map((item) => (
                    <tr
                      key={item.auditId}
                      className={item.auditId === selectedAuditId ? "active" : undefined}
                    >
                      <td>
                        <a href={`/?audit=${item.auditId}#active-audit`}>{item.auditId}</a>
                      </td>
                      <td>{item.projectName}</td>
                      <td>{item.auditorName}</td>
                      <td>{item.network ?? "—"}</td>
                      <td>{formatDate(item.reportDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className="section reveal"
          style={{ animationDelay: "0.2s" }}
          id="active-audit"
        >
          <h2>Active audit</h2>
          {audit ? (
            <div className="grid-2">
              <div className="card">
                <div className="kv">
                  <span>Audit ID</span>
                  <strong>{audit.auditId}</strong>
                </div>
                <div className="kv">
                  <span>Project</span>
                  <strong>{audit.project.name}</strong>
                </div>
                <div className="kv">
                  <span>Auditor</span>
                  <strong>{audit.auditor.name}</strong>
                </div>
                <div className="kv">
                  <span>Report date</span>
                  <strong>{formatDate(audit.reportDate)}</strong>
                </div>
                <div className="kv">
                  <span>Network</span>
                  <strong>{audit.network ?? "—"}</strong>
                </div>
                {audit.artifacts?.reportUrl || sourceUrl ? (
                  <div className="actions" style={{ marginTop: "16px" }}>
                    {audit.artifacts?.reportUrl ? (
                      <a
                        className="button primary"
                        href={audit.artifacts.reportUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View report
                      </a>
                    ) : null}
                    {sourceUrl ? (
                      <a
                        className="button secondary"
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View source
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="codeblock">
                {`Proof endpoint\nGET /v1/audits/${audit.auditId}/findings/${
                  findingsItems[0]?.id ?? "<finding-id>"
                }/proof\n\nArtifacts\n${audit.artifacts?.ipfsCid ?? "ipfs://<cid>"}\n${
                  audit.artifacts?.reportUrl ?? "https://<report-url>"
                }`}
              </div>
            </div>
          ) : auditNotFound ? (
            <div className="notice">
              The selected audit was not found in the API. Check the audit ID or seed data
              again.
            </div>
          ) : (
            <div className="notice">
              Select an audit from the index to see its findings and verification data.
            </div>
          )}
        </section>

        <section className="section reveal" style={{ animationDelay: "0.24s" }}>
          <h2>Findings</h2>
          {!findings || findings.items.length === 0 ? (
            <div className="notice">
              No findings available for this audit yet.
            </div>
          ) : (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Finding</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.items.map((finding) => (
                    <tr key={finding.id}>
                      <td>
                        {finding.title}
                        <br />
                        <small>{finding.id}</small>
                      </td>
                      <td>
                        <span className={`tag ${severityTag(finding.severity)}`}>
                          {finding.severity ?? "unknown"}
                        </span>
                      </td>
                      <td>{finding.status ?? "—"}</td>
                      <td>{finding.affectedContracts?.[0] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section reveal" style={{ animationDelay: "0.28s" }}>
          <h2>Developer integration</h2>
          <div className="grid-2">
            <div className="card">
              <h3>API endpoints</h3>
              <ul className="list">
                <li>POST /v1/audits</li>
                <li>GET /v1/audits</li>
                <li>GET /v1/audits/:auditId</li>
                <li>GET /v1/audits/:auditId/findings</li>
                <li>GET /v1/audits/:auditId/findings/:findingId/proof</li>
              </ul>
            </div>
            <div className="card">
              <h3>SDK usage</h3>
              <div className="codeblock">
                {`const client = new VeriSecClient({ baseUrl: "${API_BASE_URL}" });\nconst audits = await fetch("${API_BASE_URL}/v1/audits");\nconst findings = await client.listFindings("${
                  selectedAuditId ?? "audit-id"
                }");\n`}
              </div>
            </div>
          </div>
        </section>

        <footer className="footer reveal" style={{ animationDelay: "0.32s" }}>
          <span>VeriSec · Security data oracle for Arbitrum</span>
          <span>{apiStatus === "online" ? "Live data" : "Awaiting API"}</span>
        </footer>
      </div>
    </main>
  );
}
