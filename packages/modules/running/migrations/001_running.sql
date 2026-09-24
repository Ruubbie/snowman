-- Running module: program-driven plan, uploaded runs with rich telemetry,
-- Olaf briefs/cues, plan decisions log, and local-notification reminders.

CREATE TABLE IF NOT EXISTS running_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  program_start DATE NOT NULL,
  rest_weekday TINYINT NOT NULL DEFAULT 1,
  reminder_hour TINYINT NOT NULL DEFAULT 18,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  date DATE NOT NULL,
  kind ENUM('run', 'walk', 'rest') NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary VARCHAR(500) NULL,
  segments LONGTEXT NOT NULL CHECK (JSON_VALID(segments)),
  status ENUM('planned', 'done', 'skipped', 'moved', 'replaced') NOT NULL DEFAULT 'planned',
  source ENUM('program', 'olaf', 'user') NOT NULL DEFAULT 'program',
  program_week INT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_run_sessions_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One uploaded run. Rich per-sample telemetry lives in run_samples/run_events;
-- these columns are the summary Olaf and the UI read without scanning samples.
CREATE TABLE IF NOT EXISTS runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id VARCHAR(191) NOT NULL,
  session_id CHAR(36) NULL,
  started_at DATETIME(3) NOT NULL,
  duration_s INT NULL,
  distance_m INT NULL,
  moving_time_s INT NULL,
  elapsed_time_s INT NULL,
  avg_pace_s_per_km INT NULL,
  elev_gain_m DECIMAL(8, 2) NULL,
  elev_loss_m DECIMAL(8, 2) NULL,
  max_speed_mps DECIMAL(6, 3) NULL,
  avg_cadence_spm DECIMAL(6, 2) NULL,
  splits LONGTEXT NULL CHECK (splits IS NULL OR JSON_VALID(splits)),
  device LONGTEXT NULL CHECK (device IS NULL OR JSON_VALID(device)),
  weather LONGTEXT NULL CHECK (weather IS NULL OR JSON_VALID(weather)),
  effort TINYINT NULL,
  note VARCHAR(1000) NULL,
  completed_plan TINYINT(1) NOT NULL DEFAULT 0,
  imported TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_runs_client_id (client_id),
  KEY idx_runs_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ~1Hz GPS/motion samples. Expect up to ~10k rows per run; inserted in
-- batches. Nullable everywhere a sensor reading may be missing.
CREATE TABLE IF NOT EXISTS run_samples (
  run_id CHAR(36) NOT NULL,
  seq INT NOT NULL,
  t_s DECIMAL(10, 3) NOT NULL,
  ts DATETIME(3) NULL,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  alt_m DOUBLE NULL,
  h_acc_m DOUBLE NULL,
  v_acc_m DOUBLE NULL,
  speed_mps DOUBLE NULL,
  speed_acc_mps DOUBLE NULL,
  course_deg DOUBLE NULL,
  dist_m DOUBLE NULL,
  cadence_spm DOUBLE NULL,
  pace_s_per_km DOUBLE NULL,
  rel_alt_m DOUBLE NULL,
  steps_total INT NULL,
  floors_up INT NULL,
  floors_down INT NULL,
  segment_index INT NULL,
  accepted TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (run_id, seq),
  CONSTRAINT fk_run_samples_run FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_events (
  run_id CHAR(36) NOT NULL,
  seq INT NOT NULL,
  t_s DECIMAL(10, 3) NOT NULL,
  ts DATETIME(3) NULL,
  type ENUM(
    'start', 'pause', 'resume', 'segment_start', 'segment_end',
    'km_split', 'cue_spoken', 'gps_lost', 'gps_recovered', 'finish'
  ) NOT NULL,
  data LONGTEXT NULL CHECK (data IS NULL OR JSON_VALID(data)),
  PRIMARY KEY (run_id, seq),
  CONSTRAINT fk_run_events_run FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_briefs (
  session_id CHAR(36) NOT NULL PRIMARY KEY,
  brief LONGTEXT NOT NULL CHECK (JSON_VALID(brief)),
  model VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_cues (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_client_id VARCHAR(191) NOT NULL,
  session_id CHAR(36) NULL,
  elapsed_s INT NOT NULL,
  trigger_type VARCHAR(64) NOT NULL,
  text VARCHAR(500) NULL,
  source ENUM('live', 'fallback') NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY idx_run_cues_run (run_client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_decisions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  actor ENUM('olaf', 'user', 'system') NOT NULL,
  action VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NULL,
  before_state LONGTEXT NULL CHECK (before_state IS NULL OR JSON_VALID(before_state)),
  after_state LONGTEXT NULL CHECK (after_state IS NULL OR JSON_VALID(after_state))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS running_reminders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fire_at DATETIME(3) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body VARCHAR(500) NOT NULL,
  session_id CHAR(36) NULL,
  generated_by ENUM('olaf', 'fallback') NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
