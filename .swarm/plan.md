<!-- PLAN_HASH: 1xqcnoamk37cj -->
# Model Request Rank System
Swarm: default
Phase: 1 [COMPLETE] | Updated: 2026-03-27T08:41:21.544Z

---
## Phase 1: Database Schema & Core Infrastructure [COMPLETE]
- [x] 1.1: Add model_request_stats table to database schema (features/logs/db.ts). Fields: modelId (PK), requestCount, lastRequestAt, currentScore, lastScoredAt. Add indexes on lastRequestAt and currentScore DESC. Verification: Query table structure in Drizzle Studio. [SMALL]
- [x] 1.2: Generate and run Drizzle migration for model_request_stats table. Run `bun run db:generate` and `bun run db:migrate`. Verification: Query model_request_stats in database returns empty table. [SMALL] (depends: 1.1)
- [x] 1.3: Create rank calculation service (features/logs/services/rank-calculator.ts). Implement exponential decay algorithm with λ = ln(2)/7, support hourly batch calculation, handle edge cases (cold start, timezone, drift). Verification: Unit tests pass with known inputs/outputs. [MEDIUM] (depends: 1.2)
- [x] 1.4: Create rank recalculation API endpoint (features/logs/routes.ts). Add POST /api/logs/rank-recalculate that triggers batch score update. Returns { updated: number, duration: ms }. This endpoint will be called by external cron service (e.g., Vercel Cron, cron-job.org). Verification: Manual API call updates scores. [SMALL] (depends: 1.3)

---
## Phase 2: Enhanced Model Recording [PENDING]
- [ ] 2.1: Enhance client-model-recorder.ts to also update model_request_stats table. On each request, increment requestCount and update lastRequestAt atomically using upsert. Verification: Make test request, query both tables show updated counts. [SMALL]
- [ ] 2.2: Add migration script to initialize model_request_stats from existing client_requested_models data. Create features/logs/services/migrate-stats.ts script. Calculate initial scores based on current requestCount and lastSeenAt. Verification: Run script, query model_request_stats shows migrated data. [SMALL] (depends: 2.1)

---
## Phase 3: Rank API Implementation [PENDING]
- [ ] 3.1: Create Rank API types and interfaces (features/logs/types.ts). Define ModelRank, RankQueryParams, RankStatistics types. Verification: TypeScript compilation succeeds, types exported from index. [SMALL]
- [ ] 3.2: Implement Rank API routes (features/logs/routes.ts). Add GET /api/logs/model-ranks (list with pagination/sorting), GET /api/logs/model-ranks/:modelName (detail), GET /api/logs/model-ranks/statistics (aggregated stats). Verification: API endpoints return correct JSON, response time < 200ms. [MEDIUM] (depends: 1.3, 3.1)
- [ ] 3.3: Create React Query hooks for rank data (hooks/use-model-ranks.ts). Export useModelRanks(), useModelRankDetail(), useRankStatistics() hooks following existing use-logs.ts pattern. Verification: Hooks return data in React component. [SMALL] (depends: 3.2)

---
## Phase 4: Router Integration [PENDING]
- [ ] 4.1: Add rank-based weight adjustment to ModelGroupRouter smart strategy (features/gateway/services/model-group-router.ts). Inject rank data into scoring formula, fallback to default weights if rank unavailable. Verification: Make requests with smart strategy, check routing decisions correlate with rank. [MEDIUM]
- [ ] 4.2: Add rank data caching layer (features/gateway/services/rank-cache.ts). In-memory cache for top 100 models with 5-minute TTL. Cache refreshes on TTL expiry (no explicit invalidation). Verification: Check cache hit rate > 90% during load test. [SMALL] (depends: 4.1)

---
## Phase 5: Frontend Implementation [PENDING]
- [ ] 5.1: Create Model Ranks list page (app/admin/logs/model-ranks/page.tsx). Display table with rank, model name, request count, score, last request time. Add sorting, search, pagination. Verification: Page loads < 2s, all interactions work. [MEDIUM]
- [ ] 5.2: Create rank table components (features/logs/components/rank-table.tsx). Use shadcn/ui Table, add rank badge, format numbers and timestamps. Verification: Component renders correctly in Storybook or test page. [SMALL]
