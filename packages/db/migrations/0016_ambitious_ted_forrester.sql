CREATE TABLE "circuit_breaker_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" varchar(255) NOT NULL,
	"instance_name" varchar(255) DEFAULT '' NOT NULL,
	"group_name" varchar(255) DEFAULT '' NOT NULL,
	"provider_name" varchar(255) DEFAULT '' NOT NULL,
	"event" varchar(20) NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"open_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cb_events_instance_id" ON "circuit_breaker_events" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_cb_events_created_at" ON "circuit_breaker_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_cb_events_event" ON "circuit_breaker_events" USING btree ("event");