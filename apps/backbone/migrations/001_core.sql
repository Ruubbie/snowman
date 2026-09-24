-- Core backbone tables: pairing/devices, events, jobs, Olaf conversations, AI usage.

CREATE TABLE IF NOT EXISTS devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_devices_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pairing_codes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  KEY idx_pairing_codes_hash (code_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(191) NOT NULL,
  payload LONGTEXT NOT NULL CHECK (JSON_VALID(payload)),
  created_at DATETIME(3) NOT NULL,
  KEY idx_events_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(191) NOT NULL,
  run_at DATETIME(3) NOT NULL,
  payload LONGTEXT NOT NULL CHECK (JSON_VALID(payload)),
  status ENUM('queued', 'running', 'done', 'failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_jobs_status_run_at (status, run_at),
  KEY idx_jobs_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL,
  content LONGTEXT NOT NULL CHECK (JSON_VALID(content)),
  created_at DATETIME(3) NOT NULL,
  KEY idx_conversation_messages_conversation (conversation_id),
  CONSTRAINT fk_conversation_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  model VARCHAR(64) NOT NULL,
  purpose VARCHAR(128) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read INT NOT NULL DEFAULT 0,
  cache_write INT NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  KEY idx_ai_usage_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
