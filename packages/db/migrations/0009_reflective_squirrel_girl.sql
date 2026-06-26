CREATE TABLE "model_request_stats" (
	"model_id" varchar(255) PRIMARY KEY NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"last_request_at" timestamp NOT NULL,
	"current_score" double precision DEFAULT 0 NOT NULL,
	"last_scored_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_model_stats_last_request" ON "model_request_stats" USING btree ("last_request_at");--> statement-breakpoint
CREATE INDEX "idx_model_stats_current_score" ON "model_request_stats" USING btree ("current_score");