-- 创建 cost_records 成本记录表
CREATE TABLE IF NOT EXISTS cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_log_id VARCHAR(255),
  key_id VARCHAR(255),
  key_name VARCHAR(255),
  model_name VARCHAR(255),
  provider_name VARCHAR(255),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  input_cost REAL DEFAULT 0,
  output_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cost_records_key ON cost_records(key_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_provider ON cost_records(provider_name);
CREATE INDEX IF NOT EXISTS idx_cost_records_model ON cost_records(model_name);
CREATE INDEX IF NOT EXISTS idx_cost_records_created ON cost_records(created_at);
