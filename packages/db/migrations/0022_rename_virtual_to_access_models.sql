-- Rename virtual_models table to access_models
ALTER TABLE "virtual_models" RENAME TO "access_models";

-- Rename virtual_model_ids column in model_routes to access_model_ids
ALTER TABLE "model_routes" RENAME COLUMN "virtual_model_ids" TO "access_model_ids";
