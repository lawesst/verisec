import { getAddress, isAddress, verifyMessage } from "ethers";
import { canonicalAuditMessage as buildCanonicalAuditMessage } from "@verisec/schema";
import type { AuditReport, Signature } from "@verisec/schema";

export interface SignatureValidationResult {
  ok: boolean;
  recoveredAddress?: string;
  error?: string;
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
    const message = buildCanonicalAuditMessage(audit);
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
