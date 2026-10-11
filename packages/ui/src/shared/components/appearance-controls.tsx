import { createContext, useContext, useEffect, useState } from 'react'

import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

import type { ReactNode } from 'react'

export const palettes = [
  {
    id: 'iris',
    name: '鸢尾紫',
    english: 'Iris',
    character: '理性 · 精致 · 创造力',
    description: '延续当前方案，适合作为 xartifact 默认品牌色。',
    recommended: true,
  },
  {
    id: 'ocean',
    name: '海洋蓝',
    english: 'Ocean',
    character: '清晰 · 稳健 · 专业',
    description: '更偏工程工具的气质，信息密集时也保持清晰。',
  },
  {
    id: 'jade',
    name: '松石绿',
    english: 'Jade',
    character: '克制 · 平静 · 专注',
    description: '柔和的冷色调，适合需要长时间工作的界面。',
  },
  {
    id: 'clay',
    name: '陶土橙',
    english: 'Clay',
    character: '温暖 · 质感 · 人文',
    description: '更温暖的视觉表达，适合创作与内容类工具。',
  },
] as const
export type PaletteId = (typeof palettes)[number]['id']
const PALETTE_KEY = 'xartifact.palette'
const validPalette = (value: unknown): value is PaletteId =>
  palettes.some((palette) => palette.id === value)
const AppearanceContext = createContext<{
  palette: PaletteId
  setPalette: (id: PaletteId) => void
}>({ palette: 'iris', setPalette: () => {} })

function readPalette(): PaletteId {
  try {
    const value = localStorage.getItem(PALETTE_KEY)
    return validPalette(value) ? value : 'iris'
  } catch {
    return 'iris'
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [palette, updatePalette] = useState<PaletteId>(readPalette)
  const setPalette = (id: PaletteId) => {
    updatePalette(id)
    document.documentElement.dataset.xartifactPalette = id
    try {
      localStorage.setItem(PALETTE_KEY, id)
    } catch {
      /* In-memory preferences remain usable. */
    }
  }
  useEffect(() => {
    document.documentElement.dataset.xartifactPalette = palette
    const sync = (event: StorageEvent) => {
      if (event.key === PALETTE_KEY || event.key === null) updatePalette(readPalette())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [palette])
  return (
    <AppearanceContext.Provider value={{ palette, setPalette }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export const useAppearance = () => useContext(AppearanceContext)

export function AppearanceControls() {
  const { palette, setPalette } = useAppearance()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const current = palettes.find((item) => item.id === palette)!
  return (
    <div className="appearance-controls">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="palette-trigger" aria-label="选择配色">
            <span className="palette-dot" />
            {current.name}
            <Palette size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="appearance-menu">
          <div className="menu-caption">品牌配色</div>
          {palettes.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => setPalette(item.id)}>
              <span className="palette-swatch" data-xartifact-palette={item.id} />
              <span>
                {item.name} <small>{item.english}</small>
              </span>
              {palette === item.id && <Check size={14} className="push-right" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="menu-caption">切换配色不会改变明暗模式</div>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="选择明暗模式"
            title={
              theme === 'system'
                ? `跟随系统 · 当前${resolvedTheme === 'dark' ? '深色' : '浅色'}`
                : theme === 'dark'
                  ? '深色'
                  : '浅色'
            }
          >
            {theme === 'system' ? <Monitor /> : theme === 'dark' ? <Moon /> : <Sun />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {[
            { id: 'light', label: '浅色', icon: Sun },
            { id: 'dark', label: '深色', icon: Moon },
            { id: 'system', label: '跟随系统', icon: Monitor },
          ].map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} onSelect={() => setTheme(id)}>
              <Icon size={15} />
              {label}
              {theme === id && <Check size={14} className="push-right" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
