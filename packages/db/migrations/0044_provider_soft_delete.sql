-- Add deleted_at column for soft delete
-- Logical delete: providers are marked as deleted instead of being physically removed,
-- preserving foreign key references from request_logs and request_attempts.
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

-- Index for filtering out soft-deleted providers in list queries
CREATE INDEX IF NOT EXISTS "idx_providers_deleted_at" ON "providers" ("deleted_at");
