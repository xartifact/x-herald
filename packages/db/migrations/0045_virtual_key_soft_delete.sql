-- Add deleted_at column to virtual_keys for soft delete
-- Logical delete: virtual keys are marked as deleted instead of being physically
-- removed, preserving foreign key references from request_logs.
ALTER TABLE "virtual_keys" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

-- Index for filtering out soft-deleted keys in list queries
CREATE INDEX IF NOT EXISTS "idx_virtual_keys_deleted_at" ON "virtual_keys" ("deleted_at");
