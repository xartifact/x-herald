-- 请求日志删除支持：request_attempts 外键级联删除。
-- 原 FK 无 ON DELETE CASCADE（默认 RESTRICT），删除 request_logs 行时
-- 只要存在关联 attempt 就违反外键约束，导致日志页"删除"功能报
-- LOG_DELETE_ERROR。attempts 是 request_logs 的明细子表，父行删除时
-- 子行一并删除是正确语义（与 request_logs 上其它子表一致）。
ALTER TABLE "request_attempts" DROP CONSTRAINT IF EXISTS "request_attempts_request_log_id_fkey";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_attempts" ADD CONSTRAINT "request_attempts_request_log_id_fkey" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;