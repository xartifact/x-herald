-- 强化意图识别可观测性：单独持久化分类器实际返回的 category。
-- 之前只能从 classifier_raw_response (text) 里反查 JSON，运维和告警都不方便。
-- 新增 classifier_category 字段：
--   - 分类器成功解析时写入 JSON.category 值（即使该 category 不在 route config
--     的 targetGroupIds 中也照写，让运维能看到 "AI 想路由到 X，但配置没接住"）
--   - 解析失败/provider 不可用等场景写 NULL（语义等同于"分类器没给出答案"）
-- 配套 idx_intent_logs_classifier_category 用于按 category 检索（"过去 24h
-- 分类器说 复杂任务 但被忽略的次数"）。
ALTER TABLE "intent_logs"
  ADD COLUMN IF NOT EXISTS "classifier_category" varchar(255);

CREATE INDEX IF NOT EXISTS "idx_intent_logs_classifier_category"
  ON "intent_logs" ("classifier_category");
