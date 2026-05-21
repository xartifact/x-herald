-- Add provider_request_headers column to request_logs table
-- This column stores the headers sent to the provider for complete request chain tracking

ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "provider_request_headers" jsonb;

-- Add index for potential queries on provider_request_headers
CREATE INDEX IF NOT EXISTS "idx_request_logs_provider_request_headers"
ON "request_logs" ("provider_request_headers")
WHERE "provider_request_headers" IS NOT NULL;
