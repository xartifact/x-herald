import { useState } from 'react'

import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Unlink,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Status,
} from './ui'

import type { Instance, Provider } from './data'

interface Props {
  instances: Instance[]
  providers: Provider[]
  onEdit: (instance: Instance) => void
  onProvider?: (provider: Provider) => void
  onDetach?: (id: string) => void
  onMove?: (id: string, direction: number) => void
}

export function InstanceTable({
  instances,
  providers,
  onEdit,
  onProvider,
  onDetach,
  onMove,
}: Props) {
  const [testing, setTesting] = useState<string | null>(null)
  const [tested, setTested] = useState<Set<string>>(new Set())
  const test = (instance: Instance) => {
    setTesting(instance.id)
    window.setTimeout(() => {
      setTesting(null)
      setTested((previous) => new Set([...previous, instance.id]))
      toast.success(`${instance.name}：模拟测试通过`, { description: '设计预览未调用真实模型。' })
    }, 900)
  }
  if (!instances.length) return <Empty text="没有匹配的实例" />
  return (
    <div className="table-scroll">
      <table className="instance-table">
        <thead>
          <tr>
            <th className="order-cell">顺序</th>
            <th>实例 / 上游模型</th>
            <th>供应商</th>
            <th>状态</th>
            <th>示例 TTFB</th>
            <th className="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((instance, index) => {
            const provider = providers.find((item) => item.id === instance.provider)!
            return (
              <tr key={instance.id}>
                <td className="order-cell">
                  <span className="order-number">{String(index + 1).padStart(2, '0')}</span>
                </td>
                <td>
                  <button className="instance-name" onClick={() => onEdit(instance)}>
                    {instance.name}
                  </button>
                  <code className="secondary-line">{instance.model}</code>
                </td>
                <td>
                  <button className="provider-link" onClick={() => onProvider?.(provider)}>
                    <span className={`mini-avatar ${provider.tone}`}>{provider.initial}</span>
                    {provider.name}
                  </button>
                </td>
                <td>
                  <Status
                    enabled={instance.enabled && provider.enabled}
                    label={!provider.enabled ? '供应商停用' : undefined}
                  />
                </td>
                <td className="numeric muted">{instance.latency}</td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={testing !== null || !instance.enabled || !provider.enabled}
                      onClick={() => test(instance)}
                    >
                      {testing === instance.id ? (
                        <Loader2 className="spin" />
                      ) : tested.has(instance.id) ? (
                        <Check />
                      ) : (
                        <Play />
                      )}
                      测试
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${instance.name} 更多操作`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(instance)}>
                          <Pencil size={14} />
                          编辑实例
                        </DropdownMenuItem>
                        {onMove && (
                          <>
                            <DropdownMenuItem
                              disabled={index === 0}
                              onSelect={() => onMove(instance.id, -1)}
                            >
                              <ArrowUp size={14} />
                              提高组内优先级
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === instances.length - 1}
                              onSelect={() => onMove(instance.id, 1)}
                            >
                              <ArrowDown size={14} />
                              降低组内优先级
                            </DropdownMenuItem>
                          </>
                        )}
                        {onDetach && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => onDetach(instance.id)}>
                              <Unlink size={14} />
                              移出本组
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
