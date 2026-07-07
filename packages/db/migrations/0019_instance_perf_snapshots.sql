CREATE TABLE IF NOT EXISTS "instance_perf_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "instance_id" varchar(255) NOT NULL,
  "instance_name" varchar(255),
  "group_id" varchar(255),
  "group_name" varchar(255),
  "provider_id" varchar(255),
  "provider_name" varchar(255),
  "bucket_start" timestamp NOT NULL,
  "bucket_end" timestamp NOT NULL,
  "sample_count" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "success_rate" real,
  "ttfb_avg" real,
  "ttfb_p50" real,
  "ttfb_p95" real,
  "ttfb_p99" real,
  "ttfb_min" real,
  "ttfb_max" real,
  "latency_avg" real,
  "latency_p50" real,
  "latency_p95" real,
  "latency_p99" real,
  "ttft_avg" real,
  "ttft_p95" real,
  "tps_avg" real,
  "tps_p50" real,
  "avg_input_tokens" real,
  "avg_output_tokens" real,
  "avg_retry_count" real,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_instance_bucket" UNIQUE ("instance_id", "bucket_start")
);

CREATE INDEX IF NOT EXISTS "idx_ips_instance_bucket" ON "instance_perf_snapshots" ("instance_id", "bucket_start");
CREATE INDEX IF NOT EXISTS "idx_ips_provider_bucket" ON "instance_perf_snapshots" ("provider_id", "bucket_start");
CREATE INDEX IF NOT EXISTS "idx_ips_bucket_start" ON "instance_perf_snapshots" ("bucket_start");
