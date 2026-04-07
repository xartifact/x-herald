# Context

Swarm: default

## Decisions

### Ranking Algorithm

- **Algorithm**: Exponential time decay
- **Lambda (λ)**: ln(2) / 7 ≈ 0.09902 per day
- **Formula**: score = requestCount × e^(-λ × daysSinceLastRequest)
- **Rationale**: Provides smooth decay where recent activity matters more but historical data isn't abruptly discarded

### Update Strategy

- **Frequency**: Hourly batch processing
- **Rationale**: Reduces database write load, rank data can tolerate 1-hour delay
- **Implementation**: Bun timers or cron scheduler

### Frontend Complexity

- **Approach**: Simple table list
- **Features**: Rank, model name, request count, score, last request time
- **Interactions**: Sorting, search, pagination
- **Rationale**: MVP approach, can be enhanced later if needed

### Database Schema

- **New Table**: `model_request_stats`
  - modelId (PK), requestCount, lastRequestAt, currentScore, lastScoredAt
  - Indexes: lastRequestAt, currentScore DESC
- **Existing Table**: `client_requested_models` (continue using for raw tracking)
- **Rationale**: Separate concerns - raw tracking vs aggregated scoring

## SME Cache

### Algorithms & Data Structures

- **λ Calculation**: λ = ln(2) / halfLife = 0.09902 for 7-day half-life
- **Verification**: Day 0 = 100%, Day 7 = 50%, Day 14 = 25%
- **Hourly Adjustment**: HOURLY_LAMBDA = LAMBDA / 24 = 0.004126
- **Performance**: O(n) per batch, O(1) per model
- **Optimizations**: Precompute decay factor, lazy evaluation, composite indexes

### Algorithm Comparison

| Approach                   | Pros                         | Cons                        |
| -------------------------- | ---------------------------- | --------------------------- |
| Exponential Decay (chosen) | Smooth, mathematically sound | Requires timestamp tracking |
| Sliding Window             | Simple, intuitive            | Hard cutoff, ranking jumps  |
| Linear Decay               | Predictable                  | Negative scores possible    |

### Performance Considerations

- **Batch Processing**: O(n) where n = active models
- **Precompute**: decayFactor = e^(-λ), then score \*= decayFactor^hours
- **Lazy Evaluation**: Only recalculate when needed
- **Index Optimization**: Composite index on (model_id, last_request_at)

### Gotchas

1. Timestamp precision: Use milliseconds
2. Floating-point drift: Recalculate from base weekly
3. Cold start: New models need minimum score floor (0.001)
4. Timezone handling: Store in UTC
5. Batch idempotency: Use last_scored_at

## Patterns

### Database

- **Upsert Pattern**: onConflictDoUpdate for atomic increments
- **Dual Table Pattern**: client_requested_models (raw) + model_request_stats (aggregated)
- **Index Strategy**: Composite indexes for batch queries

### Service Layer

- **Lazy Import**: Dynamic imports to avoid circular dependencies
- **Non-blocking Recording**: Errors logged but don't affect main flow
- **Batch Processing**: Scheduled tasks for heavy computations

### API

- **React Query Hooks**: useModelRanks(), useModelRankDetail(), useRankStatistics()
- **Pagination**: Cursor-based for large datasets
- **Caching**: 5-minute TTL for rank data in router

### Frontend

- **Feature-based Structure**: features/logs/ contains all rank-related code
- **Component Reuse**: shadcn/ui Table component
- **Type Safety**: Shared types between frontend and backend

## File Map

### Database Schema

- `apps/web/src/features/logs/db.ts` - Add model_request_stats table

### Services

- `apps/web/src/features/logs/services/client-model-recorder.ts` - Enhance to update stats
- `apps/web/src/features/logs/services/rank-calculator.ts` - New: Score calculation
- `apps/web/src/features/logs/services/rank-scheduler.ts` - New: Hourly batch job
- `apps/web/src/features/gateway/services/rank-cache.ts` - New: Caching layer
- `apps/web/src/features/gateway/services/model-group-router.ts` - Modify: Smart strategy

### API

- `apps/web/src/features/logs/types.ts` - New: Rank types
- `apps/web/src/features/logs/routes.ts` - Modify: Add rank endpoints
- `apps/web/src/features/logs/api.ts` - New: React Query hooks

### Frontend

- `apps/web/src/app/admin/logs/model-ranks/page.tsx` - New: List page
- `apps/web/src/features/logs/components/rank-table.tsx` - New: Table component

## Dependencies

### Existing

- `client-model-recorder.ts` - Continue using
- `log-service.ts` - Integration points at lines 216, 319
- `ModelGroupRouter` - Modify smart strategy

### New

- Database migration for model_request_stats table
- Rank calculation service
- Scheduler (Bun timers or node-cron)
- React Query hooks for rank data

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 112 | 112 | 0 | 54ms |
| glob | 50 | 50 | 0 | 19ms |
| bash | 34 | 34 | 0 | 4464ms |
| task | 26 | 26 | 0 | 95728ms |
| edit | 18 | 18 | 0 | 1157ms |
| grep | 17 | 17 | 0 | 30ms |
| update_task_status | 9 | 9 | 0 | 6ms |
| pre_check_batch | 9 | 9 | 0 | 2522ms |
| write | 4 | 4 | 0 | 988ms |
| diff | 4 | 4 | 0 | 28ms |
| declare_scope | 3 | 3 | 0 | 3ms |
| check_gate_status | 3 | 3 | 0 | 4ms |
| save_plan | 2 | 2 | 0 | 7ms |
| test_runner | 2 | 2 | 0 | 4ms |
| checkpoint | 1 | 1 | 0 | 14ms |
