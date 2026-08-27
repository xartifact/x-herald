-- 模型组内实例顺序：每组成员独立排序
-- 将排序键从 model_instances.priority（实例全局值）下沉到 memberships，
-- 使同一实例在不同组内可拥有各自独立的顺序。
-- 旧数据默认 priority=0（同组内按 created_at 兜底，与迁移前行为一致）。

ALTER TABLE "model_group_memberships"
  ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;

-- 排序键完全下沉到 memberships 后，实例上的旧列不再读写，删除
ALTER TABLE "model_instances" DROP COLUMN IF EXISTS "priority";