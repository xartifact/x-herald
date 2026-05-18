-- 0017 的幂等补丁版本，确保 virtual_model_ids 迁移完成
-- 若 virtual_model_ids 已存在（0016 或 0017 已完成）→ ADD COLUMN 报 "already exists" → 安全跳过
-- 若 virtual_model_id 已不存在 → UPDATE 报 "does not exist" → 安全跳过
ALTER TABLE "model_routes" ADD COLUMN "virtual_model_ids" text[] DEFAULT '{}' NOT NULL;
UPDATE "model_routes" SET "virtual_model_ids" = ARRAY["virtual_model_id"]::text[] WHERE "virtual_model_id" IS NOT NULL;
ALTER TABLE "model_routes" DROP CONSTRAINT IF EXISTS "model_routes_virtual_model_id_virtual_models_id_fk";
ALTER TABLE "model_routes" DROP COLUMN "virtual_model_id";
