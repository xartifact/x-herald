-- Remove is_default column from virtual_models table
-- Replaced by name-based identification via CATCHALL_VM_NAME constant

ALTER TABLE "virtual_models" DROP COLUMN IF EXISTS "is_default";
