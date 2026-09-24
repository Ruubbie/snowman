-- Remember which paired device started a conversation (shown in the desktop dashboard).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS device_id CHAR(36) NULL;
