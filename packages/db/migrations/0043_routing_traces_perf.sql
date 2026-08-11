-- Performance optimization for routing-traces query
-- listRoutingTraces 查询性能优化：覆盖 candidate_index=0 + cursor 分页 + JSONB routeChain 过滤

-- 1. 复合索引：覆盖 WHERE candidate_index=0 + ORDER BY created_at DESC, id DESC
--    让 cursor 分页走索引扫描，避免回表
CREATE INDEX IF NOT EXISTS "idx_request_logs_candidate_created_id"
  ON "request_logs" ("candidate_index", "created_at" DESC, "id" DESC);

-- 2. 部分索引：只索引有 routeChain 且 candidate_index=0 的行
--    routing-traces 查询的 WHERE 精确匹配此条件，跳过无 routeChain 的 legacy 行
CREATE INDEX IF NOT EXISTS "idx_request_logs_route_chain_partial"
  ON "request_logs" ("created_at" DESC, "id" DESC)
  WHERE "candidate_index" = 0
    AND ("metadata" -> 'routing' -> 'routeChain') IS NOT NULL;
