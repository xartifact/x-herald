-- Introduce single-user workspaces as a configuration isolation boundary.
-- Existing records are assigned to one stable default workspace.

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workspaces_name_unique" UNIQUE ("name")
);

INSERT INTO "workspaces" ("id", "name", "is_default")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', true)
ON CONFLICT ("name") DO UPDATE SET "is_default" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_workspaces_single_default"
  ON "workspaces" ("is_default") WHERE "is_default";

ALTER TABLE "virtual_keys" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "model_groups" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "access_models" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "route_rules" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "intent_logs" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;

UPDATE "virtual_keys" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "model_groups" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "access_models" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "route_rules" AS rr
SET "workspace_id" = COALESCE(am."workspace_id", '00000000-0000-0000-0000-000000000001')
FROM "access_models" AS am
WHERE rr."access_model_id" = am."id" AND rr."workspace_id" IS NULL;
UPDATE "route_rules" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "request_logs" AS logs
SET "workspace_id" = COALESCE(vk."workspace_id", '00000000-0000-0000-0000-000000000001')
FROM "virtual_keys" AS vk
WHERE logs."virtual_key_id" = vk."id" AND logs."workspace_id" IS NULL;
UPDATE "request_logs" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "cost_records" AS costs
SET "workspace_id" = COALESCE(logs."workspace_id", '00000000-0000-0000-0000-000000000001')
FROM "request_logs" AS logs
WHERE costs."request_log_id" = logs."id"::text AND costs."workspace_id" IS NULL;
UPDATE "cost_records" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
UPDATE "intent_logs" AS intents
SET "workspace_id" = COALESCE(vk."workspace_id", '00000000-0000-0000-0000-000000000001')
FROM "virtual_keys" AS vk
WHERE intents."virtual_key_id" = vk."id" AND intents."workspace_id" IS NULL;
UPDATE "intent_logs" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;

ALTER TABLE "virtual_keys" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "model_groups" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "access_models" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "route_rules" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "request_logs" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "cost_records" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "intent_logs" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "virtual_keys" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "model_groups" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "access_models" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "route_rules" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "request_logs" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "cost_records" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "intent_logs" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE "model_groups" DROP CONSTRAINT IF EXISTS "model_groups_name_unique";
ALTER TABLE "access_models" DROP CONSTRAINT IF EXISTS "access_models_name_unique";
ALTER TABLE "access_models" DROP CONSTRAINT IF EXISTS "virtual_models_name_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_model_groups_workspace_name"
  ON "model_groups" ("workspace_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_model_groups_workspace_id_id"
  ON "model_groups" ("workspace_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_access_models_workspace_name"
  ON "access_models" ("workspace_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_access_models_workspace_id_id"
  ON "access_models" ("workspace_id", "id");
CREATE INDEX IF NOT EXISTS "idx_route_rules_workspace_id" ON "route_rules" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_request_logs_workspace_created_at"
  ON "request_logs" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_cost_records_workspace_created"
  ON "cost_records" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_workspace_created"
  ON "intent_logs" ("workspace_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_keys_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "virtual_keys" ADD CONSTRAINT "virtual_keys_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'model_groups_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "model_groups" ADD CONSTRAINT "model_groups_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_models_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "access_models" ADD CONSTRAINT "access_models_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_rules_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "route_rules" ADD CONSTRAINT "route_rules_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_logs_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_records_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intent_logs_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "intent_logs" ADD CONSTRAINT "intent_logs_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_rules_workspace_access_model_fk') THEN
    ALTER TABLE "route_rules" ADD CONSTRAINT "route_rules_workspace_access_model_fk"
      FOREIGN KEY ("workspace_id", "access_model_id")
      REFERENCES "access_models"("workspace_id", "id") ON DELETE CASCADE;
  END IF;
END $$;
