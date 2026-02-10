ALTER TABLE "request_logs" ADD COLUMN "stream_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "stream_progress" jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "stream_content" jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "stream_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "stream_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "last_updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "is_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_request_logs_stream_status" ON "request_logs" USING btree ("stream_status");--> statement-breakpoint
CREATE INDEX "idx_request_logs_is_complete" ON "request_logs" USING btree ("is_complete");--> statement-breakpoint
CREATE INDEX "idx_stream_status_complete" ON "request_logs" USING btree ("stream_status","is_complete");--> statement-breakpoint
CREATE INDEX "idx_request_logs_last_updated_at" ON "request_logs" USING btree ("last_updated_at");--> statement-breakpoint

-- 数据迁移：为现有流式日志填充默认值
UPDATE request_logs
SET
  stream_status = CASE
    WHEN status = 'success' THEN 'completed'::varchar
    WHEN status = 'failure' THEN 'failed'::varchar
    ELSE 'completed'::varchar
  END,
  is_complete = TRUE,
  stream_started_at = created_at,
  stream_completed_at = created_at,
  last_updated_at = created_at
WHERE streaming = 'true' AND stream_status IS NULL;