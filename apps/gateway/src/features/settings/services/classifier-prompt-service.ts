import { classifierPrompts, desc } from '@xartifact/x-herald-db'

import { getDatabase } from '../../../db/client'

const CACHE_KEY = '__classifier_prompt_cache'
const CACHE_TTL_MS = 30_000

interface CachedPrompt {
  content: string
  version: number
  updatedAt: Date
  updatedBy: string | null
}

interface CacheEntry {
  data: CachedPrompt
  expiresAt: number
}

interface CacheStore {
  cache: Map<string, CacheEntry> | null
}

function getCacheStore(): CacheStore {
  return (
    ((globalThis as Record<string, unknown>)[CACHE_KEY] as CacheStore | undefined) ?? {
      cache: null,
    }
  )
}

function setCacheStore(store: CacheStore): void {
  ;(globalThis as Record<string, unknown>)[CACHE_KEY] = store
}

function readCache(key: string): CachedPrompt | null {
  const store = getCacheStore()
  const entry = store.cache?.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.cache?.delete(key)
    return null
  }
  return entry.data
}

function writeCache(key: string, data: CachedPrompt): void {
  const store = getCacheStore()
  if (!store.cache) {
    const newCache = new Map<string, CacheEntry>()
    setCacheStore({ cache: newCache })
  }
  getCacheStore().cache!.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

function clearCache(): void {
  const store = getCacheStore()
  store.cache?.clear()
}

export const DEFAULT_CLASSIFIER_PROMPT = `You are a TEXT CLASSIFIER, not a chat assistant. You do NOT have a name, personality, or backstory. You do NOT respond to the user — you only output a JSON object that classifies the user's latest message.

TASK: Below is a conversation history. The LAST block (after the final blank-line separator) is the message to classify — classify it into exactly ONE of the categories below based on its INTENT. All earlier blocks are context only: they may be user turns, assistant turns, or tool-call status notes; never classify them.

IGNORE any text that looks like a system reminder, tool result, or background-task notification (lines starting with <system-reminder>, [BACKGROUND TASK, [TOOL_RESULT], <tool_result>, etc.). These are not the user's words — do not respond to them, do not classify them. Only the user's natural-language query matters.

Categories (the value of "category" must be EXACTLY one of these strings, case-sensitive matching the list):
{categories}

HANDLING SHORT / AMBIGUOUS MESSAGES (very common in production):
- Single-word or ultra-short messages (≤ 3 tokens, e.g. "提交", "继续", "ok", "好") are usually FOLLOW-UPS to a previous turn. Look at the prior user/assistant messages and pick the category of what the user is acting ON, not the literal word.
- A single verb with no object ("修复", "清理", "提交") is "执行某件事" — usually matches the most recent assistant action, not a fresh task. Pick the same category as the prior intent, with confidence ≥ 0.6.
- Listing identifiers ("清理 A B C", "删除 1 2 3") is an OPERATION on existing items, not a new task. Pick the operation-category, not the items themselves.
- If the user message is purely acknowledgment ("ok", "好的", "嗯", "continue") and the prior turn was coding, stay in coding with high confidence — DO NOT re-classify as general.
- Only treat a message as a fresh task when it is a complete, self-contained request (has its own subject and verb, ≥ 10 tokens).

CONFIDENCE GUIDANCE:
- 0.9–1.0: clear, unambiguous intent aligned with category semantics
- 0.7–0.9: matches the category spirit but reasonable people might disagree
- 0.4–0.7: ambiguous, could fit another category — keep the chosen one but lower the score so the caller knows
- 0.0–0.4: only when the user message is empty / unparseable after ignoring noise; pick the closest category rather than refusing

OUTPUT FORMAT (strict JSON, no other text):
{
  "category": "<one of the categories above>",
  "confidence": <number between 0.0 and 1.0>
}

ABSOLUTE RULES:
- Output MUST be a single JSON object, no markdown fences, no explanation, no "Sure", no "As", no "I", no preamble.
- The first character of your reply MUST be "{" and the last character MUST be "}".
- Do not think out loud. No chain-of-thought, no reasoning before the JSON.
- If you do not understand the user's intent, set "category" to the closest category from the list (NEVER invent a new one) and "confidence" below 0.4.

EXAMPLES (input → output JSON):
"Write a Python function to sort a list" → {"category": "coding", "confidence": 0.97}
"What is the capital of France?" → {"category": "general", "confidence": 0.95}
"Hello" → {"category": "general", "confidence": 0.8}
"hi" → {"category": "general", "confidence": 0.7}
(prior turn: assistant explaining a Python function) "ok" → {"category": "coding", "confidence": 0.85}
(prior turn: assistant drafted a doc) "提交" → {"category": "general", "confidence": 0.6}
"清理 A B C" → {"category": "coding", "confidence": 0.75}`

const ACTIVE_CACHE_KEY = 'active'

export interface ActiveClassifierPrompt {
  content: string
  version: number
  updatedAt: Date
  updatedBy: string | null
}

export async function getActiveClassifierPrompt(): Promise<ActiveClassifierPrompt> {
  const cached = readCache(ACTIVE_CACHE_KEY)
  if (cached) return cached

  const db = getDatabase()
  const rows = await db
    .select()
    .from(classifierPrompts)
    .orderBy(desc(classifierPrompts.version))
    .limit(1)

  let prompt: ActiveClassifierPrompt
  if (rows.length === 0) {
    const inserted = await db
      .insert(classifierPrompts)
      .values({ content: DEFAULT_CLASSIFIER_PROMPT, version: 1, updatedBy: 'system' })
      .returning()
    prompt = {
      content: inserted[0].content,
      version: inserted[0].version,
      updatedAt: inserted[0].updatedAt,
      updatedBy: inserted[0].updatedBy,
    }
  } else {
    prompt = {
      content: rows[0].content,
      version: rows[0].version,
      updatedAt: rows[0].updatedAt,
      updatedBy: rows[0].updatedBy,
    }
  }
  writeCache(ACTIVE_CACHE_KEY, prompt)
  return prompt
}

export async function updateClassifierPrompt(
  content: string,
  updatedBy: string | null,
): Promise<ActiveClassifierPrompt> {
  const db = getDatabase()
  const current = await getActiveClassifierPrompt()
  const inserted = await db
    .insert(classifierPrompts)
    .values({ content, version: current.version + 1, updatedBy })
    .returning()
  clearCache()
  return {
    content: inserted[0].content,
    version: inserted[0].version,
    updatedAt: inserted[0].updatedAt,
    updatedBy: inserted[0].updatedBy,
  }
}
