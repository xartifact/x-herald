import { useEffect, useRef, useState } from 'react'

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@xartifact/x-herald-ui'
import { AlertTriangle, ChevronDown, Search, X } from 'lucide-react'

import { type RemoteSelectOptions, useRemoteOptions } from '../remote-sources'

const CLEAR_SENTINEL = '__none__'

export interface RemoteSelectControlProps {
  /** 当前选中值 */
  value?: string | undefined
  /** 值变更回调 */
  onChange: (value: string | undefined) => void
  /** blur 回调 */
  onBlur?: (id: string, value: string) => void
  /** DOM id（用于 label 关联） */
  id?: string
  /** 触发器 className 覆盖 */
  triggerClassName?: string
  /** 禁用 */
  disabled?: boolean
  /** 只读 */
  readonly?: boolean
  /** placeholder */
  placeholder?: string
  /** 是否显示清除项 */
  allowClear?: boolean
  /** 远程选项配置（数据源/级联/搜索/懒加载） */
  options: RemoteSelectOptions
  /** 级联依赖的表单数据（可选） */
  formData?: Record<string, unknown>
}

/**
 * RemoteSelectControl — 数据驱动的下拉选择控件（无 RJSF 依赖）
 *
 * 能力（由 options 声明）：
 *   - 静态枚举：{ enumOptions: [...] } 或 { enumNames: [...] }
 *   - 远程单源：{ remoteSource: 'xxx' }
 *   - 远程级联：{ dependsOn + remoteSourceMap + filterParams }
 *   - 远程搜索：{ searchable: true }（SelectContent 顶部渲染搜索 Input）
 *   - 懒加载：  { lazy: true, pageSize: N }（"加载更多"按钮追加）
 *
 * 可独立使用，也可作为 RemoteSelectWidget（RJSF Widget）和 RecordField 内嵌下拉的底层。
 */
export function RemoteSelectControl({
  value,
  onChange,
  onBlur,
  id,
  triggerClassName,
  disabled,
  readonly,
  placeholder,
  allowClear = true,
  options,
  formData,
}: RemoteSelectControlProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(options.pageSize ?? 50)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const {
    options: finalOptions,
    loading,
    total,
  } = useRemoteOptions(options, formData, {
    search: search.trim() || undefined,
    lazy: options.lazy,
    pageSize,
  })

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPageSize(options.pageSize ?? 50)
    } else if (options.searchable) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [open, options.searchable, options.pageSize])

  const isStale =
    !!value &&
    !loading &&
    !search &&
    finalOptions.length > 0 &&
    !finalOptions.some((o) => o.value === value)

  const resolvedPlaceholder = placeholder ?? '请选择...'
  const canShowClear = allowClear && !!value && !disabled && !readonly
  const hasMore = options.lazy && finalOptions.length < total

  return (
    <Select
      value={value ?? ''}
      disabled={disabled || readonly}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(v) => {
        if (v === CLEAR_SENTINEL) {
          onChange(undefined)
        } else {
          onChange(v === '' ? undefined : v)
        }
        if (onBlur && id) onBlur(id, v)
      }}
    >
      <div className="group relative">
        <SelectTrigger
          id={id}
          className={
            (triggerClassName ??
              'h-8 text-sm group-hover:pr-7 group-focus-within:pr-7 group-hover:[&>svg]:hidden group-focus-within:[&>svg]:hidden') +
            (isStale ? ' border-warning/40 text-warning' : '')
          }
        >
          {isStale && <AlertTriangle className="mr-1 h-3.5 w-3.5 shrink-0 text-warning" />}
          <SelectValue placeholder={loading ? '加载中...' : resolvedPlaceholder} />
        </SelectTrigger>
        {canShowClear && (
          <button
            type="button"
            aria-label="清除选择"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange(undefined)
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 h-5 w-5
                       hidden group-hover:flex group-focus-within:flex
                       items-center justify-center rounded
                       text-muted-foreground hover:text-foreground hover:bg-muted/80
                       transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <SelectContent className="max-h-[320px]">
        {options.searchable && (
          <div
            className="sticky top-0 z-10 -mx-1 mb-1 border-b bg-popover px-2 py-1.5"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..."
                className="h-7 pl-7 text-xs"
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
        {isStale && value && (
          <>
            <SelectItem value={value} className="text-warning">
              <span className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                已删除（请重新选择）
              </span>
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        {allowClear && finalOptions.length > 0 && !options.searchable && (
          <>
            <SelectItem value={CLEAR_SENTINEL} className="text-muted-foreground">
              <span className="text-xs">— 无 (清除选择) —</span>
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        {finalOptions.length === 0 && !isStale && (
          <div className="py-3 text-center text-xs text-muted-foreground">
            {loading ? '加载中...' : (options.emptyHint ?? '暂无可选项')}
          </div>
        )}
        {finalOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setPageSize((s) => s + (options.pageSize ?? 50))
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-sm py-1.5
                       text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronDown className="h-3 w-3" />
            加载更多（已显示 {finalOptions.length} / {total}）
          </button>
        )}
      </SelectContent>
    </Select>
  )
}
