-- 删除 model_routes 表
--
-- 路由规则的运行时单一事实源已在 0039/0041 迁移到 canvas_states.graph
-- （CanvasRouteEngine 直接从 canvas_states 编译 RouteMatcher，不再读 model_routes）。
-- model_routes 此前保留作只读快照供回滚/审计使用，
-- 现已确认没有代码路径依赖它（CRUD API、config-io 导出/导入、access-models
-- 删除联动清理均已下线），可以安全删除。
--
-- 没有其它表通过外键引用 model_routes.id（accessModelIds 是应用层维护的
-- text[] 数组，从未建立真实 FK 约束），DROP TABLE 无需 CASCADE。

DROP TABLE IF EXISTS "model_routes";
