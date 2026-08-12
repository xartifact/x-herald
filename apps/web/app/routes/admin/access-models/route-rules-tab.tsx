import { useMemo, useState } from 'react'

import { Loader2 } from 'lucide-react'

import {
  useRouteRuleVersions,
  useRouteRuleEditor,
  useActivateRouteRuleVersion,
  useDeleteRouteRuleVersion,
  type RouteRuleVersion,
} from '../../../hooks/route-rules'
import { Badge, Button, Card, CardContent, FlowEditor, DeployBanner } from '@xartifact/x-herald-ui'

import type { AccessModel, CanvasGraph } from '@xartifact/x-herald-shared'

interface RouteRulesTabProps {
  accessModel: AccessModel
}

function buildDefaultGraph(am: AccessModel): CanvasGraph {
  return {
    nodes: [
      {
        id: `vm-${am.id}`,
        type: 'modelTrigger',
        position: { x: 0, y: 0 },
        data: { label: am.displayName || am.name, modelName: am.name, vmId: am.id },
      },
    ],
    edges: [],
  }
}

export function RouteRulesTab({ accessModel }: RouteRulesTabProps) {
  const { data: versions = [], isLoading } = useRouteRuleVersions(accessModel.id)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const activateMutation = useActivateRouteRuleVersion(accessModel.id)
  const deleteMutation = useDeleteRouteRuleVersion(accessModel.id)

  const editingVersion: RouteRuleVersion | null =
    versions.find((v) => v.id === selectedVersionId) ??
    versions.find((v) => v.active) ??
    versions[0] ??
    null

  const defaultGraph = useMemo(() => buildDefaultGraph(accessModel), [accessModel])
  const editor = useRouteRuleEditor({
    accessModelId: accessModel.id,
    activeVersion: editingVersion,
    fallbackGraph: defaultGraph,
  })
  const initialGraph = editingVersion?.graph ?? defaultGraph

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            加载中...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-260px)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {versions.length === 0 && (
            <span className="text-sm text-muted-foreground">
              尚无版本，编辑画布后点击部署即创建
            </span>
          )}
          {versions.map((v) => (
            <Button
              key={v.id}
              variant={v.id === (editingVersion?.id ?? null) ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedVersionId(v.id)}
            >
              {v.name} · v{v.version}
              {v.active && (
                <Badge variant="secondary" className="ml-1.5">
                  active
                </Badge>
              )}
            </Button>
          ))}
        </div>
        {editingVersion && !editingVersion.active && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => activateMutation.mutate(editingVersion.id)}
              disabled={activateMutation.isPending}
            >
              激活此版本
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteMutation.mutate(editingVersion.id)}
              disabled={deleteMutation.isPending}
            >
              删除
            </Button>
          </div>
        )}
      </div>

      <DeployBanner
        isDirty={editor.isDirty}
        isDeploying={editor.isDeploying}
        validationErrorCount={editor.validationErrors.length}
        onDeploy={editor.handleDeploy}
        onSaveDraft={editor.handleSaveDraft}
        onDiscardDraft={editor.handleDiscardDraft}
      />

      <div className="flex-1 min-h-0">
        <Card className="overflow-hidden h-full">
          <CardContent className="p-0 h-full">
            <FlowEditor
              initialGraph={initialGraph}
              refreshKey={editingVersion?.id ?? 'new'}
              onNodesEdgesChange={editor.handleNodesEdgesChange}
              onNodeSelect={editor.handleNodeSelect}
              selectedNode={editor.selectedNode}
              onUpdateNodeData={editor.handleUpdateNodeData}
              onReady={editor.onReady}
              validationErrors={editor.validationErrors}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
