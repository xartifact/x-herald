-- 模型组-实例多对多关联表
-- 替代原 model_instances.group_id 外键，支持一个实例加入多个模型组

CREATE TABLE "model_group_memberships" (
  "group_id"    uuid NOT NULL REFERENCES "model_groups"("id")    ON DELETE CASCADE,
  "instance_id" uuid NOT NULL REFERENCES "model_instances"("id") ON DELETE CASCADE,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("group_id", "instance_id")
);

CREATE INDEX "mgm_instance_id_idx" ON "model_group_memberships" ("instance_id");

-- 迁移现有数据：将 group_id 列的数据迁移到中间表
INSERT INTO "model_group_memberships" ("group_id", "instance_id", "created_at")
SELECT "group_id", "id", "created_at"
FROM "model_instances"
WHERE "group_id" IS NOT NULL;

-- 删除旧的 group_id 列
ALTER TABLE "model_instances" DROP COLUMN "group_id";
