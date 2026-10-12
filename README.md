# x-herald

> A transparent, high-availability LLM Gateway — protocol conversion, intent-aware routing, and production-grade observability.

[English](./README.md) · [简体中文](./README.zh-CN.md)

[![Runtime](https://img.shields.io/badge/runtime-Bun%201.3%2B-f9f1e5?logo=bun)]() [![Tests](https://img.shields.io/badge/tests-1900%2B%20pass-brightgreen)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## Overview

x-herald is a **transparent proxy** for LLM providers (first principle: requests pass through in their original protocol; conversion happens only when necessary). It decouples the model names you expose to clients (access models) from the actual backend instances that serve them, and routes between instances with a compiled rule engine.

```
Client (OpenAI / Anthropic / Responses / JEV SDK)
   │  virtual key (sk-…)
   ▼
┌────────────────────────── x-herald gateway ──────────────────────────┐
│  auth + rate limit → protocol detect → normalize → route → failover  │
│  → adapt → upstream → SSE transform → log / metrics / cost           │
└──────────────────────────────────────────────────────────────────────┘
   │                        │                        │
   ▼                        ▼                        ▼
 Provider A              Provider B              Provider C
 (OpenAI-compatible)     (Anthropic)             (custom / JEV)
```

---

## Features

### Proxy & protocol

| Capability | Status |
| --- | --- |
| OpenAI ⇄ Anthropic bidirectional protocol conversion | 🔄 |
| OpenAI Responses API (`/api/v1/responses`) native proxy + usage extraction | ✅ |
| Same-protocol passthrough (zero transformation overhead) | ✅ |
| Streaming (SSE) bidirectional conversion, thinking-block support | 🔄 |
| JEV System One transparent proxy (typed decisions, not chat) | ✅ |
| Embeddings with dimension enforcement (matryoshka truncation) | ✅ |

> 🔄 — implemented and tested (unit + end-to-end against mock upstream), not yet exercised by production cross-protocol traffic.

### Routing

| Capability | Status |
| --- | --- |
| Access models (client-facing names) decoupled from instances | ✅ |
| Route-rule engine: conditions on model / key / streaming / hour / client type / perf | ✅ |
| Rule actions: route-to-group, route-to-instance, intent, capability, fallback, reject | ✅ |
| Intent routing: small-model classifier dispatches by conversation intent | ✅ |
| Fallback chains (primary/backup degradation, e.g. on rate limit) | ✅ |
| Potential-model detection for unknown requested models | ✅ |
| Route traces: per-request chain with per-candidate outcomes | ✅ |

### High availability

| Capability | Status |
| --- | --- |
| Instance-level failover with retry (exponential backoff) | ✅ |
| Circuit breaker per instance (auto-open on consecutive failures, DB-backed recovery) | ✅ |
| TTFB timeout policy (per-instance config, total-budget control, P95 baseline scaling) | ✅ |
| Upstream stream idle watchdog | ✅ |
| Health checks + performance snapshots (TTFB / success rate / TPS) | ✅ |
| Anomaly detection (> 2× baseline auto-flags, feeds routing context) | ✅ |

### Observability & cost

| Capability | Status |
| --- | --- |
| Full request logs: headers, bodies, stream content, per-attempt details | ✅ |
| Live traffic panel (SSE push, waiting/active states, manual cancel) | ✅ |
| **Accurate disconnect semantics**: `cancelled` vs `failure`, three-way disconnect classification (`complete_then_hangup` / `mid_stream_cancel` / `no_data_received`), usage billed on early client hangup | ✅ |
| Actual routed model recorded even when the upstream response never arrives (falls back to instance's `actualModelName`) | ✅ |
| Cost tracking per key / provider / model | ✅ |
| Prometheus `/metrics` endpoint | ✅ |
| AI-assisted error diagnosis | ✅ |

### Security & multi-tenancy

| Capability | Status |
| --- | --- |
| Virtual keys (Bearer / x-api-key, 30s cache) | ✅ |
| Per-key RPM / RPD / token rate limits (`X-RateLimit-*` headers) | ✅ |
| Key enable/disable/expiry, allowed-models allowlist | ✅ |
| **Workspace isolation** (providers, groups, keys, logs, routing scoped per workspace) | ✅ |
| JWT admin API | ✅ |

### Admin console

Dashboard, providers, model groups & instances, access models + route rules (visual editor), keys, logs (live + detail viewer), routing traces, intent recognition, potential models, circuit breakers, costs, metrics, provider stats, route overview, client models, console logs, AI assist, settings, config import/export (JSON), workspace switcher.

---

## Tech stack

**Backend** — Bun 1.3+ · Hono 4 · Bun.serve() (runs TypeScript directly) · PostgreSQL 16 / PGlite (embedded) · Drizzle ORM · Zod 4 · Pino · prom-client

**Frontend** — React 19 · TanStack Router + Query v5 · Vite 8 · shadcn/ui (new-york) · TailwindCSS v4 · Recharts · @xyflow/react · Monaco

**Engineering** — Bun workspaces · oxlint · oxfmt · bun:test / Vitest / Playwright · GitHub Actions CI · Docker

---

## Project structure

```
x-herald/
├── apps/
│   ├── gateway/          # Gateway core (Hono + Bun.serve)
│   │   └── src/
│   │       ├── gateway/     # routes / handlers / transformers / services
│   │       ├── features/    # auth, providers, keys, logs, metrics, costs,
│   │       │                # route-rules, workspaces, routing-traces, ...
│   │       └── test/        # factories, mock upstream, proxy test helpers
│   ├── web/              # Admin SPA (TanStack Router + React 19)
│   └── cli/              # Admin CLI
├── packages/
│   ├── db/              # Drizzle schema + migrations (single source of truth)
│   ├── shared/           # Types, Zod schemas, constants (FE/BE contract)
│   ├── ui/               # shadcn/ui component library + admin components
│   └── ai-agent/         # AI agent SDK
└── docs/
```

---

## Quick start

```bash
bun install              # install dependencies
cp .env.example .env     # optional: configure env

bun run dev              # gateway + admin SPA
```

Default dev ports: gateway `43173` (`PORT` to override), SPA `5173` (Vite auto-increments if taken). The Vite `/api` proxy targets `http://localhost:43173` (override with `GATEWAY_API_PROXY`).

### Quality gates

```bash
bun run check           # format + lint + typecheck (all packages)
bun run ci              # full local CI (check + tests)
bun run test            # backend tests (bun:test, 1900+)
bun run test:ui         # UI component tests (Vitest)
bun run test:e2e:ui     # Playwright E2E
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `DB_TYPE` | `postgres` or `pglite` | auto-detect |
| `JWT_SECRET` | JWT signing secret | — |
| `ADMIN_PASSWORD` | Initial admin password | `change-me-in-production` |
| `LOG_LEVEL` | trace/debug/info/warn/error | `info` |

---

## Gateway API

All `/api/v1` requests require a virtual key: `Authorization: Bearer sk-…`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/chat/completions` | OpenAI Chat Completions |
| `POST` | `/api/v1/responses` | OpenAI Responses API |
| `POST` | `/api/v1/messages` | Anthropic Messages |
| `POST` | `/api/v1/messages/count_tokens` | Anthropic token counting |
| `POST` | `/api/v1/systemone` | JEV System One (transparent) |
| `POST` | `/api/v1/embeddings` | Embeddings |
| `GET`  | `/api/v1/models` | Available access models |
| `GET`  | `/metrics` | Prometheus metrics |

Admin API (JWT): `/api/providers`, `/api/model-groups`, `/api/access-models`, `/api/route-rules`, `/api/keys`, `/api/logs`, `/api/routing-traces`, `/api/costs`, `/api/circuit-breakers`, `/api/workspaces`, `/api/config`, `/api/settings`, …

Example:

```bash
curl http://localhost:43173/api/v1/chat/completions \
  -H 'Authorization: Bearer sk-your-virtual-key' \
  -H 'Content-Type: application/json' \
  -d '{"model": "Plan", "messages": [{"role": "user", "content": "hi"}], "stream": true}'
```

The client-facing model `Plan` is resolved by the route-rule engine to a concrete instance (e.g. `glm-5.3` on provider X-AIO), with failover, circuit breaking and cost accounting applied along the way.

---

## Docker deployment

```bash
docker compose build
docker compose up -d
docker compose logs -f x-herald
```

Image: `ghcr.io/xartifact/x-herald:alpha`

---

## Documentation

- `docs/architecture-fix-plan.md` — architecture fix plan
- `docs/troubleshooting-thinking-mode-400.md` — thinking-mode 400 (reasoning_content) playbook
- `docs/client-disconnect-logging-fix-plan.md` — client-disconnect logging semantics
- `docs/log-storage-optimization-plan.md` — log storage optimization
- `docs/i18n-architecture.md` — i18n architecture

---

## License

MIT

## Acknowledgements

- [llm-gateway](https://github.com/sxueck/llm-gateway) — original project and inspiration
- [LiteLLM](https://github.com/BerriAI/litellm) — LLM proxy reference
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) — architecture pattern reference
