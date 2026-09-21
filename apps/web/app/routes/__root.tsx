import { Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { I18nProvider } from '../i18n/provider'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* Locale/timezone wrap the query provider so every route and hook can
          read them, including anything that formats timestamps outside React. */}
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <Outlet />
          <Toaster richColors />
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
