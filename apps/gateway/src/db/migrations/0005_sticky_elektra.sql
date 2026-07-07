CREATE TABLE "virtual_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"description" text,
	"model_group_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "virtual_models" ADD CONSTRAINT "virtual_models_model_group_id_model_groups_id_fk" FOREIGN KEY ("model_group_id") REFERENCES "public"."model_groups"("id") ON DELETE restrict ON UPDATE no action;