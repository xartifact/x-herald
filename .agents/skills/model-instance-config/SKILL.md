---
name: model-instance-config
description: Use when a model request fails or behaves unexpectedly because of a model_instance's config — e.g. OpenAI SDK sends `role: developer` and an upstream (X-AIO, some OpenAI-compatible endpoints) rejects it with `400 [invalid_request_error] ... unknown variant 'developer'`; or thinking-mode 400 `reasoning_content must be passed back` needing `patchMissingReasoningContent`; or per-instance timeouts / retries / custom headers need tuning. Also for reading, setting, or removing any model_instances.config key (roleMapping, patchMissingReasoningContent, timeoutConfig, retryConfig, customHeaders, etc.) on the gateway admin API without touching the database directly.
---

# Model Instance Config (CLI)

Update `model_instances.config` through the x-herald management API via the CLI — **no direct database access**.

The CLI wraps an idempotent read-modify-write: it reads the instance's current config, merges the change, and PUTs it back (preserving unchanged keys). Requires an admin JWT.

## When to Use

- `400 [invalid_request_error] ... unknown variant \`developer\`` from an OpenAI-compatible upstream after an OpenAI-role request.
  **Fix**: set `roleMapping = {"developer": "system"}` on the affected instance(s).
- `400 [invalid_request_error] The reasoning_content ... must be passed back to the API` (Kimi/DeepSeek thinking models).
  **Fix**: set `patchMissingReasoningContent = true`.
- Tuning per-instance `timeoutConfig`, `retryConfig`, `customHeaders`, `capabilityOverrides`, etc.
- Inspecting which instance config is active before diagnosing a routing issue.

## Prerequisites

The CLI talks to the admin API with a JWT. Obtain one:

```bash
# 1. Login — returns { token }. Password is the gateway ADMIN_PASSWORD.
TOKEN=$(curl -s -X POST "$X_HERALD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" | jq -r .token)

# run CLI from apps/cli
cd apps/cli
alias xh="bun run src/index.ts -u ${X_HERALD_URL:-http://localhost:3000} -k $TOKEN"
```

`X_HERALD_URL` is the admin API base (e.g. `http://100.80.110.125:5005` for production). `X_HERALD_API_KEY` env also works in place of `-k`.

## Commands

```bash
# List all model instances (ID, name, actual model, provider, enabled)
xh instances list

# Show a full config (JSON)
xh instances config <id-or-name>

# Show a single key
xh instances config-get <id-or-name> <key>

# Set one key (read-modify-write; JSON value). Missing key → created; existing → replaced.
xh instances config-set <id-or-name> <key> '<json>'

# Example: fix developer-role rejection
xh instances config-set DeepSeek-V4-Flash-0731 roleMapping '{"developer":"system"}'

# Example: enable thinking-mode fix
xh instances config-set <instance> patchMissingReasoningContent 'true'

# Remove a key (preserves other keys)
xh instances config-unset <id-or-name> <key>
```

`<id-or-name>` resolves by instance `id`, `name`, or `actual_model_name`.

## Notes

- **Config is per-instance.** X-AIO routes share one upstream Rust deserializer, so all enabled X-AIO instances that can receive OpenAI `developer` requests should each be configured (the CLI applies to one instance per call — loop over `instances list` filtered by provider if needed).
- `config-set` merges at the top-level key: setting `roleMapping` replaces the whole `roleMapping` object; it does not deep-merge inside it. Set the full object value.
- The CLI does **not** modify schema/DDL — only `model_instances.config` via the admin API.
