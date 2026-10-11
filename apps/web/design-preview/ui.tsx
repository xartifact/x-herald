import { Search } from 'lucide-react'

export { Button } from '../../../packages/ui/src/shared/components/ui/button'
export { Input } from '../../../packages/ui/src/shared/components/ui/input'
export { Switch } from '../../../packages/ui/src/shared/components/ui/switch'
export {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '../../../packages/ui/src/shared/components/ui/sheet'
export {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../../packages/ui/src/shared/components/ui/dialog'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../packages/ui/src/shared/components/ui/dropdown-menu'

import { Input } from '../../../packages/ui/src/shared/components/ui/input'

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="search-box">
      <Search size={15} />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function Status({ enabled, label }: { enabled: boolean; label?: string }) {
  return (
    <span className={`status ${enabled ? 'on' : 'off'}`}>
      <i />
      {label || (enabled ? '已启用' : '已停用')}
    </span>
  )
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Search size={24} />
      <strong>{text}</strong>
      <span>试试其他关键词，或添加一个新项目。</span>
    </div>
  )
}
