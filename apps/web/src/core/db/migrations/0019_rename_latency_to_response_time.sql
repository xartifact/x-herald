-- Rename latency_ms columns to response_time_ms for clarity
-- Uses IF EXISTS guards so the migration is idempotent and safe to re-run

-- Step 1: Rename request_logs.latency_ms → request_logs.response_time_ms
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'request_logs'
      AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE "request_logs" RENAME COLUMN "latency_ms" TO "response_time_ms";
  END IF;
END $$;

-- Step 2: Rename health_runs.latency_ms → health_runs.response_time_ms
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'health_runs'
      AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE "health_runs" RENAME COLUMN "latency_ms" TO "response_time_ms";
  END IF;
END $$;
