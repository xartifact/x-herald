import type { KeyStat } from '@x-llm-gateway/shared'
import { Card, CardContent } from '../../../shared/components/ui/card'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import type { KeyRowActions, KeyRowDisplay } from './key-table-row'
import { KeyTableRow } from './key-table-row'
// TODO(6): from apps/web
import type { VirtualKey } from '@x-llm-gateway/shared'

interface KeyTableProps {
  keys: VirtualKey[]
  display: KeyRowDisplay
  actions: KeyRowActions
  stats: Map<string, KeyStat>
  formatDate: (dateStr: string | null) => string
}

export function KeyTable({ keys, display, actions, stats, formatDate }: KeyTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>API 密钥</TableHead>
              <TableHead>最近使用</TableHead>
              <TableHead>用量</TableHead>
              <TableHead>限制</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <KeyTableRow
                key={key.id}
                virtualKey={key}
                stat={stats.get(key.id)}
                display={display}
                actions={actions}
                formatDate={formatDate}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
