CREATE TABLE "model_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_model_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "virtual_models" DROP CONSTRAINT "virtual_models_model_group_id_model_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "virtual_models" ALTER COLUMN "model_group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "virtual_models" ADD COLUMN "routing_config" jsonb;--> statement-breakpoint
ALTER TABLE "model_mappings" ADD CONSTRAINT "model_mappings_virtual_model_id_virtual_models_id_fk" FOREIGN KEY ("virtual_model_id") REFERENCES "public"."virtual_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_models" ADD CONSTRAINT "virtual_models_model_group_id_model_groups_id_fk" FOREIGN KEY ("model_group_id") REFERENCES "public"."model_groups"("id") ON DELETE set null ON UPDATE no action;