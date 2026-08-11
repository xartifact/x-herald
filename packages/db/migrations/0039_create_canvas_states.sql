-- 新增画布状态持久化表。
-- canvas_state 独立于 model_routes，存储编辑器 Graph（nodes + edges + positions）。
-- 运行时（网关）不读此表，仅前端编辑器读写。
CREATE TABLE IF NOT EXISTS canvas_states (
  id      TEXT PRIMARY KEY DEFAULT 'default',
  graph   JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 初始插入默认行（single-row pattern，始终 upsert 这一行）
INSERT INTO canvas_states (id, graph) VALUES ('default', '{"nodes":[],"edges":[]}')
ON CONFLICT (id) DO NOTHING;
