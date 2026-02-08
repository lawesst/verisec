import Ajv, { type ValidateFunction } from "ajv/dist/2020";
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

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  return ajv.compile(schema);
}
