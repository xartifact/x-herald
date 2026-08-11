-- Cleanup: dead tables, legacy config, orphan request attempts
-- 1) model_request_stats: 0 rows, never written to (migrations 0009/0010 created it, no INSERT in code)
-- 2) health_runs + health_targets: 0 rows, features/health/ has no INSERT/UPDATE (feature didn't persist)
-- 3) gateway_configs.initial_routes_seeded: legacy seed flag from the dropped model_routes system, 0 code refs
-- 4) request_attempts: 262 rows reference a request_group_id that no longer exists in request_logs
--    (parent rows were removed without cascade). All idempotent.

DROP TABLE IF EXISTS model_request_stats;
DROP TABLE IF EXISTS health_runs;
DROP TABLE IF EXISTS health_targets;

DELETE FROM gateway_configs WHERE key = 'initial_routes_seeded';

DELETE FROM request_attempts
 WHERE request_group_id NOT IN (SELECT request_group_id FROM request_logs);