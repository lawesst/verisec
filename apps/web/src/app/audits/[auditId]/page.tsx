"use client";

import Link from "next/link";
import React from "react";
import type { AuditReport, Finding } from "../../../lib/audit";

interface Pagination {
  limit: number;
  offset: number;
  total: number;
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_VERISEC_API_BASE_URL ?? "http://localhost:4010";

function buildUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(buildUrl(path), { cache: "no-store" } as RequestInit);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
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
  if (!txHash) {
    return null;
  }
  switch (chainId) {
    case 421614:
      return `https://sepolia.arbiscan.io/tx/${txHash}`;
    case 42161:
      return `https://arbiscan.io/tx/${txHash}`;
    case 421613:
      return `https://goerli-rollup-explorer.arbitrum.io/tx/${txHash}`;
    default:
      return null;
  }
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

export default function AuditDetailsPage({
  params
}: {
  params: { auditId: string };
}) {
  const auditId = decodeURIComponent(params.auditId);
  const [audit, setAudit] = React.useState<AuditReport | null>(null);
  const [findings, setFindings] = React.useState<FindingsResponse | null>(null);
  const [anchors, setAnchors] = React.useState<AnchorsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const [auditData, findingsData, anchorsData] = await Promise.all([
          fetchJson<AuditReport>(`/v1/audits/${auditId}`),
          fetchJson<FindingsResponse>(`/v1/audits/${auditId}/findings?limit=250&offset=0`),
          fetchJson<AnchorsResponse>(`/v1/audits/${auditId}/anchors`)
        ]);

        if (!active) {
          return;
        }
        setAudit(auditData);
        setFindings(findingsData);
        setAnchors(anchorsData);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError((loadError as Error).message);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [auditId]);

  const metadataSource =
    audit && typeof audit.metadata === "object" && audit.metadata
      ? (audit.metadata as Record<string, unknown>).source
      : undefined;
  const sourceUrl = normalizeUrl(metadataSource) ?? normalizeUrl(audit?.project.repository);
  const findingsItems = findings?.items ?? [];

  return (
    <main>
      <div className="page">
        <header className="topbar reveal" style={{ animationDelay: "0.02s" }}>
          <div className="brand">
            <span className="brand-dot" />
            <span>VeriSec Explorer</span>
          </div>
          <div className="top-actions">
            <Link className="button secondary" href="/">
              Dashboard
            </Link>
          </div>
        </header>

        <section className="hero reveal" style={{ animationDelay: "0.05s" }}>
          <div className="actions">
            <Link className="button" href="/">
              Back to explorer
            </Link>
          </div>
          <h1>Audit details</h1>
          <p>Full report context for `{auditId}` including findings, proofs, and anchor history.</p>
        </section>

        {isLoading ? (
          <div className="notice">Loading audit data…</div>
        ) : error ? (
          <div className="notice">Failed to load audit details: {error}</div>
        ) : !audit ? (
          <div className="notice">Audit not found for `{auditId}`.</div>
        ) : (
          <>
            <section className="section reveal" style={{ animationDelay: "0.12s" }}>
              <h2>Overview</h2>
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
                      <a className="button secondary" href={sourceUrl} target="_blank" rel="noreferrer">
                        View source
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="card">
                  <h3>Anchor history</h3>
                  {!anchors || anchors.items.length === 0 ? (
                    <div className="notice">No anchors yet for this audit.</div>
                  ) : (
                    <div className="stack">
                      {anchors.items.map((anchor) => {
                        const txUrl = explorerTxUrl(anchor.chainId, anchor.txHash);
                        return (
                          <div className="step" key={`${anchor.txHash}-${anchor.merkleRoot}`}>
                            <div className="kv">
                              <span>Chain ID</span>
                              <strong>{anchor.chainId}</strong>
                            </div>
                            <div className="kv">
                              <span>Merkle root</span>
                              <strong className="mono">{anchor.merkleRoot}</strong>
                            </div>
                            <div className="kv">
                              <span>Tx hash</span>
                              <strong className="mono">{anchor.txHash}</strong>
                            </div>
                            <div className="kv">
                              <span>Anchored at</span>
                              <strong>{formatDate(anchor.anchoredAt)}</strong>
                            </div>
                            {txUrl ? (
                              <a className="button secondary" href={txUrl} target="_blank" rel="noreferrer">
                                View transaction
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="section reveal" style={{ animationDelay: "0.2s" }}>
              <h2>Findings ({findings?.pagination.total ?? findingsItems.length})</h2>
              {findingsItems.length === 0 ? (
                <div className="notice">No findings available for this audit.</div>
              ) : (
                <div className="card">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Finding</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Contract</th>
                        <th>Proof</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findingsItems.map((finding) => (
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
                          <td>
                            <a
                              className="button secondary"
                              href={buildUrl(
                                `/v1/audits/${audit.auditId}/findings/${finding.id}/proof`
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View proof
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="section reveal" style={{ animationDelay: "0.28s" }}>
              <h2>Raw payload</h2>
              <div className="codeblock">{JSON.stringify(audit, null, 2)}</div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
