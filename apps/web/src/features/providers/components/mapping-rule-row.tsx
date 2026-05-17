import { Trash2 } from 'lucide-react'
import { UseFormReturn } from 'react-hook-form'


import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

import type { MappingFormData } from './thinking-mapping-types'

const PREDEFINED_TYPES = [
  { value: 'adaptive', label: 'adaptive (Claude 4.6)' },
  { value: 'enabled', label: 'enabled' },
  { value: 'disabled', label: 'disabled' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
]

interface MappingRuleRowProps {
  index: number
  form: UseFormReturn<MappingFormData>
  canRemove: boolean
  onRemove: () => void
}

export function MappingRuleRow({ index, form, canRemove, onRemove }: MappingRuleRowProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>源类型</Label>
            <Input
              {...form.register(`mappings.${index}.from`)}
              placeholder="例如: adaptive"
              list="from-types"
            />
            <datalist id="from-types">
              {PREDEFINED_TYPES.map(t => (
                <option key={t.value} value={t.value} />
              ))}
            </datalist>
          </div>
          <div className="text-muted-foreground pb-2">→</div>
          <div className="flex-1 space-y-2">
            <Label>目标类型</Label>
            <Input
              {...form.register(`mappings.${index}.to`)}
              placeholder="例如: enabled"
              list="to-types"
            />
            <datalist id="to-types">
              {PREDEFINED_TYPES.map(t => (
                <option key={t.value} value={t.value} />
              ))}
            </datalist>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={!canRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
