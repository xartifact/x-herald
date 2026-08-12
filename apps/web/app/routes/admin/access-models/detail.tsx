import { useParams, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { useAccessModel } from '../../../hooks/access-models'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@xartifact/x-herald-ui'

import { RouteRulesTab } from './route-rules-tab'

export function AccessModelDetailPage() {
  const { accessModelId } = useParams({ from: '/admin/access-models/$accessModelId' })
  const navigate = useNavigate()
  const { data: accessModel, isLoading } = useAccessModel(accessModelId)

  if (isLoading || !accessModel) {
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/admin/access-models' })}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <code>{accessModel.name}</code>
            <Badge variant={accessModel.enabled ? 'default' : 'secondary'}>
              {accessModel.enabled ? '启用' : '禁用'}
            </Badge>
          </h2>
          {accessModel.displayName && (
            <p className="text-muted-foreground">{accessModel.displayName}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="route-rules">
        <TabsList>
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="route-rules">路由规则</TabsTrigger>
        </TabsList>
        <TabsContent value="basic">
          <Card>
            <CardContent className="py-6 space-y-3 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">名称</span>
                <code>{accessModel.name}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">显示名</span>
                <span>{accessModel.displayName || '-'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">描述</span>
                <span>{accessModel.description || '-'}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">在接入模型列表页可编辑以上字段。</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="route-rules">
          <RouteRulesTab accessModel={accessModel} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
