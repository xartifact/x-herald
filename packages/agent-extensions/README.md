# x-herald agent extension

Auto-discovers the model catalogue for the `x-herald` provider from its
OpenAI-compatible `/models` endpoint, replacing the hard-coded `models` list in
the runtime's model config. The package is the single home for all
x-herald agent-runtime extensions (pi/omp/prime-agent today; openclaw,
hermes, ... later) — the extension adapts internally via runtime
detection, and new runtimes slot into that detection without changing
the package layout.

## Why

The gateway is the canonical source for which models exist and what each one
supports (context window, max output, vision/reasoning capabilities). Hard-coding
that in `models.json` drifts the moment someone adds or removes a model on the
gateway side.

Model discovery is dynamic in all runtimes — no restart needed when the
gateway adds or removes a model:

- **pi** (0.83+): the provider is seeded at startup, then re-fetched via the
  `refreshModels` hook every time the model selector opens.
- **omp**: the provider registers a `fetchDynamicModels` hook; omp fetches
  the catalogue at startup and caches it in its SQLite model cache (default
  24 h TTL). omp also auto-discovers any `api: openai-completions` provider
  with a `baseUrl` + `apiKey` in `models.yml`, so either path keeps the
  catalogue fresh.
- **prime-agent**: shares pi's extension ABI (same registerProvider /
  refreshModels surface), using `~/.prime/agent` for config; behaves like
  pi (eager seed + refreshModels, no SQLite model cache).

`/x-herald refresh` re-fetches and re-registers on demand.

## Repository layout

```
packages/agent-extensions/          # single home for all agent-runtime extensions
├── package.json                    # workspace manifest (typecheck/test) + pi/omp/prime extension entry
├── tsconfig.json                   # dual-runtime (Node + Bun) TS config
├── index.ts                        # entrypoint (auto-discovered by pi/omp/prime)
├── schemas/
│   └── v1-models.schema.json       # canonical /v1/models JSON Schema
└── src/
    ├── entry.ts                    # startup wiring (eager seed vs fetchDynamicModels)
    ├── config.ts                   # config resolution + $ENV_VAR refs
    ├── runtime.ts                  # runtime detection — the ONLY module naming runtimes
    ├── gateway.ts                  # /models HTTP client + provider config builder
    ├── model-mapping.ts            # GatewayModelEntry → ProviderModelConfig
    ├── diagnose.ts                 # schema-level validation report
    ├── commands.ts                 # /x-herald admin commands
    ├── types.ts                    # constants + response types (mirror of shared ModelSchema)
    └── agent-shim.d.ts             # narrow ambient types for the runtime APIs
```

The extension adapts internally: `runtime.ts` detects which agent is hosting
it (pi vs omp vs prime-agent) and `entry.ts` wires the runtime-appropriate
discovery mechanism (prime-agent takes the pi path — eager seed +
refreshModels). The deployment target directory is always
`~/.<agent>/agent/extensions/x-herald/` regardless of host.

The canonical JSON Schema at `schemas/v1-models.schema.json` is the single
source of truth for the `/v1/models` contract: the gateway's own
`apps/gateway/src/__tests__/v1-models.test.ts` compiles it with ajv and
validates live responses against it (closed set), and the extension's
`contract-sync.test.ts` asserts the shared TS types stay in sync.

## Installation

```bash
# copy the extension into every installed runtime (~/.pi, ~/.omp, ~/.prime)
./scripts/install-extension.sh

# a single runtime
./scripts/install-extension.sh --runtime omp
./scripts/install-extension.sh --runtime prime

# dev mode: symlink the source directory (edits apply on next /reload)
./scripts/install-extension.sh --symlink
```

The script copies the extension to `~/.pi/agent/extensions/x-herald/` (or
`~/.omp/...` / `~/.prime/...`) together with its only runtime dependency
(`js-yaml`). Reload the runtime afterwards (`/reload` in pi/prime-agent,
restart omp).

## Configuration precedence

| Setting    | Order (first wins)                                                |
| ---------- | ----------------------------------------------------------------- |
| `baseUrl`  | `models.json` / `models.yml` → `$X_HERALD_BASE_URL` → `http://localhost:5005/api/v1` |
| `apiKey`   | `models.{json,yml}.apiKey` → `auth.json["x-herald"].key` [pi] → `$X_HERALD_API_KEY` |
| `api`      | `models.{json,yml}.api` → `"openai-completions"`                       |

`models.json` is the pi/prime-agent convention, `models.yml` the omp one;
both `apiKey` fields may use `$ENV_VAR` / `${ENV_VAR}` syntax, resolved
before the fetch. omp and prime-agent store credentials in storage not
readable from extensions (omp's SQLite AuthStorage; empty auth.json under
prime until login), so their users inline `apiKey` in the models file or
use the env var.

### Ports

The default `baseUrl` targets `localhost:5005` — the deployment topology
(docker maps the gateway to host port 5005, see `HOST_PORT` in `.env`). When
running the gateway in dev (`bun run dev:gateway`, port 3000), override:

```bash
export X_HERALD_BASE_URL=http://localhost:3000/api/v1
```

## Fallback behavior

If `/models` fails (network error, timeout, malformed response, empty list)
the extension does **not** call `registerProvider`. The static list from
`models.json` stays active and the runtime starts normally. A warning is
written to stderr with the `[x-herald]` prefix. Under omp, the SQLite model
cache keeps the last good catalogue for up to 24 h.

## Gateway response shape

```jsonc
{
  "object": "list",
  "data": [
    {
      "id": "Plan",
      "owned_by": "x-herald",
      "context_window": 8192,
      "max_output_tokens": 4096,
      "capabilities": {
        "streaming": true,
        "function_calling": true,
        "vision": true,
        "json_mode": true,
        "reasoning": false
      }
    }
  ]
}
```

Newer gateway versions additionally emit camelCase mirrors of the snake_case
keys (`contextWindow`, `maxTokens`, `reasoning`, `input`, `maxTokensField`)
plus the OpenAI-standard `context_length` and `mediaInput`. The schema and the
mapper accept them: snake_case wins, camelCase is a fallback. Unknown extra
fields are reported by `/x-herald diagnose` as drift, never fatal.

Field mapping (per model):

| Gateway field               | pi field          | Fallback                       |
| --------------------------- | ----------------- | ------------------------------ |
| `id`                        | `id`, `name`      | —                              |
| `name`                      | `name`            | falls back to `id`             |
| `context_window`            | `contextWindow`   | `contextWindow` → `context_length` → `128_000` |
| `max_output_tokens`         | `maxTokens`       | `0` ⇒ `⌊contextWindow / 2⌋`; missing ⇒ `maxTokens` ⇒ `max_tokens` ⇒ `16_384` |
| `capabilities.vision`       | `input`           | `input` mirror contains `"image"` ⇒ `["text","image"]` |
| `capabilities.reasoning`    | `reasoning`       | `reasoning` mirror → `false`  |
| `compat.*`                  | `compat.*`        | `maxTokensField` mirror fills `compat.max_tokens_field` when absent |
| `thinking_level_map.*`      | `thinkingLevelMap`| pi's level names ↔ provider values |
| `headers`                   | `headers`         | literal per-model request headers |
| `cost`                      | `cost`            | map `cache_read`/`cache_write` and `tiers` from gateway |

### `max_output_tokens` semantics

- Gateway returns `0`: **unlimited** output. Extension maps it to
  `⌊context_window / 2⌋` (rounded down) — a practical ceiling that leaves
  half of the context budget for the prompt.
- Gateway returns positive number: use as-is.
- Gateway returns nothing: fall back to `DEFAULT_MAX_TOKENS = 16_384`.
- Negative values are rejected by the v1 schema, so the extension will
  treat them like missing and fall back.

## Testing

```bash
# extension unit + contract-sync tests (model-mapping, config, diagnose, runtime)
cd packages/agent-extensions && bun test

# full repo gate (typecheck, lint, format, backend tests incl. schema validation)
bun run ci
```

## Admin commands under `/x-herald`

| Sub-command       | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `/x-herald refresh` | Re-fetch `/models` and re-register the provider (no `/reload` needed).    |
| `/x-herald diagnose`| Fetch `/models` and validate against `schemas/v1-models.schema.json`. Result is rendered in a widget above the editor; notification shows pass/fail count. |
| `/x-herald version` | Show extension version.                                                   |
| `/x-herald help`    | Show sub-command reference.                                               |

Autocomplete (when typing `/x-herald `) suggests `refresh`, `diagnose`, `version`, `help`.

## Refreshing the model list

| Command            | What reloads                | When to use                            |
| ------------------ | --------------------------- | -------------------------------------- |
| `/x-herald refresh`  | Only the model catalogue    | Gateway added/removed/updated a model  |
| `/reload`          | Extensions + skills + models | Extension code changed; full restart   |
| Restart the runtime | Everything                  | Last resort                            |

`/x-herald refresh` calls `pi.registerProvider(...)` again at runtime,
which the runtime applies immediately — no `/reload` required.