'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export interface MultiSelectOption {
  value: string
  label: string
  /** 禁用项不可选，仍展示并置灰 */
  disabled?: boolean
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** 触发器最多展示的徽章数，超出折叠为 +N；undefined = 不折叠 */
  maxBadges?: number
  className?: string
  disabled?: boolean
}

/**
 * 可搜索多选下拉：Popover + cmdk 组合。
 * 触发器以 Badge 药丸回显选中项（超出 maxBadges 折叠为 +N），
 * 弹出层支持搜索过滤、键盘导航、逐项勾选。
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = '请选择...',
  searchPlaceholder = '搜索...',
  emptyText = '无匹配项',
  maxBadges = 3,
  className,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const selectedOptions = options.filter((o) => selected.includes(o.value))
  const visible = maxBadges != null ? selectedOptions.slice(0, maxBadges) : selectedOptions
  const overflowCount = maxBadges != null ? Math.max(0, selectedOptions.length - visible.length) : 0

  // 搜索时对大小写不敏感过滤（cmdk 内建排序会打乱受控勾选顺序，这里自管 filter）
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn('h-auto min-h-9 w-full justify-between px-2 font-normal', className)}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1 py-1 text-left">
              {visible.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="max-w-[160px] whitespace-nowrap pr-1 text-xs font-normal"
                >
                  <span className="truncate">{option.label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className="ml-0.5 rounded-full outline-none hover:bg-muted"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggle(option.value)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {overflowCount > 0 && (
                <Badge variant="secondary" className="whitespace-nowrap px-2 text-xs font-normal">
                  +{overflowCount}
                </Badge>
              )}
            </span>
          )}
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[320px] overflow-hidden w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          shouldFilter={false}
          loop
          // cmdk 默认在 root 上设 overflow:hidden。modal Dialog 内打开 popover 时，
          // 滚轮 targeting 列表内部元素的默认 scroll action 可能因 root 的 hidden
          // 找不到正确滚动容器，导致 CommandList 无法滚轮滚动。
          // root 与 list 同时可滚（overflow-y-auto）：键盘 scrollIntoView 落在
          // 最近的 list，滚轮落在 root 或 list 都能滚——互不破坏。
          className="overflow-y-auto"
        >
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => !option.disabled && toggle(option.value)}
                  disabled={option.disabled}
                  className="cursor-pointer"
                >
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary',
                      selected.includes(option.value)
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </div>
                  <span className="whitespace-nowrap">{option.label}</span>
                  {option.disabled && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      已禁用
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
