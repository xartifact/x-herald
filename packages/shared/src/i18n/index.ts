/**
 * Message catalogues and their type-safe key surface.
 *
 * Chinese is the baseline: `zh-CN.json` is the source of truth and every other
 * catalogue is a translation of it. That ordering matters for the types — the
 * key union is derived from the *baseline* file, so a key that exists only in a
 * translation is a type error, and a missing translation degrades to Chinese at
 * runtime rather than rendering a raw key.
 *
 * No i18n library: the catalogues are plain JSON (so Weblate / Crowdin can read
 * them), `Intl` covers formatting, and interpolation is a simple `{name}`
 * substitution — the project has no plural rules to express.
 * @module @xartifact/x-herald-shared/i18n
 */

import type { MessageKey } from '../types/i18n'

import en from './en.json'
import zhCN from './zh-CN.json'

/** Shape of a catalogue: nested namespaces of string leaves. */
export interface MessageTree {
  readonly [namespace: string]: string | MessageTree
}

/** Locales with a catalogue shipped in this package. */
export const CATALOGUE_LOCALES = ['zh-CN', 'en'] as const

/** A locale that has a catalogue. */
export type CatalogueLocale = (typeof CATALOGUE_LOCALES)[number]

/** Catalogue contents, keyed by locale. */
export const CATALOGUES: Readonly<Record<CatalogueLocale, MessageTree>> = {
  'zh-CN': zhCN as MessageTree,
  en: en as MessageTree,
}

/**
 * Flatten a catalogue into `namespace.key` paths.
 * @param tree - catalogue (or subtree) to flatten.
 * @param prefix - path accumulated so far.
 * @returns every leaf path in the tree.
 */
function flattenKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = []
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${name}` : name
    if (typeof value === 'string') {
      keys.push(path)
    } else {
      keys.push(...flattenKeys(value, path))
    }
  }
  return keys
}

/** Baseline key set, computed once from the source-of-truth catalogue. */
export const BASELINE_KEYS: readonly string[] = flattenKeys(CATALOGUES['zh-CN'])

/**
 * Look up a dotted path in a catalogue.
 * @param tree - catalogue to search.
 * @param key - dotted path, e.g. `common.save`.
 * @returns the message, or undefined when the path is absent or not a leaf.
 */
function lookup(tree: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Values accepted for `{name}` placeholders. */
export type MessageParams = Readonly<Record<string, string | number>>

/**
 * Substitute `{name}` placeholders in a message.
 *
 * Unmatched placeholders are left verbatim rather than blanked: a visible
 * `{keyCount}` in the UI is a bug report, an empty string is a silent one.
 * @param message - template text.
 * @param params - substitution values.
 * @returns the rendered message.
 */
export function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** A translation request that could not be served from the requested locale. */
export interface TranslationMiss {
  /** The key that was missing. */
  readonly key: string
  /** The locale that lacked it. */
  readonly locale: string
}

/**
 * Resolve a message, falling back to the baseline catalogue.
 * @param key - dotted message path.
 * @param locale - requested locale.
 * @param params - placeholder values.
 * @param onMiss - called when the requested locale lacked the key.
 * @returns the message; the key itself when no catalogue has it.
 */
export function translate(
  key: MessageKey,
  locale: string,
  params?: MessageParams,
  onMiss?: (miss: TranslationMiss) => void,
): string {
  const catalogue = CATALOGUES[locale as CatalogueLocale]
  const fromRequested = catalogue === undefined ? undefined : lookup(catalogue, key)
  if (fromRequested !== undefined) return interpolate(fromRequested, params)

  const fallback = lookup(CATALOGUES['zh-CN'], key)
  if (fallback !== undefined) {
    // Only a miss in a *non-baseline* locale is worth reporting: the baseline
    // lacking the key means the key itself is wrong, handled below.
    if (catalogue !== undefined) onMiss?.({ key, locale })
    return interpolate(fallback, params)
  }
  return key
}

/**
 * Keys present in the baseline but absent from a translation.
 *
 * A missing translation is not an error — Chinese is the fallback — but it is
 * worth surfacing so the gap is visible rather than silently shipping Chinese
 * into an English UI.
 * @param locale - locale to check.
 * @returns the missing keys, in baseline order.
 */
export function missingKeys(locale: CatalogueLocale): string[] {
  const catalogue = CATALOGUES[locale]
  if (catalogue === undefined) return [...BASELINE_KEYS]
  return BASELINE_KEYS.filter((key) => lookup(catalogue, key) === undefined)
}

/**
 * Assert every translation only contains keys the baseline defines.
 *
 * Called at startup so a typo'd key in a translation fails loudly instead of
 * being dead weight nobody can reach.
 * @param catalogues - catalogues to validate; defaults to the shipped set.
 * @returns the offending `locale: key` descriptions, empty when all are valid.
 */
export function unknownKeys(
  catalogues: Readonly<Record<string, MessageTree>> = CATALOGUES,
): string[] {
  const baseline = new Set(BASELINE_KEYS)
  const problems: string[] = []
  for (const [locale, catalogue] of Object.entries(catalogues)) {
    for (const key of flattenKeys(catalogue)) {
      if (!baseline.has(key)) problems.push(`${locale}: ${key}`)
    }
  }
  return problems
}
