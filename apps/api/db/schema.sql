CREATE TABLE IF NOT EXISTS audits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(128) NOT NULL UNIQUE,
  schema_version VARCHAR(64) NOT NULL,
  report_date DATE NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  project_slug VARCHAR(255),
  project_repository VARCHAR(512),
  project_version VARCHAR(128),
  project_contract_addresses JSON,
  auditor_name VARCHAR(255) NOT NULL,
  auditor_website VARCHAR(512),
  auditor_public_key TEXT,
  auditor_identity VARCHAR(255),
  commit_hash VARCHAR(128),
  network VARCHAR(128),
  artifacts_ipfs_cid VARCHAR(255),
  artifacts_report_url VARCHAR(1024),
  metadata JSON,
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_findings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(128) NOT NULL,
  finding_id VARCHAR(128) NOT NULL,
  title VARCHAR(512) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  description TEXT,
  category VARCHAR(255),
  cwe JSON,
  affected_contracts JSON,
  affected_addresses JSON,
  code_references JSON,
  recommendation TEXT,
  remediation TEXT,
  finding_created_at DATETIME,
  finding_updated_at DATETIME,
  tags JSON,
  UNIQUE KEY uniq_finding (audit_id, finding_id),
  CONSTRAINT fk_findings_audit
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_signatures (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(128) NOT NULL,
  signer VARCHAR(255) NOT NULL,
  signature TEXT NOT NULL,
  scheme VARCHAR(32) NOT NULL,
  signed_at DATETIME,
  CONSTRAINT fk_signatures_audit
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  address VARCHAR(66) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(512),
  identity VARCHAR(255),
  public_key TEXT,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_anchors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(128) NOT NULL,
  chain_id BIGINT NOT NULL,
  contract_address VARCHAR(64) NOT NULL,
  merkle_root CHAR(66) NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  uri TEXT,
  anchored_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_anchor (audit_id, chain_id, merkle_root),
  CONSTRAINT fk_anchors_audit
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
