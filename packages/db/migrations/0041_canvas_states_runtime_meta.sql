-- 升级 canvas_states 为运行时核心数据源
-- 1. 新增路由元数据字段：name / description / enabled / priority
-- 2. canvas_states 不再仅是"前端布局持久化"，而是"画布即路由"的数据源
-- 3. 运行时引擎直接读取 canvas_states.graph（Node[] + Edge[]）并 DFS 编译为 RouteMatcher
-- 4. 删除 model_routes 表（启动时由 migration 脚本完成数据迁移）

ALTER TABLE canvas_states
  ADD COLUMN IF NOT EXISTS name varchar(255),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- 已有默认行填充名称（避免 null）
UPDATE canvas_states SET name = '默认路由画布' WHERE name IS NULL;

-- name NOT NULL 约束（先确保无 null 后再加）
ALTER TABLE canvas_states
  ALTER COLUMN name SET NOT NULL;

-- 索引：运行时按 enabled 过滤
CREATE INDEX IF NOT EXISTS idx_canvas_states_enabled ON canvas_states(enabled);