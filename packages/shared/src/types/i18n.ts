/**
 * Type-safe message keys.
 *
 * A literal union rather than a type derived from the JSON: TypeScript widens
 * imported JSON leaves to `string`, so a derived type would accept any string
 * and defeat the purpose. Writing the union by hand gives the compiler enough to
 * reject `t('commom.save')` at build time.
 *
 * The hand-written union can drift from the catalogues, so
 * `packages/shared/src/i18n/index.test.ts` asserts the two agree in both
 * directions — a key in the union but not the JSON fails, and so does the
 * reverse.
 *
 * @module @xartifact/x-herald-shared/types/i18n
 */

import type { MessageTree } from '../i18n'

/** Structured key tree: mirrors the catalogue's namespaces. */
export interface MessageKeyTree {
  readonly common: {
    readonly save: 'common.save'
    readonly cancel: 'common.cancel'
    readonly delete: 'common.delete'
    readonly edit: 'common.edit'
    readonly create: 'common.create'
    readonly search: 'common.search'
    readonly refresh: 'common.refresh'
    readonly close: 'common.close'
    readonly confirm: 'common.confirm'
    readonly loading: 'common.loading'
    readonly empty: 'common.empty'
    readonly error: 'common.error'
    readonly success: 'common.success'
    readonly enabled: 'common.enabled'
    readonly disabled: 'common.disabled'
  }
  readonly nav: {
    readonly dashboard: 'nav.dashboard'
    readonly providers: 'nav.providers'
    readonly keys: 'nav.keys'
    readonly logs: 'nav.logs'
    readonly settings: 'nav.settings'
  }
  readonly errors: {
    readonly PROVIDER_HAS_KEYS: 'errors.PROVIDER_HAS_KEYS'
    readonly KEY_EXPIRED: 'errors.KEY_EXPIRED'
    readonly NETWORK: 'errors.NETWORK'
    readonly UNKNOWN: 'errors.UNKNOWN'
  }
}

/**
 * Every valid message key.
 *
 * `t()` accepts only these, so a misspelled key is a compile error instead of a
 * raw key rendering in the UI.
 */
export type MessageKey =
  | MessageKeyTree['common'][keyof MessageKeyTree['common']]
  | MessageKeyTree['nav'][keyof MessageKeyTree['nav']]
  | MessageKeyTree['errors'][keyof MessageKeyTree['errors']]

/** Namespaces a key can belong to. */
export type MessageNamespace = keyof MessageKeyTree

/** Compile-time proof that a value is a catalogue tree. */
export type Catalogue = MessageTree
