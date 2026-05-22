'use client'

import { Pencil, Trash2, Eye, EyeOff, BrainCircuit, RefreshCw } from 'lucide-react'

import { StatusToggle } from '../status-toggle'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

// TODO(6): from apps/web
import type { Provider, ProtocolsConfig } from '@x-llm-gateway/shared'

interface ProviderTableProps {
  providers: Provider[]
  showApiKey: Record<string, boolean>
  onToggleShowApiKey: (providerId: string) => void
  onToggle: (providerId: string) => void
  onEdit: (providerId: string) => void
  onDelete: (providerId: string, name: string) => void
  onConfigureThinkingMapping: (providerId: string, name: string) => void
  onSyncModels: (providerId: string, name: string) => void
}

function getEnabledProtocols(protocols: ProtocolsConfig): string[] {
  return Object.keys(protocols).filter((key) => protocols[key as keyof ProtocolsConfig])
}

export function ProviderTable({
  providers,
  showApiKey,
  onToggleShowApiKey,
  onToggle,
  onEdit,
  onDelete,
  onConfigureThinkingMapping,
  onSyncModels,
}: ProviderTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>API 密钥</TableHead>
              <TableHead>支持协议</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => {
              const enabledProtocols = getEnabledProtocols(provider.protocols)
              return (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="font-medium">{provider.name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {provider.apiKey ? (
                        <>
                          <code className="text-xs text-muted-foreground">
                            {showApiKey[provider.id]
                              ? provider.apiKey
                              : '•'.repeat(Math.min(provider.apiKey.length, 20))}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => onToggleShowApiKey(provider.id)}
                          >
                            {showApiKey[provider.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">未设置</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {enabledProtocols.map((protocol) => (
                        <Badge key={protocol} variant="outline" className="text-xs">
                          {protocol}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusToggle enabled={provider.enabled} onToggle={() => onToggle(provider.id)} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(provider.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="同步模型"
                        onClick={() => onSyncModels(provider.id, provider.name)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="配置 Thinking 映射"
                        onClick={() => onConfigureThinkingMapping(provider.id, provider.name)}
                      >
                        <BrainCircuit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(provider.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(provider.id, provider.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
