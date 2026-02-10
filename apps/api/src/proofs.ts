import type { AuditReport, Finding } from "@verisec/schema";
import { keccak256 } from "ethereum-cryptography/keccak";
import { concatBytes, hexToBytes, toHex } from "ethereum-cryptography/utils";

export interface ProofResult {
  auditId: string;
  findingId: string;
  leaf: string;
  root: string;
  proof: string[];
  leafIndex: number;
  totalLeaves: number;
  canonicalization: {
    sort: "finding.id:asc";
    leafEncoding: "utf8-json";
    hash: "keccak256";
    pairHashing: "sorted";
    oddLeaf: "duplicate";
  };
}

export function computeMerkleRoot(audit: AuditReport): string {
  const orderedFindings = [...audit.findings].sort((a, b) => a.id.localeCompare(b.id));
  const leaves = orderedFindings.map((finding) => hashFinding(finding));
  const tree = buildMerkleTree(leaves);
  return tree.root;
}

export function buildProofForFinding(
  audit: AuditReport,
  findingId: string
): ProofResult | null {
  const orderedFindings = [...audit.findings].sort((a, b) => a.id.localeCompare(b.id));
  const leaves = orderedFindings.map((finding) => hashFinding(finding));

  const leafIndex = orderedFindings.findIndex((finding) => finding.id === findingId);
  if (leafIndex < 0) {
    return null;
  }

  const tree = buildMerkleTree(leaves);
  const proof = buildProof(tree.layers, leafIndex);

  return {
    auditId: audit.auditId,
    findingId,
    leaf: leaves[leafIndex],
    root: tree.root,
    proof,
    leafIndex,
    totalLeaves: leaves.length,
    canonicalization: {
      sort: "finding.id:asc",
      leafEncoding: "utf8-json",
      hash: "keccak256",
      pairHashing: "sorted",
      oddLeaf: "duplicate"
    }
  };
}

function hashFinding(finding: Finding): string {
  const canonical = stableStringify(finding);
  const bytes = new TextEncoder().encode(canonical);
  return `0x${toHex(keccak256(bytes))}`;
}

function buildMerkleTree(leaves: string[]) {
  if (leaves.length === 0) {
    throw new Error("cannot build merkle tree with zero leaves");
  }

  const layers: string[][] = [leaves];

  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: string[] = [];

    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? current[i];
      next.push(hashPair(left, right));
    }

    layers.push(next);
  }

  return {
    root: layers[layers.length - 1][0],
    layers
  };
}

function buildProof(layers: string[][], leafIndex: number) {
  const proof: string[] = [];
  let index = leafIndex;

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const layer = layers[layerIndex];
    const isRightNode = index % 2 === 1;
    const pairIndex = isRightNode ? index - 1 : index + 1;
    const sibling = layer[pairIndex] ?? layer[index];
    proof.push(sibling);
    index = Math.floor(index / 2);
  }

  return proof;
}

function hashPair(left: string, right: string) {
  const [a, b] = sortHex(left, right);
  const bytes = concatBytes(hexToBytes(stripHexPrefix(a)), hexToBytes(stripHexPrefix(b)));
  return `0x${toHex(keccak256(bytes))}`;
}

function sortHex(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left <= right ? [a, b] : [b, a];
}

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
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
