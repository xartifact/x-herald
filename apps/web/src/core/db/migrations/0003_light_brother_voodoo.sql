ALTER TABLE "request_logs" ADD COLUMN "provider_response_body" jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "standard_response_body" jsonb;