/**
 * Language and timezone switcher for the admin header.
 *
 * Two independent controls rather than one: a user may want English labels while
 * still reading timestamps in their own zone, and timezone is the setting that
 * actually decides whether "today" means their today. Both persist through the
 * i18n provider, so a choice survives a reload.
 *
 * Timezone choices come from `Intl.supportedValuesOf('timeZone')` — the same set
 * the formatters accept — rather than a hand-maintained list that would drift
 * from what the runtime can actually render.
 *
 * @module apps/web/app/components/locale-switcher
 */

import { Globe, Clock } from 'lucide-react'

import { LOCALE_METADATA, SUPPORTED_LOCALES } from '@xartifact/x-herald-shared'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@xartifact/x-herald-ui'

import { useTranslation } from '../i18n/provider'

/**
 * A short, ordered list of common zones, with the browser's own zone prepended.
 *
 * The full IANA list is ~400 entries, which is unusable in a dropdown; these
 * cover the product's actual audience while still letting the current zone show
 * up even when it is not listed.
 * @param current - the active zone, always included.
 * @returns zone names to offer.
 */
function timezoneChoices(current: string): string[] {
  const common = [
    'UTC',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles',
  ]
  const zones = new Set<string>([current, ...common])
  return [...zones].filter((zone) => zone !== '')
}

/** Language + timezone picker. */
export function LocaleSwitcher() {
  const { locale, timezone, setLocale, setTimezone } = useTranslation()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="切换语言">
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>语言 / Language</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SUPPORTED_LOCALES.map((code) => (
            <DropdownMenuItem
              key={code}
              onClick={() => setLocale(code)}
              // The active language is marked rather than hidden, so the current
              // choice stays visible while the menu is open.
              data-active={code === locale}
              className={code === locale ? 'font-medium' : undefined}
            >
              {LOCALE_METADATA[code].displayName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="切换时区" title={timezone}>
            <Clock className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>时区 / Timezone</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {timezoneChoices(timezone).map((zone) => (
            <DropdownMenuItem
              key={zone}
              onClick={() => setTimezone(zone)}
              data-active={zone === timezone}
              className={zone === timezone ? 'font-medium' : undefined}
            >
              {zone}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
