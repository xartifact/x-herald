-- Step 1: 创建 request_attempts 表
CREATE TABLE IF NOT EXISTS request_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_log_id UUID NOT NULL REFERENCES request_logs(id),
  request_group_id UUID NOT NULL,
  candidate_index INTEGER DEFAULT 0 NOT NULL,
  instance_id UUID,
  provider_id UUID REFERENCES providers(id),
  provider_name VARCHAR(255),
  target_protocol VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  status_code INTEGER,
  failover_reason VARCHAR(20),
  retry_count INTEGER DEFAULT 0 NOT NULL,
  ttfb_ms INTEGER,
  duration_ms INTEGER,
  transformed_request_body JSONB,
  provider_request_headers JSONB,
  provider_response_body JSONB,
  provider_response_headers JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Step 2: 新增列
-- 常量 DEFAULT 触发 PG11+ catalog-only 优化（无全表改写）；'00000000-...' 作为历史记录占位符
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS request_group_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS candidate_index INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS failover_reason VARCHAR(20);

-- Step 3: 删除已迁移至 request_attempts 的旧列
ALTER TABLE request_logs DROP COLUMN IF EXISTS standard_request_body;
ALTER TABLE request_logs DROP COLUMN IF EXISTS transformed_request_body;
ALTER TABLE request_logs DROP COLUMN IF EXISTS provider_request_headers;
ALTER TABLE request_logs DROP COLUMN IF EXISTS provider_response_headers;
ALTER TABLE request_logs DROP COLUMN IF EXISTS provider_response_body;
ALTER TABLE request_logs DROP COLUMN IF EXISTS standard_response_body;

-- Step 4: 索引
CREATE INDEX IF NOT EXISTS idx_request_logs_request_group_id ON request_logs(request_group_id);
CREATE INDEX IF NOT EXISTS idx_request_attempts_log_id ON request_attempts(request_log_id);
CREATE INDEX IF NOT EXISTS idx_request_attempts_group_id ON request_attempts(request_group_id);
CREATE INDEX IF NOT EXISTS idx_request_attempts_provider_id ON request_attempts(provider_id);
CREATE INDEX IF NOT EXISTS idx_request_attempts_status ON request_attempts(status);
CREATE INDEX IF NOT EXISTS idx_request_attempts_candidate_index ON request_attempts(request_group_id, candidate_index);
