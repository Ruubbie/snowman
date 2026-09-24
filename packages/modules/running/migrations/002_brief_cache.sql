-- Briefs are reused until their inputs change (the app asks for one on every Today refresh).
ALTER TABLE run_briefs ADD COLUMN IF NOT EXISTS input_hash CHAR(64) NULL;
