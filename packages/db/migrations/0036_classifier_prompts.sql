-- 分类器系统提示词配置表。
-- 单行设计（每次 UPDATE 在 service 层 INSERT 新行 + UPDATE version），保证
-- 旧 intent_logs.classifier_system_prompt 文本与当时使用的 version 双向可查。
CREATE TABLE IF NOT EXISTS "classifier_prompts" (
  "id" serial PRIMARY KEY NOT NULL,
  "content" text NOT NULL,
  "version" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" varchar(255)
);

CREATE INDEX IF NOT EXISTS "idx_classifier_prompts_version" ON "classifier_prompts" ("version" DESC);