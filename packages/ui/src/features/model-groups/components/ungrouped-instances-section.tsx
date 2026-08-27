import { useState } from 'react'

import { FolderOpen, MoveRight } from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import { MultiSelect, type MultiSelectOption } from '../../../shared/components/multi-select'
import { Badge } from '../../../shared/components/ui/index'
import { Button } from '../../../shared/components/ui/index'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/index'

import type { ModelInstance, ModelGroup } from '@xartifact/x-herald-shared'
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
  // 每行暂存待分配的组（可多选），点按钮确认
  const [assignSelections, setAssignSelections] = useState<Record<string, string[]>>({})
  const assignInstance = useSetInstanceGroups()
  const toggleInstance = useToggleModelInstance()

  const groupOptions: MultiSelectOption[] = groups.map((g) => ({
    value: g.id,
    label: g.displayName || g.name,
    disabled: !g.enabled,
  }))

  if (instances.length === 0) return null

  const handleAssign = async (instanceId: string) => {
    const groupIds = assignSelections[instanceId]
    if (!groupIds || groupIds.length === 0) return
    await assignInstance.mutateAsync({ id: instanceId, groupIds })
    setAssignSelections((prev) => {
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
              <TableHead className="text-right">分配到组（可多选）</TableHead>
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
                    <MultiSelect
                      className="w-[240px]"
                      options={groupOptions}
                      selected={assignSelections[instance.id] ?? []}
                      onChange={(values) =>
                        setAssignSelections((prev) => ({ ...prev, [instance.id]: values }))
                      }
                      placeholder="选择模型组..."
                      searchPlaceholder="搜索模型组..."
                      emptyText="无匹配的模型组"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        (assignSelections[instance.id]?.length ?? 0) === 0 ||
                        assignInstance.isPending
                      }
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
