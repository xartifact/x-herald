'use client'

import { Network, GitBranch, Server, Ban, ArrowDownToLine } from 'lucide-react'

import { ScrollArea } from '@/ui/scroll-area'

export interface NodePaletteProps {
  onAddNode: (nodeType: string, extraData?: Record<string, unknown>) => void
}

interface NodeTemplate {
  type: string
  label: string
  description: string
  icon: React.ElementType
  theme: {
    border: string
    bg: string
    text: string
    iconColor: string
  }
}

const sourceTemplates: NodeTemplate[] = [
  {
    type: 'modelTrigger',
    label: '虚拟模型',
    description: '请求入口，代表一个虚拟模型',
    icon: Network,
    theme: {
      border: 'border-blue-300',
      bg: 'bg-blue-50 hover:bg-blue-100',
      text: 'text-blue-700',
      iconColor: 'text-blue-500',
    },
  },
  {
    type: 'condition',
    label: '条件判断',
    description: '根据条件分支路由请求',
    icon: GitBranch,
    theme: {
      border: 'border-amber-300',
      bg: 'bg-amber-50 hover:bg-amber-100',
      text: 'text-amber-700',
      iconColor: 'text-amber-500',
    },
  },
]

const targetTemplates: NodeTemplate[] = [
  {
    type: 'target',
    label: '路由目标',
    description: '模型组或模型实例目标',
    icon: Server,
    theme: {
      border: 'border-green-300',
      bg: 'bg-green-50 hover:bg-green-100',
      text: 'text-green-700',
      iconColor: 'text-green-500',
    },
  },
  {
    type: 'reject',
    label: '拒绝策略',
    description: '拒绝请求并返回错误',
    icon: Ban,
    theme: {
      border: 'border-red-300',
      bg: 'bg-red-50 hover:bg-red-100',
      text: 'text-red-700',
      iconColor: 'text-red-500',
    },
  },
  {
    type: 'fallback',
    label: '降级策略',
    description: '降级处理请求',
    icon: ArrowDownToLine,
    theme: {
      border: 'border-orange-300',
      bg: 'bg-orange-50 hover:bg-orange-100',
      text: 'text-orange-700',
      iconColor: 'text-orange-500',
    },
  },
]

function TemplateCard({ template, onClick }: { template: NodeTemplate; onClick: () => void }) {
  const Icon = template.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border ${template.theme.border} ${template.theme.bg} p-3 text-left transition-colors cursor-pointer`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${template.theme.iconColor}`} />
        <span className={`text-sm font-medium ${template.theme.text}`}>{template.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {template.description}
      </p>
    </button>
  )
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="flex flex-col h-full border rounded-lg bg-background">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">节点模板</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* 入口节点 */}
          <div>
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                入口节点
              </span>
            </div>
            <div className="space-y-2">
              {sourceTemplates.map((template) => (
                <TemplateCard
                  key={template.type}
                  template={template}
                  onClick={() => onAddNode(template.type)}
                />
              ))}
            </div>
          </div>

          {/* 终点节点 */}
          <div>
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                终点节点
              </span>
            </div>
            <div className="space-y-2">
              {targetTemplates.map((template) => (
                <TemplateCard
                  key={template.type}
                  template={template}
                  onClick={() => onAddNode(template.type)}
                />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
