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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './ui/popover'

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
      <PopoverAnchor asChild>
        <div
          className={cn(
            'block min-h-9 w-full rounded-md border border-input bg-background',
            className,
          )}
        >
          <div className="flex min-h-9 w-full flex-wrap items-center gap-1 px-2 py-1">
            {selectedOptions.length === 0 ? (
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={placeholder}
                  aria-expanded={open}
                  aria-haspopup="listbox"
                  disabled={disabled}
                  className="h-8 min-w-0 flex-1 justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
                >
                  {placeholder}
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
            ) : (
              <span className="flex flex-1 flex-wrap items-center gap-1 text-left">
                {visible.map((option) => (
                  <span
                    key={option.value}
                    className="inline-flex max-w-[160px] items-center whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground"
                  >
                    <span className="truncate">{option.label}</span>
                    {!disabled && (
                      <button
                        type="button"
                        aria-label={`移除 ${option.label}`}
                        className="ml-0.5 rounded-full outline-none hover:bg-muted"
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          toggle(option.value)
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {overflowCount > 0 && (
                  <Badge variant="secondary" className="whitespace-nowrap px-2 text-xs font-normal">
                    +{overflowCount}
                  </Badge>
                )}
              </span>
            )}
            {selectedOptions.length > 0 && (
              <span className="flex items-center justify-end">
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="打开选项"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    disabled={disabled}
                    className="h-8 w-8 shrink-0 p-0"
                  >
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
              </span>
            )}
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="max-h-[320px] overflow-hidden p-0"
        style={{ width: 'var(--radix-popper-anchor-width)' }}
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
          // Popover 内容经 Portal 挂到 document.body，脱离了外层 Dialog 的
          // react-remove-scroll lockRef 子树。Dialog 的滚动锁定在 document 上
          // 挂了一个冒泡阶段（非 capture）的 wheel 监听器，对任何不在其锁定子树内
          // 且未登记为 shard 的滚轮事件一律 preventDefault——包括这里。
          // 在事件到达 document 前 stopPropagation，让它逃过那次拦截，
          // 浏览器原生滚动行为才会正常发生（CSS 已经具备可滚动能力，只是滚轮被吃掉了）。
          onWheel={(e) => e.stopPropagation()}
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
