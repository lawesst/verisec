const baseUrl = process.env.API_BASE_URL ?? "http://localhost:4010";

async function main() {
  console.log(`smoke: using API ${baseUrl}`);

  const health = await fetchJson("/health");
  if (!health?.ok) {
    throw new Error("health check failed");
  }
  console.log("smoke: health ok");

  const audits = await fetchJson("/v1/audits?limit=1&offset=0");
  if (!audits || !Array.isArray(audits.items)) {
    throw new Error("audits endpoint failed");
  }
  console.log(`smoke: audits endpoint ok (count=${audits.pagination?.total ?? "n/a"})`);

  await fetchJson("/v1/auditors?limit=5&offset=0");
  console.log("smoke: auditors endpoint ok");

  const firstAuditId = audits.items[0]?.auditId;
  if (!firstAuditId) {
    console.log("smoke: no audits found, skipping findings/proof check");
    return;
  }

  const findings = await fetchJson(
    `/v1/audits/${encodeURIComponent(firstAuditId)}/findings?limit=1&offset=0`
  );
  if (!findings || !Array.isArray(findings.items)) {
    throw new Error("findings endpoint failed");
  }
  console.log("smoke: findings endpoint ok");

  const firstFindingId = findings.items[0]?.id;
  if (!firstFindingId) {
    console.log("smoke: no findings found, skipping proof check");
    return;
  }

  const proof = await fetchJson(
    `/v1/audits/${encodeURIComponent(firstAuditId)}/findings/${encodeURIComponent(
      firstFindingId
    )}/proof`
  );
  if (!proof || !proof.root || !Array.isArray(proof.proof)) {
    throw new Error("proof endpoint failed");
  }
  console.log("smoke: proof endpoint ok");
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} failed: ${response.status} ${body}`);
  }
  return response.json();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
