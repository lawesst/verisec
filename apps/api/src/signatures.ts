import { getAddress, isAddress, verifyMessage } from "ethers";
import type { AuditReport, Signature } from "@verisec/schema";

export interface SignatureValidationResult {
  ok: boolean;
  recoveredAddress?: string;
  error?: string;
}

export function canonicalAuditMessage(audit: AuditReport): string {
  const { signatures, ...unsignedAudit } = audit;
  return stableStringify(unsignedAudit);
}

export function verifyAuditSignature(
  audit: AuditReport,
  signature: Signature
): SignatureValidationResult {
  if (signature.scheme !== "eip191") {
    return {
      ok: false,
      error: `unsupported_signature_scheme:${signature.scheme}`
    };
  }

  if (!isAddress(signature.signer)) {
    return {
      ok: false,
      error: "invalid_signer_address"
    };
  }

  try {
    const message = canonicalAuditMessage(audit);
    const recoveredAddress = verifyMessage(message, signature.signature);

    if (getAddress(recoveredAddress) !== getAddress(signature.signer)) {
      return {
        ok: false,
        recoveredAddress,
        error: "signature_mismatch"
      };
    }

    return {
      ok: true,
      recoveredAddress
    };
  } catch {
    return {
      ok: false,
      error: "invalid_signature"
    };
  }
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
