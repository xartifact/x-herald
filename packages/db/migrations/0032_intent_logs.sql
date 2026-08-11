CREATE TABLE IF NOT EXISTS "intent_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_group_id" uuid,
  "virtual_key_id" uuid,
  "virtual_key_name" varchar(255),
  "access_model_id" uuid,
  "access_model_name" varchar(255),
  "model_route_id" uuid,
  "model_route_name" varchar(255),
  "model_route_priority" integer,
  "intent_name" varchar(255) NOT NULL,
  "intent_source" varchar(50) NOT NULL,
  "intent_confidence" double precision,
  "target_group_id" uuid,
  "target_group_name" varchar(255),
  "classifier_provider_id" uuid,
  "classifier_provider_name" varchar(255),
  "classifier_model_name" varchar(255),
  "classifier_latency_ms" integer,
  "classifier_raw_response" text,
  "user_message_snippet" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_intent_logs_virtual_key_id" ON "intent_logs" ("virtual_key_id");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_access_model_id" ON "intent_logs" ("access_model_id");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_model_route_id" ON "intent_logs" ("model_route_id");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_intent_name" ON "intent_logs" ("intent_name");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_intent_source" ON "intent_logs" ("intent_source");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_created_at" ON "intent_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_intent_logs_request_group_id" ON "intent_logs" ("request_group_id");