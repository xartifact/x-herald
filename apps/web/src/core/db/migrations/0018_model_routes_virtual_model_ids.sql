-- 将 model_routes.virtual_model_id (uuid FK) 迁移为 virtual_model_ids (text[] 数组)
-- 幂等：仅在旧列存在且新列不存在时执行
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
    ALTER TABLE "model_routes" ADD COLUMN "virtual_model_ids" text[] DEFAULT '{}' NOT NULL;
    UPDATE "model_routes" SET "virtual_model_ids" = ARRAY["virtual_model_id"]::text[] WHERE "virtual_model_id" IS NOT NULL;
    ALTER TABLE "model_routes" DROP CONSTRAINT IF EXISTS "model_routes_virtual_model_id_virtual_models_id_fk";
    ALTER TABLE "model_routes" DROP COLUMN "virtual_model_id";
  END IF;
END $$;
