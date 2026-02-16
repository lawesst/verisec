"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

interface AnchorRecord {
  auditId: string;
  chainId: number;
  contractAddress: string;
  merkleRoot: string;
  txHash: string;
  uri?: string;
  anchoredAt?: string;
}

interface AnchorsResponse {
  auditId: string;
  items: AnchorRecord[];
}

interface AnchorActionResult {
  auditId: string;
  merkleRoot: string;
  txHash: string;
  chainId: number;
  contractAddress: string;
  uri: string;
  anchoredAt?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_VERISEC_API_BASE_URL ?? "http://localhost:4010";

function buildUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

async function postJson<T>(
  path: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let message = `API error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) {
          message = body.error;
        }
      } catch {
        // ignore JSON parse errors
      }
      return { ok: false, error: message };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const res = await fetch(buildUrl(path), { cache: "no-store" } as any);
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

function explorerTxUrl(chainId: number | undefined, txHash: string): string | null {
  if (!txHash) return null;
  switch (chainId) {
    case 421614: // Arbitrum Sepolia
      return `https://sepolia.arbiscan.io/tx/${txHash}`;
    case 42161: // Arbitrum One
      return `https://arbiscan.io/tx/${txHash}`;
    case 421613: // Arbitrum Goerli (legacy)
      return `https://goerli-rollup-explorer.arbitrum.io/tx/${txHash}`;
    default:
      return null;
  }
}

function PageInner() {
  const searchParams = useSearchParams();
  const auditParam = searchParams?.get("audit") ?? undefined;
  return <ClientPage auditParam={auditParam} />;
}

export default function Page() {
  return (
    <Suspense fallback={<main><div className="page"><div className="notice">Loading…</div></div></main>}>
      <PageInner />
    </Suspense>
  );
}

function ClientPage({ auditParam }: { auditParam?: string }) {
  const [audits, setAudits] = React.useState<AuditListResponse | null>(null);
  const [audit, setAudit] = React.useState<AuditReport | null>(null);
  const [findings, setFindings] = React.useState<FindingsResponse | null>(null);
  const [anchors, setAnchors] = React.useState<AnchorsResponse | null>(null);
  const [apiStatus, setApiStatus] = React.useState<"online" | "offline">("online");
  const [auditNotFound, setAuditNotFound] = React.useState(false);
  const [anchorStatus, setAnchorStatus] = React.useState<
    "idle" | "anchoring" | "success" | "error"
  >("idle");
  const [anchorError, setAnchorError] = React.useState<string | null>(null);

  const selectedAuditId = auditParam ?? audits?.items?.[0]?.auditId;

  React.useEffect(() => {
    let active = true;

    async function loadAudits() {
      try {
        const data = await fetchJson<AuditListResponse>("/v1/audits?limit=25&offset=0");
        if (!active) return;
        setAudits(data);
        setApiStatus("online");
      } catch {
        if (!active) return;
        setApiStatus("offline");
      }
    }

    loadAudits();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;

    if (!selectedAuditId || apiStatus !== "online") {
      setAudit(null);
      setFindings(null);
      setAnchors(null);
      setAuditNotFound(false);
      return;
    }

    async function loadAudit() {
      try {
        const [auditResponse, findingsResponse, anchorsResponse] = await Promise.all([
          fetchJson<AuditReport>(`/v1/audits/${selectedAuditId}`),
          fetchJson<FindingsResponse>(
            `/v1/audits/${selectedAuditId}/findings?limit=50&offset=0`
          ),
          fetchJson<AnchorsResponse>(`/v1/audits/${selectedAuditId}/anchors`)
        ]);
        if (!active) return;
        setAudit(auditResponse);
        setFindings(findingsResponse);
        setAnchors(anchorsResponse);
        setAuditNotFound(Boolean(!auditResponse));
      } catch {
        if (!active) return;
        setApiStatus("offline");
      }
    }

    loadAudit();
    return () => {
      active = false;
    };
  }, [selectedAuditId, apiStatus]);

  React.useEffect(() => {
    setAnchorStatus("idle");
    setAnchorError(null);
  }, [selectedAuditId]);

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
  const latestAnchor = anchors?.items?.[0] ?? null;
  const latestAnchorExplorerUrl = latestAnchor
    ? explorerTxUrl(latestAnchor.chainId, latestAnchor.txHash)
    : null;

  async function handleAnchor() {
    if (!selectedAuditId) return;
    setAnchorStatus("anchoring");
    setAnchorError(null);

    const response = await postJson<AnchorActionResult>(
      `/v1/audits/${selectedAuditId}/anchor`,
      { uri: audit?.artifacts?.ipfsCid ?? audit?.artifacts?.reportUrl ?? "" }
    );

    if (!response.ok || !response.data) {
      setAnchorStatus("error");
      setAnchorError(response.error ?? "Anchor failed");
      return;
    }

    setAnchorStatus("success");

    const refreshed = await fetchJson<AnchorsResponse>(
      `/v1/audits/${selectedAuditId}/anchors`
    );
    setAnchors(refreshed);
  }

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
              <div className="card">
                <h3>On-chain anchor</h3>
                {latestAnchor ? (
                  <div className="stack">
                    <div className="kv">
                      <span>Status</span>
                      <strong>Anchored</strong>
                    </div>
                    <div className="kv">
                      <span>Chain ID</span>
                      <strong>{latestAnchor.chainId}</strong>
                    </div>
                    <div className="kv">
                      <span>Contract</span>
                      <strong>{latestAnchor.contractAddress}</strong>
                    </div>
                    <div className="kv">
                      <span>Merkle root</span>
                      <strong className="mono">{latestAnchor.merkleRoot}</strong>
                    </div>
                    <div className="kv">
                      <span>Tx hash</span>
                      <strong className="mono">{latestAnchor.txHash}</strong>
                    </div>
                    <div className="kv">
                      <span>Anchored at</span>
                      <strong>{formatDate(latestAnchor.anchoredAt)}</strong>
                    </div>
                    {latestAnchor.uri ? (
                      <div className="kv">
                        <span>URI</span>
                        <strong className="mono">{latestAnchor.uri}</strong>
                      </div>
                    ) : null}
                    {latestAnchorExplorerUrl ? (
                      <div className="kv">
                        <span>Explorer</span>
                        <a
                          className="button secondary"
                          href={latestAnchorExplorerUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View transaction
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="notice">
                    No on-chain anchor yet. Use the button below to anchor this audit.
                  </div>
                )}
                <div className="actions" style={{ marginTop: "16px" }}>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleAnchor}
                    disabled={anchorStatus === "anchoring" || apiStatus === "offline"}
                  >
                    {anchorStatus === "anchoring" ? "Anchoring..." : "Anchor on-chain"}
                  </button>
                  {anchorStatus === "success" ? (
                    <span className="status-pill online">Anchor submitted</span>
                  ) : null}
                  {anchorStatus === "error" ? (
                    <span className="status-pill offline">
                      {anchorError ?? "Anchor failed"}
                    </span>
                  ) : null}
                </div>
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
            <div className="notice">No findings available for this audit yet.</div>
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
                <li>POST /v1/audits/:auditId/anchor</li>
                <li>GET /v1/audits/:auditId/anchors</li>
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
          <span>VeriSec Explorer • MVP build</span>
          <span>Anchored security data for Arbitrum protocols.</span>
        </footer>
      </div>
    </main>
  );
}
