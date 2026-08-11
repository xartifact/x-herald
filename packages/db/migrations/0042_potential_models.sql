-- 潜在模型表：自动发现客户端请求过、但尚未接入的模型
-- 1. AccessModelRouter 在 access_model 命中失败时调用 potential-models service 记录
-- 2. 仅在每个进程内累积命中数 >= 3 时才首次落库（防恶意客户端刷随机名）
-- 3. daily cleanup job 删除 last_seen_at > 30 天 且 action='observe' 的记录
-- 4. admin 可手动转换为 access_model（创建新的接入模型 + 删除该行）
-- 5. admin 可配置 action='route_to_access_model'，将该 model_name 路由到已存在的接入模型

CREATE TABLE IF NOT EXISTS potential_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name varchar(255) NOT NULL UNIQUE,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  -- 最近若干个看到过该模型的 virtual_key_id（distinct，去重）
  sample_virtual_key_ids text[] NOT NULL DEFAULT '{}',
  -- 动作：observe=只记录 / route_to_access_model=命中后改写到目标接入模型
  action varchar(30) NOT NULL DEFAULT 'observe'
    CHECK (action IN ('observe', 'route_to_access_model')),
  -- action=route_to_access_model 时指向目标 access_model.id
  target_access_model_id uuid REFERENCES access_models(id) ON DELETE SET NULL,
  -- admin 可禁用某条记录，禁用的不会被自动清理，也不会被路由
  enabled boolean NOT NULL DEFAULT true,
  -- admin 备注
  note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 路由热路径：按 model_name 精确匹配查找（UNIQUE 已隐含索引；显式声明便于文档化）
CREATE UNIQUE INDEX IF NOT EXISTS idx_potential_models_model_name ON potential_models(model_name);

-- 清理 job 用：按 last_seen_at 扫描
CREATE INDEX IF NOT EXISTS idx_potential_models_last_seen ON potential_models(last_seen_at);

-- 列表筛选用：action / target
CREATE INDEX IF NOT EXISTS idx_potential_models_action ON potential_models(action);
CREATE INDEX IF NOT EXISTS idx_potential_models_target_am ON potential_models(target_access_model_id);

-- 列表排序用：按 request_count 倒序
CREATE INDEX IF NOT EXISTS idx_potential_models_request_count ON potential_models(request_count DESC);
