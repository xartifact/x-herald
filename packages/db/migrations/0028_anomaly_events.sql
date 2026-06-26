CREATE TABLE IF NOT EXISTS "anomaly_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(50) NOT NULL,
  "severity" varchar(20) NOT NULL,
  "provider_name" varchar(255),
  "model_name" varchar(255),
  "instance_id" varchar(255),
  "description" text,
  "details" jsonb,
  "resolved" boolean DEFAULT false,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_anomaly_events_type" ON "anomaly_events" ("type");
CREATE INDEX IF NOT EXISTS "idx_anomaly_events_severity" ON "anomaly_events" ("severity");
CREATE INDEX IF NOT EXISTS "idx_anomaly_events_resolved" ON "anomaly_events" ("resolved");
CREATE INDEX IF NOT EXISTS "idx_anomaly_events_created" ON "anomaly_events" ("created_at");
