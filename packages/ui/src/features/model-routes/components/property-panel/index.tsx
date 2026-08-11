import { createContext, useContext } from 'react'

import type { Node, Edge } from '@xyflow/react'
import { MousePointerClick, X } from 'lucide-react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'

import { Button } from '../../../../shared/components/ui/button'
import { useAccessModels } from '../../../access-models/hooks/use-access-models'
import { useModelGroups, useModelInstances } from '../../../model-groups/hooks/use-model-groups'

import { NodeTypeUIRegistry, isNodeType } from '../node-type-ui-registry'
import { RecordField } from './fields/RecordField'
import { CategoryListField } from './fields/CategoryListField'
import { MultiCheckboxWidget } from './widgets/MultiCheckboxWidget'
import { CheckboxWidget } from './widgets/CheckboxWidget'
import { NumberWidget } from './widgets/NumberWidget'
import { RemoteSelectWidget } from './widgets/RemoteSelectWidget'
import { TextWidget } from './widgets/TextWidget'
import { TextareaWidget } from './widgets/TextareaWidget'

interface PropertyPanelProps {
  selectedNode: Node | null
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
  edges?: Edge[]
  nodes?: Node[]
}

const NodeDataContext = createContext<Record<string, unknown> | undefined>(undefined)

export function useNodeData(): Record<string, unknown> | undefined {
  return useContext(NodeDataContext)
}

const WIDGETS = {
  TextWidget,
  TextareaWidget,
  RemoteSelectWidget,
  SelectWidget: RemoteSelectWidget,
  NumberWidget,
  CheckboxWidget,
  MultiCheckboxWidget,
}

const FIELDS = {
  RecordField,
  CategoryListField,
}

export function PropertyPanel({
  selectedNode,
  onUpdate,
  edges = [],
  nodes = [],
}: PropertyPanelProps) {
  const accessModelsQ = useAccessModels()
  const modelGroupsQ = useModelGroups()
  const modelInstancesQ = useModelInstances()

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <MousePointerClick className="h-6 w-6 mb-2 opacity-40" />
        <p className="text-xs font-medium">选择节点</p>
        <p className="text-[11px] mt-0.5 opacity-70">点击画布中的节点查看配置</p>
      </div>
    )
  }

  if (!isNodeType(selectedNode.type)) {
    return (
      <div className="p-4 text-sm text-muted-foreground">未知节点类型: {selectedNode.type}</div>
    )
  }
  const entry = NodeTypeUIRegistry[selectedNode.type]

  const Icon = entry.icon
  const formData = (selectedNode.data ?? {}) as Record<string, unknown>

  // 级联更新：当 targetId 变化时，同步更新 targetName 和 labelType（target 节点特有，
  // 由 NodeTypeUIRegistry[type].deriveOnChange 提供，避免在这里按 node.type 硬编码分支）。
  // 否则画布上会显示旧 target 的名字（targetName 由 buildGraph 设置后即冻结）。
  const handleChange = (next: Record<string, unknown>) => {
    const derived =
      entry.deriveOnChange?.(next, formData, {
        accessModels: accessModelsQ.data,
        modelGroups: modelGroupsQ.data,
        modelInstances: modelInstancesQ.data,
      }) ?? next
    onUpdate(selectedNode.id, derived)
  }

  const handleClose = () => {
    const pane = document.querySelector<HTMLElement>('.react-flow__pane')
    if (pane) pane.click()
  }

  return (
    <NodeDataContext.Provider value={formData}>
      <div className="flex flex-col max-h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
          <div className={`flex items-center gap-2 ${entry.colorClassName}`}>
            <Icon className="h-3.5 w-3.5" />
            <h3 className="text-xs font-semibold">{entry.title}</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={handleClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Form
            schema={entry.rjsfSchema}
            uiSchema={entry.uiSchema}
            formData={formData}
            widgets={WIDGETS}
            fields={FIELDS}
            validator={validator}
            onChange={(e) => handleChange(e.formData ?? {})}
            liveValidate={false}
            showErrorList="bottom"
            noHtml5Validate
          >
            <div className="hidden" />
          </Form>
          {entry.renderExtra?.({ node: selectedNode, edges, nodes })}
        </div>
      </div>
    </NodeDataContext.Provider>
  )
}
