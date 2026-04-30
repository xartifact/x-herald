-- 修复旧版数据库中 model_routes.virtual_model_ids → virtual_model_id 列名不一致问题
-- 仅当旧列存在且新列不存在时执行，对已正确迁移的库无副作用
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_routes'
      AND column_name = 'virtual_model_ids'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_routes'
      AND column_name = 'virtual_model_id'
  ) THEN
    -- 删除旧外键约束（如果存在）
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'model_routes_virtual_model_ids_virtual_models_id_fk'
        AND table_name = 'model_routes'
    ) THEN
      ALTER TABLE "model_routes" DROP CONSTRAINT "model_routes_virtual_model_ids_virtual_models_id_fk";
    END IF;

    -- 重命名列
    ALTER TABLE "model_routes" RENAME COLUMN "virtual_model_ids" TO "virtual_model_id";

    -- 重新添加外键
    ALTER TABLE "model_routes"
      ADD CONSTRAINT "model_routes_virtual_model_id_virtual_models_id_fk"
      FOREIGN KEY ("virtual_model_id")
      REFERENCES "public"."virtual_models"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
