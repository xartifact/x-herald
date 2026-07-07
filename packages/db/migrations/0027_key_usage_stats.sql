-- Add usage fields to virtual_keys
ALTER TABLE virtual_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE virtual_keys ADD COLUMN IF NOT EXISTS total_requests INTEGER DEFAULT 0;
ALTER TABLE virtual_keys ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0;

-- Create daily usage aggregation table
CREATE TABLE IF NOT EXISTS key_usage_daily (
  key_id UUID REFERENCES virtual_keys(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  PRIMARY KEY(key_id, date)
);
