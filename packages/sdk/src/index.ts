import type { AuditReport, Finding } from "@verisec/schema";

export interface VeriSecClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export class VeriSecClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: VeriSecClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  async getAudit(auditId: string): Promise<AuditReport> {
    return this.request<AuditReport>(`/v1/audits/${auditId}`);
  }

  async listFindings(auditId: string): Promise<Finding[]> {
    return this.request<Finding[]>(`/v1/audits/${auditId}/findings`);
  }

  async getFindingProof(auditId: string, findingId: string): Promise<unknown> {
    return this.request(`/v1/audits/${auditId}/findings/${findingId}/proof`);
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.apiKey ? { "authorization": `Bearer ${this.apiKey}` } : undefined
    });

    if (!res.ok) {
      throw new Error(`VeriSec request failed: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }
}
