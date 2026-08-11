-- 按接入模型的多版本路由规则表，替代单一全局 canvas_states。
-- 每个 access_model 可以拥有多个版本（草稿/历史），但同一时刻最多一行 active=true。
CREATE TABLE IF NOT EXISTS route_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_model_id uuid NOT NULL REFERENCES access_models(id) ON DELETE CASCADE,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  name varchar(255) NOT NULL DEFAULT '默认路由规则',
  description text,
  active boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 每个接入模型最多一行 active=true（部分唯一索引，只约束 active 行）
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_rules_one_active_per_am
  ON route_rules (access_model_id) WHERE active;

CREATE INDEX IF NOT EXISTS idx_route_rules_am_active ON route_rules (access_model_id, active);
CREATE INDEX IF NOT EXISTS idx_route_rules_am_version ON route_rules (access_model_id, version DESC);
