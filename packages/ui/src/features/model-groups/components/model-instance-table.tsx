import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Unlink } from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import { InstanceAiChat } from '../../ai-assist'
import { Button } from '../../../shared/components/ui/button'
import { InstanceTestButton } from './instance-test-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import type { ModelInstance } from '@xartifact/x-herald-shared'

interface ModelInstanceTableProps {
  instances: ModelInstance[]
  getProviderName: (providerId: string) => string
  /** 所属模型组 id；提供时在操作列显示"移出本组" */
  groupId?: string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
  /** 拖拽结束后提交新的组内实例 id 顺序 */
  onReorder: (orderedIds: string[]) => void
  onToggle: (instance: ModelInstance) => void
  /** 仅解绑成员关系，不删除实例本身 */
  onDetach?: (groupId: string, instance: ModelInstance) => void
}

/**
 * 由拖拽落定信息解析新的实例 id 顺序。
 * 返回 null 表示无需提交：无落点、原地放置、或任一 id 不在列表中。
 */
export function resolveReorder(
  instanceIds: string[],
  activeId: string | number | undefined,
  overId: string | number | undefined,
): string[] | null {
  if (activeId === undefined || overId === undefined || activeId === overId) return null
  const ids = instanceIds.map(String)
  const oldIndex = ids.indexOf(String(activeId))
  const newIndex = ids.indexOf(String(overId))
  if (oldIndex === -1 || newIndex === -1) return null
  return arrayMove(ids, oldIndex, newIndex)
}

function SortableRow({
  instance,
  index,
  getProviderName,
  groupId,
  onEdit,
  onDelete,
  onToggle,
  onDetach,
}: {
  instance: ModelInstance
  index: number
  getProviderName: (providerId: string) => string
  groupId?: string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
  onToggle: (instance: ModelInstance) => void
  onDetach?: (groupId: string, instance: ModelInstance) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.id })

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'z-10 relative bg-muted/70' : undefined}
      data-testid={`instance-row-${instance.id}`}
    >
      <TableCell className="text-muted-foreground">
        <div className="flex items-center gap-1">
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground"
            aria-label={`拖拽调整 ${instance.name} 顺序`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <span className="w-5 text-right tabular-nums">{index + 1}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{instance.name}</div>
      </TableCell>
      <TableCell>{getProviderName(instance.providerId)}</TableCell>
      <TableCell>
        <code className="text-xs bg-muted px-1 py-0.5 rounded">{instance.actualModelName}</code>
      </TableCell>
      <TableCell>
        <StatusToggle enabled={instance.enabled} onToggle={() => onToggle(instance)} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <InstanceAiChat instanceId={instance.id} instanceName={instance.name} />
          <InstanceTestButton instanceId={instance.id} instanceName={instance.name} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(instance)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {groupId && onDetach && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="移出本组（不删除实例）"
              onClick={() => onDetach(groupId, instance)}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDelete(instance)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ModelInstanceTable({
  instances,
  getProviderName,
  groupId,
  onEdit,
  onDelete,
  onReorder,
  onToggle,
  onDetach,
}: ModelInstanceTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (instances.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">暂无实例</div>
  }

  const instanceIds = instances.map((i) => i.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const newOrder = resolveReorder(instanceIds, event.active.id, event.over?.id)
    if (newOrder) onReorder(newOrder)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>实例名称</TableHead>
            <TableHead>供应商</TableHead>
            <TableHead>实际模型</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext items={instanceIds} strategy={verticalListSortingStrategy}>
            {instances.map((instance, index) => (
              <SortableRow
                key={instance.id}
                instance={instance}
                index={index}
                getProviderName={getProviderName}
                groupId={groupId}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
                onDetach={onDetach}
              />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  )
}
