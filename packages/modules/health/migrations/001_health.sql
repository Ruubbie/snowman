-- Health module: Apple Health data sent by the Olaf iPhone app.
-- Samples: one row per HealthKit sample (resting HR, HRV, VO2max, body mass, sleep stages).
-- Sleep stages are stored as type 'sleep_<stage>' with value = minutes.

CREATE TABLE IF NOT EXISTS health_samples (
  uuid CHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(40) NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  value DOUBLE NOT NULL,
  unit VARCHAR(16) NULL,
  source VARCHAR(100) NULL,
  KEY idx_health_samples_type_end (type, end_at),
  KEY idx_health_samples_end (end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_workouts (
  uuid CHAR(36) NOT NULL PRIMARY KEY,
  activity VARCHAR(40) NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  duration_s DOUBLE NOT NULL,
  distance_m DOUBLE NULL,
  energy_kcal DOUBLE NULL,
  avg_hr DOUBLE NULL,
  max_hr DOUBLE NULL,
  source VARCHAR(100) NULL,
  imported_at DATETIME(3) NOT NULL,
  KEY idx_health_workouts_start (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
