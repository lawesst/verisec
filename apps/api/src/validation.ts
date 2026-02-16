import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";

let auditValidatorPromise: Promise<ValidateFunction> | null = null;

export async function getAuditValidator(): Promise<ValidateFunction> {
  if (!auditValidatorPromise) {
    auditValidatorPromise = buildAuditValidator();
  }

  return auditValidatorPromise;
}

async function buildAuditValidator(): Promise<ValidateFunction> {
  const schemaUrl = new URL("../../../packages/schema/schema/v1/audit.schema.json", import.meta.url);
  const raw = await readFile(schemaUrl, "utf-8");
  const schema = JSON.parse(raw);

  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
  (addFormats as any)(ajv);

  return ajv.compile(schema) as ValidateFunction;
}
