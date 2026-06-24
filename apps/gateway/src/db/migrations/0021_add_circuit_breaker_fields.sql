-- Add trip_count and cooldown_until columns to circuit_breaker_events
-- trip_count: tracks cumulative trip count for exponential backoff calculation
-- cooldown_until: tracks the cooling-off period end time after a breaker closes

ALTER TABLE "circuit_breaker_events" ADD COLUMN IF NOT EXISTS "trip_count" integer DEFAULT 0;
ALTER TABLE "circuit_breaker_events" ADD COLUMN IF NOT EXISTS "cooldown_until" timestamp;
