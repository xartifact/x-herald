-- 删除意图日志的 user_message_snippet 列。
-- 历史兼容期已结束：user_message (text) 自 0033 起始终保存全量文本。
-- 旧列仅存 500 字符截断、且前端已不再渲染；继续保留只会引入误导。
ALTER TABLE "intent_logs"
  DROP COLUMN IF EXISTS "user_message_snippet";
