-- Drop legacy flow_data column from model_routes.
-- 画布位置/连接图已迁移到独立的 canvas_states 表（由前端 useGraphPersistence 管理）。
-- 此列在 compile-flow 中不再写入，在 buildGraph 中不再读取。
ALTER TABLE model_routes DROP COLUMN IF EXISTS flow_data;
