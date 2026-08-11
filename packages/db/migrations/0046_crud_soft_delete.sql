-- Add deleted_at column for soft delete on model_groups, model_instances,
-- access_models, and model_routes.
-- Logical delete preserves rows for audit trail and prevents accidental
-- data loss; list queries filter deleted_at IS NULL.

ALTER TABLE "model_groups" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "model_instances" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "access_models" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "model_routes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_model_groups_deleted_at" ON "model_groups" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_model_instances_deleted_at" ON "model_instances" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_access_models_deleted_at" ON "access_models" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_model_routes_deleted_at" ON "model_routes" ("deleted_at");
