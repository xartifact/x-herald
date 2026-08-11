-- Breaking change：route_rules（按接入模型的多版本）取代 canvas_states（单一全局画布）。
-- 不做数据回填——现有 canvas_states 数据直接丢弃，管理员在新架构上重新配置路由规则。
DROP TABLE IF EXISTS canvas_states;
