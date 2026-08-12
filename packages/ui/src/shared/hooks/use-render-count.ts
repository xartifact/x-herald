import { IS_DEVELOPMENT } from '@xartifact/x-herald-shared'

interface RenderStats {
  renders: number
  since: number
  componentName: string
}

const stats = new Map<string, RenderStats>()

export function useRenderCount(componentName: string): void {
  if (!IS_DEVELOPMENT) return

  const existing = stats.get(componentName)
  if (existing) {
    existing.renders++
  } else {
    stats.set(componentName, { renders: 1, since: Date.now(), componentName })
  }
}

export function getRenderStats(): RenderStats[] {
  return Array.from(stats.values())
}

export function resetRenderStats(): void {
  stats.clear()
}

export function printRenderStats(): void {
  if (!IS_DEVELOPMENT) return
  const entries = getRenderStats()
  console.table(entries.toSorted((a, b) => b.renders - a.renders))
}
