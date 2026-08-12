import { Card, CardContent } from '../../../shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import type { AccessModel, PotentialModel, PotentialModelAction } from '@xartifact/x-herald-shared'

import { PotentialModelRow } from './potential-model-row'

interface PotentialModelListProps {
  models: PotentialModel[]
  accessModelsById: Map<string, AccessModel>
  isLoading?: boolean
  onConvert: (pm: PotentialModel) => void
  onRouteTo: (pm: PotentialModel) => void
  onToggleEnabled: (pm: PotentialModel) => void
  onDelete: (pm: PotentialModel) => void
}

function actionLabel(action: PotentialModelAction): string {
  return action === 'observe' ? '观察' : '路由至接入模型'
}

export function PotentialModelList({
  models,
  accessModelsById,
  isLoading = false,
  onConvert,
  onRouteTo,
  onToggleEnabled,
  onDelete,
}: PotentialModelListProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型名称</TableHead>
              <TableHead className="text-right">请求数</TableHead>
              <TableHead>最近出现</TableHead>
              <TableHead>策略</TableHead>
              <TableHead>路由目标</TableHead>
              <TableHead>启用</TableHead>
              <TableHead className="text-right">采样密钥</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                  暂无潜在模型
                </TableCell>
              </TableRow>
            ) : (
              models.map((pm) => (
                <PotentialModelRow
                  key={pm.id}
                  pm={pm}
                  accessModelsById={accessModelsById}
                  actionLabel={actionLabel(pm.action)}
                  onConvert={onConvert}
                  onRouteTo={onRouteTo}
                  onToggleEnabled={onToggleEnabled}
                  onDelete={onDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
