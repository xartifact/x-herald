'use client'

import { useState } from 'react'

import { FolderOpen, MoveRight } from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import { Badge } from '../../../shared/components/ui/index'
import { Button } from '../../../shared/components/ui/index'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/index'

import type { ModelInstance, ModelGroup } from '@x-llm-gateway/engine'
import { useSetInstanceGroups, useToggleModelInstance } from '../hooks/use-model-groups'

interface UngroupedInstancesSectionProps {
  instances: ModelInstance[]
  groups: ModelGroup[]
  getProviderName: (providerId: string) => string
}

export function UngroupedInstancesSection({
  instances,
  groups,
  getProviderName,
}: UngroupedInstancesSectionProps) {
  const [assignGroupId, setAssignGroupId] = useState<Record<string, string>>({})
  const assignInstance = useSetInstanceGroups()
  const toggleInstance = useToggleModelInstance()

  if (instances.length === 0) return null

  const handleAssign = async (instanceId: string) => {
    const groupId = assignGroupId[instanceId]
    if (!groupId) return
    await assignInstance.mutateAsync({ id: instanceId, groupIds: [groupId] })
    setAssignGroupId((prev) => {
      const next = { ...prev }
      delete next[instanceId]
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          未分组实例
          <Badge variant="secondary">{instances.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>实例名称</TableHead>
              <TableHead>实际模型</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">分配到组</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((instance) => (
              <TableRow key={instance.id}>
                <TableCell className="font-medium">{instance.name}</TableCell>
                <TableCell>
                  <code className="text-sm">{instance.actualModelName}</code>
                </TableCell>
                <TableCell>{getProviderName(instance.providerId)}</TableCell>
                <TableCell>
                  <StatusToggle
                    enabled={instance.enabled}
                    onToggle={() => toggleInstance.mutate({ id: instance.id })}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Select
                      value={assignGroupId[instance.id] || ''}
                      onValueChange={(v) =>
                        setAssignGroupId((prev) => ({ ...prev, [instance.id]: v }))
                      }
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue placeholder="选择模型组" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.displayName || group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!assignGroupId[instance.id] || assignInstance.isPending}
                      onClick={() => handleAssign(instance.id)}
                    >
                      <MoveRight className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
