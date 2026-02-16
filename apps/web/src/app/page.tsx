"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { canonicalAuditMessage } from "../lib/audit";
import type { AuditReport, Finding } from "../lib/audit";

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

interface AuditorRecord {
  address: string;
  name: string;
  website?: string;
  identity?: string;
  publicKey?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface AuditorsResponse {
  items: AuditorRecord[];
  pagination: Pagination;
}

interface AuditorUpsertResponse {
  status: "stored";
  auditor: AuditorRecord;
}

interface SubmissionResponse {
  auditId: string;
  signer: string;
  verified: boolean;
  status: "stored";
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_VERISEC_API_BASE_URL ?? "http://localhost:4010";

interface EthereumProvider {
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  request: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const win = window as Window & {
    ethereum?: EthereumProvider;
    okxwallet?: { ethereum?: EthereumProvider };
    phantom?: { ethereum?: EthereumProvider };
    coinbaseWalletExtension?: EthereumProvider;
  };

  const candidates: EthereumProvider[] = [];
  if (Array.isArray(win.ethereum?.providers)) {
    candidates.push(...win.ethereum.providers);
  }
  if (win.ethereum) {
    candidates.push(win.ethereum);
  }
  if (win.coinbaseWalletExtension) {
    candidates.push(win.coinbaseWalletExtension);
  }
  if (win.okxwallet?.ethereum) {
    candidates.push(win.okxwallet.ethereum);
  }
  if (win.phantom?.ethereum) {
    candidates.push(win.phantom.ethereum);
  }

  return candidates.find((provider) => typeof provider?.request === "function") ?? null;
}

function toWalletErrorMessage(error: unknown): string {
  const err = error as { code?: number; message?: string } | undefined;
  if (!err) {
    return "wallet_sign_failed";
  }

  if (err.code === 4001) {
    return "Signature request was rejected in wallet.";
  }
  if (err.code === -32002) {
    return "Wallet request already pending. Open your wallet and approve it.";
  }

  return err.message ?? "wallet_sign_failed";
}

async function requestPersonalSignature(
  provider: EthereumProvider,
  message: string,
  signer: string
): Promise<string> {
  try {
    return (await provider.request({
      method: "personal_sign",
      params: [message, signer]
    })) as string;
  } catch (firstError) {
    try {
      return (await provider.request({
        method: "personal_sign",
        params: [signer, message]
      })) as string;
    } catch {
      throw firstError;
    }
  }
}

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
  const [auditors, setAuditors] = React.useState<AuditorsResponse | null>(null);
  const [apiStatus, setApiStatus] = React.useState<"online" | "offline">("online");
  const [auditNotFound, setAuditNotFound] = React.useState(false);
  const [anchorStatus, setAnchorStatus] = React.useState<
    "idle" | "anchoring" | "success" | "error"
  >("idle");
  const [anchorError, setAnchorError] = React.useState<string | null>(null);
  const [auditorStatus, setAuditorStatus] = React.useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [auditorError, setAuditorError] = React.useState<string | null>(null);
  const [auditorForm, setAuditorForm] = React.useState({
    address: "",
    name: "",
    website: "",
    identity: "",
    publicKey: "",
    active: true
  });
  const [submissionAuditJson, setSubmissionAuditJson] = React.useState<string>("");
  const [submissionSigner, setSubmissionSigner] = React.useState<string>("");
  const [submissionSignature, setSubmissionSignature] = React.useState<string>("");
  const [submissionScheme, setSubmissionScheme] = React.useState<string>("eip191");
  const [submissionSignedAt, setSubmissionSignedAt] = React.useState<string>("");
  const [submissionStatus, setSubmissionStatus] = React.useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = React.useState<SubmissionResponse | null>(
    null
  );
  const [walletStatus, setWalletStatus] = React.useState<
    "idle" | "signing" | "success" | "error"
  >("idle");
  const [walletError, setWalletError] = React.useState<string | null>(null);

  const selectedAuditId = auditParam ?? audits?.items?.[0]?.auditId;

  React.useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [auditsData, auditorsData] = await Promise.all([
          fetchJson<AuditListResponse>("/v1/audits?limit=25&offset=0"),
          fetchJson<AuditorsResponse>("/v1/auditors?limit=50&offset=0")
        ]);
        if (!active) return;
        setAudits(auditsData);
        setAuditors(auditorsData);
        setApiStatus("online");
      } catch {
        if (!active) return;
        setApiStatus("offline");
      }
    }

    bootstrap();
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

  async function refreshAuditors() {
    try {
      const refreshed = await fetchJson<AuditorsResponse>("/v1/auditors?limit=50&offset=0");
      setAuditors(refreshed);
    } catch {
      setApiStatus("offline");
    }
  }

  async function refreshAudits() {
    try {
      const refreshed = await fetchJson<AuditListResponse>("/v1/audits?limit=25&offset=0");
      setAudits(refreshed);
    } catch {
      setApiStatus("offline");
    }
  }

  async function handleAuditorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuditorStatus("saving");
    setAuditorError(null);

    const response = await postJson<AuditorUpsertResponse>("/v1/auditors", {
      address: auditorForm.address.trim(),
      name: auditorForm.name.trim(),
      website: auditorForm.website.trim() || undefined,
      identity: auditorForm.identity.trim() || undefined,
      publicKey: auditorForm.publicKey.trim() || undefined,
      active: auditorForm.active
    });

    if (!response.ok || !response.data) {
      setAuditorStatus("error");
      setAuditorError(response.error ?? "Failed to save auditor");
      return;
    }

    setAuditorStatus("success");
    await refreshAuditors();
  }

  function parseSubmissionAudit(): AuditReport | null {
    try {
      return JSON.parse(submissionAuditJson) as AuditReport;
    } catch {
      setSubmissionStatus("error");
      setSubmissionError("Audit JSON is not valid JSON.");
      return null;
    }
  }

  async function submitSignedAudit(
    parsedAudit: AuditReport,
    signaturePayload: {
      signer: string;
      signature: string;
      scheme: string;
      signedAt?: string;
    }
  ) {
    const response = await postJson<SubmissionResponse>("/v1/submissions", {
      audit: parsedAudit,
      signature: signaturePayload
    });

    if (!response.ok || !response.data) {
      setSubmissionStatus("error");
      setSubmissionError(response.error ?? "Submission failed");
      return;
    }

    setSubmissionStatus("success");
    setSubmissionResult(response.data);
    await refreshAudits();
  }

  async function handleSubmissionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionStatus("submitting");
    setSubmissionError(null);
    setSubmissionResult(null);
    setWalletStatus("idle");
    setWalletError(null);

    const parsedAudit = parseSubmissionAudit();
    if (!parsedAudit) {
      return;
    }

    await submitSignedAudit(parsedAudit, {
      signer: submissionSigner.trim(),
      signature: submissionSignature.trim(),
      scheme: submissionScheme.trim() || "eip191",
      signedAt: submissionSignedAt.trim() || undefined
    });
  }

  async function handleWalletSignAndSubmit() {
    setSubmissionStatus("submitting");
    setSubmissionError(null);
    setSubmissionResult(null);
    setWalletStatus("signing");
    setWalletError(null);

    const parsedAudit = parseSubmissionAudit();
    if (!parsedAudit) {
      setWalletStatus("error");
      setWalletError("Audit JSON is not valid JSON.");
      return;
    }

    if (typeof window === "undefined") {
      setSubmissionStatus("error");
      setSubmissionError("Wallet signing is only available in browser context.");
      setWalletStatus("error");
      setWalletError("browser_context_required");
      return;
    }

    const provider = getInjectedProvider();
    if (!provider) {
      setSubmissionStatus("error");
      setSubmissionError(
        "No wallet provider detected. Install MetaMask/Rabby/Coinbase Wallet (or open this page inside a wallet browser), then refresh."
      );
      setWalletStatus("error");
      setWalletError("wallet_not_found");
      return;
    }

    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts"
      })) as string[];
      const signer = accounts?.[0];
      if (!signer) {
        throw new Error("wallet_no_accounts");
      }

      const message = canonicalAuditMessage(parsedAudit);
      const signature = await requestPersonalSignature(provider, message, signer);
      const signedAt = new Date().toISOString();

      setSubmissionSigner(signer);
      setSubmissionSignature(signature);
      setSubmissionScheme("eip191");
      setSubmissionSignedAt(signedAt);

      await submitSignedAudit(parsedAudit, {
        signer,
        signature,
        scheme: "eip191",
        signedAt
      });

      setWalletStatus("success");
    } catch (error) {
      const message = toWalletErrorMessage(error);
      setSubmissionStatus("error");
      setSubmissionError(message);
      setWalletStatus("error");
      setWalletError(message);
    }
  }

  return (
    <main>
      <div className="page">
        <header className="topbar reveal" style={{ animationDelay: "0.02s" }}>
          <div className="brand">
            <span className="brand-dot" />
            <span>VeriSec Explorer</span>
          </div>
          <div className="top-actions">
            <a className="button secondary" href="#audits">
              Audits
            </a>
            <a className="button secondary" href="#auditor-registry">
              Auditors
            </a>
            <a className="button secondary" href="#signed-submissions">
              Submissions
            </a>
          </div>
        </header>

        <section className="hero reveal" style={{ animationDelay: "0.05s" }}>
          <div className="badges">
            <span className="badge">Security Data Oracle</span>
            <span className="badge">Arbitrum • MVP</span>
            <span className="badge">Live API</span>
          </div>
          <h1>Security intelligence you can query, verify, and enforce.</h1>
          <p>
            Convert static audit reports into structured records with proof-ready findings.
            Build guardrails for deployments, governance, and upgrades using verifiable
            Arbitrum-native security data.
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
                    <th>Details</th>
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
                      <td>
                        <a className="button secondary" href={`/audits/${item.auditId}`}>
                          Open
                        </a>
                      </td>
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

        <section
          className="section reveal"
          style={{ animationDelay: "0.3s" }}
          id="auditor-registry"
        >
          <h2>Auditor registry</h2>
          <div className="grid-2">
            <div className="card">
              <h3>Register or update auditor</h3>
              <form className="form" onSubmit={handleAuditorSubmit}>
                <label className="field">
                  <span>Address</span>
                  <input
                    className="input mono"
                    type="text"
                    placeholder="0x..."
                    value={auditorForm.address}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAuditorForm((current) => ({
                        ...current,
                        address: value
                      }));
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    className="input"
                    type="text"
                    placeholder="OpenZeppelin"
                    value={auditorForm.name}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAuditorForm((current) => ({
                        ...current,
                        name: value
                      }));
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Website (optional)</span>
                  <input
                    className="input"
                    type="text"
                    placeholder="https://example.com"
                    value={auditorForm.website}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAuditorForm((current) => ({
                        ...current,
                        website: value
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>Identity (optional)</span>
                  <input
                    className="input"
                    type="text"
                    placeholder="@auditor"
                    value={auditorForm.identity}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAuditorForm((current) => ({
                        ...current,
                        identity: value
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>Public key (optional)</span>
                  <input
                    className="input mono"
                    type="text"
                    placeholder="0x..."
                    value={auditorForm.publicKey}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAuditorForm((current) => ({
                        ...current,
                        publicKey: value
                      }));
                    }}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={auditorForm.active}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAuditorForm((current) => ({
                        ...current,
                        active: checked
                      }));
                    }}
                  />
                  <span>Active auditor</span>
                </label>
                <div className="actions">
                  <button
                    className="button primary"
                    type="submit"
                    disabled={auditorStatus === "saving" || apiStatus === "offline"}
                  >
                    {auditorStatus === "saving" ? "Saving..." : "Save auditor"}
                  </button>
                  {auditorStatus === "success" ? (
                    <span className="status-pill online">Saved</span>
                  ) : null}
                  {auditorStatus === "error" ? (
                    <span className="status-pill offline">
                      {auditorError ?? "Failed to save auditor"}
                    </span>
                  ) : null}
                </div>
              </form>
            </div>
            <div className="card">
              <h3>Registered auditors</h3>
              {!auditors || auditors.items.length === 0 ? (
                <div className="notice">No auditors registered yet.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Address</th>
                      <th>Status</th>
                      <th>Website</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditors.items.map((item) => {
                      const websiteUrl = normalizeUrl(item.website);
                      return (
                        <tr key={item.address}>
                          <td>{item.name}</td>
                          <td className="mono">{item.address}</td>
                          <td>
                            <span className={`chip ${item.active ? "active" : "inactive"}`}>
                              {item.active ? "active" : "inactive"}
                            </span>
                          </td>
                          <td>
                            {websiteUrl ? (
                              <a
                                className="button secondary"
                                href={websiteUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        <section
          className="section reveal"
          style={{ animationDelay: "0.34s" }}
          id="signed-submissions"
        >
          <h2>Signed submission upload</h2>
          <div className="grid-2">
            <div className="card">
              <h3>Submit signed audit</h3>
              <form className="form" onSubmit={handleSubmissionSubmit}>
                <div className="actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      setSubmissionAuditJson(
                        audit ? JSON.stringify(audit, null, 2) : submissionAuditJson
                      )
                    }
                    disabled={!audit}
                  >
                    Use active audit JSON
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={handleWalletSignAndSubmit}
                    disabled={submissionStatus === "submitting" || apiStatus === "offline"}
                  >
                    {walletStatus === "signing"
                      ? "Waiting for wallet signature..."
                      : "Sign with wallet + submit"}
                  </button>
                </div>
                <label className="field">
                  <span>Audit JSON</span>
                  <textarea
                    className="textarea mono"
                    value={submissionAuditJson}
                    onChange={(event) => setSubmissionAuditJson(event.currentTarget.value)}
                    placeholder='{"auditId":"example","schemaVersion":"1.0.0",...}'
                    required
                  />
                  <small className="helper">
                    Must validate against the canonical schema.
                  </small>
                </label>
                <label className="field">
                  <span>Signer address</span>
                  <input
                    className="input mono"
                    type="text"
                    placeholder="0x..."
                    value={submissionSigner}
                    onChange={(event) => setSubmissionSigner(event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Signature</span>
                  <textarea
                    className="textarea mono compact"
                    value={submissionSignature}
                    onChange={(event) => setSubmissionSignature(event.currentTarget.value)}
                    placeholder="0x..."
                    required
                  />
                </label>
                <label className="field">
                  <span>Scheme</span>
                  <input
                    className="input"
                    type="text"
                    value={submissionScheme}
                    onChange={(event) => setSubmissionScheme(event.currentTarget.value)}
                    placeholder="eip191"
                  />
                </label>
                <label className="field">
                  <span>Signed at (optional)</span>
                  <input
                    className="input"
                    type="text"
                    value={submissionSignedAt}
                    onChange={(event) => setSubmissionSignedAt(event.currentTarget.value)}
                    placeholder="2026-02-16T18:00:00Z"
                  />
                </label>
                <div className="actions">
                  <button
                    className="button primary"
                    type="submit"
                    disabled={submissionStatus === "submitting" || apiStatus === "offline"}
                  >
                    {submissionStatus === "submitting"
                      ? "Submitting..."
                      : "Upload signed audit"}
                  </button>
                  {submissionStatus === "success" ? (
                    <span className="status-pill online">Verified + stored</span>
                  ) : null}
                  {submissionStatus === "error" ? (
                    <span className="status-pill offline">
                      {submissionError ?? "Submission failed"}
                    </span>
                  ) : null}
                  {walletStatus === "success" ? (
                    <span className="status-pill online">Wallet signature verified</span>
                  ) : null}
                  {walletStatus === "error" && walletError ? (
                    <span className="status-pill offline">{walletError}</span>
                  ) : null}
                </div>
              </form>
            </div>
            <div className="card">
              <h3>Submission result</h3>
              {submissionResult ? (
                <div className="stack">
                  <div className="kv">
                    <span>Audit ID</span>
                    <strong>{submissionResult.auditId}</strong>
                  </div>
                  <div className="kv">
                    <span>Signer</span>
                    <strong className="mono">{submissionResult.signer}</strong>
                  </div>
                  <div className="kv">
                    <span>Verification</span>
                    <strong>{submissionResult.verified ? "Passed" : "Failed"}</strong>
                  </div>
                  <div className="actions">
                    <a
                      className="button secondary"
                      href={`/?audit=${submissionResult.auditId}#active-audit`}
                    >
                      Open stored audit
                    </a>
                  </div>
                </div>
              ) : (
                <div className="notice">
                  No signed submission yet. Paste an audit JSON and matching signature.
                </div>
              )}
              <div className="codeblock">
                {`POST /v1/submissions\n{\n  "audit": { ... },\n  "signature": {\n    "signer": "0x...",\n    "signature": "0x...",\n    "scheme": "eip191"\n  }\n}`}
              </div>
            </div>
          </div>
        </section>

        <section className="section reveal" style={{ animationDelay: "0.38s" }}>
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
                <li>POST /v1/auditors</li>
                <li>GET /v1/auditors</li>
                <li>POST /v1/submissions</li>
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

        <footer className="footer reveal" style={{ animationDelay: "0.42s" }}>
          <span>VeriSec Explorer • MVP build</span>
          <span>Anchored security data for Arbitrum protocols.</span>
        </footer>
      </div>
    </main>
  );
}
