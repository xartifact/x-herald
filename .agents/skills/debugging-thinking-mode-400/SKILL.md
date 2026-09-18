---
name: debugging-thinking-mode-400
description: Use when x-herald returns 400 [invalid_request_error] "The reasoning_content in the thinking mode must be passed back to the API" — thinking-mode (Kimi/DeepSeek) multi-turn chat failures, missing reasoning_content on assistant messages, or patchMissingReasoningContent config missing/disabled on model_instances. Also for diagnosing why a request routed to a specific instance (priority/weight/enabled) in production.
---

# Debugging Thinking-Mode 400 (reasoning_content)

## Overview

Kimi/DeepSeek-class thinking models **require every assistant message in the history to carry `reasoning_content`**. OpenAI SDK clients drop this field, so multi-turn requests fail upstream with `400 [invalid_request_error] The reasoning_content in the thinking mode must be passed back to the API`.

x-herald's fix: per-instance config `patchMissingReasoningContent: true` injects `reasoning_content: ''` on assistant messages that lack it. This skill is the end-to-end path to find why the request hit an instance without that flag.

## When to Use

- Error message contains `reasoning_content` / `thinking mode must be passed back`.
- `400 invalid_request_error` from an OpenAI-compatible upstream on multi-turn or tool-call-heavy conversations.
- Investigating which instance served a request (router decision) in production.
- `model_instances.config` is `null` or missing `patchMissingReasoningContent`.

**Not for:** Anthropic-format thinking blocks (`thinking`/`signature`) — those are converted separately in `transformer/protocols/anthropic/`.

## Quick Reference

| Concern | Answer |
| ------- | ------ |
| Patch logic | `apps/gateway/src/gateway/transformer/protocols/openai/egress.ts` (`adaptOpenAIRequest`, ~L89-96) |
| Config source | `model_instances.config` JSONB — `{"patchMissingReasoningContent": true}` |
| Config load | Per-request from DB: `handlers/openai/chat-completion-executor.ts` (~L130) — **no restart needed** |
| Instance selection | `services/router-selector.ts` — `priority` ascending, `weight`, `enabled=false` excluded |
| Request history | DB `request_attempts` (per-instance) + `request_logs` (per-request) |
| Production host | `tailscale.x99-arch-server.local`, container `x-herald`, DB creds in container env (`DB_HOST` etc.) |

## Diagnosis Path (production)

```text
1. Capture file (omp ~/.omp/logs/http-400-requests/*.json) → model, reasoning_effort, messages
2. access_models → find by name  (route_rules.access_model_id)
3. route_rules.graph → action chain (intent → fallback → target group id)
4. model_group_memberships → instances in target group (priority/weight/enabled)
5. model_instances.config → patchMissingReasoningContent present?
6. request_attempts → which instance_id actually got the 400 (confirm, don't assume)
```

## Reusable DB Diagnostic (run inside container)

Container has `packages/db/node_modules/postgres`; query with Bun one-liners:

```bash
docker exec x-herald sh -c 'cd /app/packages/db && bun -e "
import postgres from \"postgres\";
const sql = postgres({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME, username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === \"true\" ? { rejectUnauthorized: false } : false,
  max: 1, onnotice: () => {},
});
const q = (s, a) => sql.unsafe(s, a);

// 1) access model by name
console.log(JSON.stringify(await q(\"select id, name, enabled from access_models where deleted_at is null and name ilike \\\$1\", [\"%Plan%\"])));
// 2) active route rule graph for that access model
console.log(JSON.stringify(await q(\"select id, name, active, graph from route_rules where access_model_id = \\\$1\", [\"<AM_ID>\"])));
// 3) instances in the target group, with priority/weight/enabled/config
console.log(JSON.stringify(await q(\"select mi.id, mi.name, mi.priority, mi.weight, mi.enabled, mi.config, p.name as provider from model_group_memberships mgm join model_instances mi on mi.id = mgm.instance_id left join providers p on p.id = mi.provider_id where mgm.group_id = \\\$1\", [\"<GROUP_ID>\"])));
// 4) which instance actually failed (past 24h)
console.log(JSON.stringify(await q(\"select ra.instance_id, ra.provider_name, ra.status_code, ra.created_at from request_attempts ra where ra.created_at >= now() - interval \\\$1 and ra.provider_response_body::text ilike \\\$2 order by ra.created_at desc limit 10\", [\"24 hours\", \"%reasoning_content%\"])));
await sql.end();
"'
```

Notes: pass scripts via stdin (`ssh host 'bash -s' < script.sh`) to avoid fish/quotes escaping pain. `$$` and `$` get eaten by shells — prefer `sql.unsafe` with bound args.

## Fix

```sql
UPDATE model_instances
SET config = '{"patchMissingReasoningContent": true}', updated_at = now()
WHERE id = '<INSTANCE_ID>';   -- DML only; schema changes still require migrations
```

Effective immediately (config read per-request); **no container restart**. Verify: `request_attempts` for that instance shows 200s, no new `reasoning_content` errors.

## Common Mistakes

- **Assuming the group's "primary" instance was used** — the router picks per priority/weight; a disabled `enabled=false` backup is invisible. Always confirm via `request_attempts.instance_id`.
- **Checking only the group, not the graph** — intent/capability/fallback nodes redirect to other groups. Read the whole `route_rules.graph`.
- **Config on the wrong instance** — same model name exists across providers (e.g. `deepseek-v4-flash` × 3). Patch by UUID, not name.
- **Touching schema for a data fix** — `model_instances.config` is DML (UPDATE); migrations are only for DDL.
- **Restarting to "apply config"** — config loads per request; a restart is wasted downtime.
- **Missing the enabled=false trap** — the only enabled instance may be the only unpatched one (the 0731 case: priority 0, enabled, config null).
