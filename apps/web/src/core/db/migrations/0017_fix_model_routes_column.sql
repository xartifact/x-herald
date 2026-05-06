-- 将 model_routes.virtual_model_id (uuid FK) 迁移到 virtual_model_ids (text[] 数组)
-- 仅当旧列存在且新列不存在时执行，对已正确迁移的库无副作用
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_routes'
      AND column_name = 'virtual_model_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_routes'
      AND column_name = 'virtual_model_ids'
  ) THEN
    -- 添加新数组列
    ALTER TABLE "model_routes" ADD COLUMN "virtual_model_ids" text[] DEFAULT '{}' NOT NULL;

    -- 迁移现有数据
    UPDATE "model_routes" SET "virtual_model_ids" = ARRAY["virtual_model_id"]::text[] WHERE "virtual_model_id" IS NOT NULL;

    -- 删除外键约束（如果存在）
    ALTER TABLE "model_routes" DROP CONSTRAINT IF EXISTS "model_routes_virtual_model_id_virtual_models_id_fk";

    -- 删除旧列
    ALTER TABLE "model_routes" DROP COLUMN "virtual_model_id";
  END IF;
  -- 如果 virtual_model_ids 已存在（text[] 数组）：已是正确状态，无需操作
END $$;
