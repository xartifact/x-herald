-- Step 1: Add the new array column
ALTER TABLE "model_routes" ADD COLUMN "virtual_model_ids" text[] DEFAULT '{}' NOT NULL;

-- Step 2: Migrate existing data from virtual_model_id to virtual_model_ids
UPDATE "model_routes" SET "virtual_model_ids" = ARRAY["virtual_model_id"]::text[] WHERE "virtual_model_id" IS NOT NULL;

-- Step 3: Drop the foreign key constraint
ALTER TABLE "model_routes" DROP CONSTRAINT IF EXISTS "model_routes_virtual_model_id_virtual_models_id_fk";

-- Step 4: Drop the old column
ALTER TABLE "model_routes" DROP COLUMN "virtual_model_id";
