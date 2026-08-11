import { useState, useCallback } from 'react'
import { CalendarIcon } from 'lucide-react'

import { Button } from '../../../shared/components/ui'

export type DateRangePreset = 'today' | '7d' | '30d' | 'custom'

export interface DateRangeFilter {
  preset: DateRangePreset
  startDate?: string
  endDate?: string
}

interface CostDateFilterProps {
  value: DateRangeFilter
  onChange: (value: DateRangeFilter) => void
}

function getDateRange(preset: DateRangePreset): { startDate?: string; endDate?: string } {
  const now = new Date()
  const endDate = now.toISOString().split('T')[0]

  switch (preset) {
    case 'today': {
      return { startDate: endDate, endDate }
    }
    case '7d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { startDate: start.toISOString().split('T')[0], endDate }
    }
    case '30d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 30)
      return { startDate: start.toISOString().split('T')[0], endDate }
    }
    case 'custom':
    default:
      return {}
  }
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: '今天',
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  custom: '自定义',
}

export function CostDateFilter({ value, onChange }: CostDateFilterProps) {
  const [showCustom, setShowCustom] = useState(false)

  const handlePresetChange = useCallback(
    (preset: DateRangePreset) => {
      const range = getDateRange(preset)
      onChange({ preset, ...range })
      setShowCustom(preset === 'custom')
    },
    [onChange],
  )

  const handleCustomDateChange = useCallback(
    (field: 'startDate' | 'endDate', dateValue: string) => {
      onChange({
        ...value,
        preset: 'custom',
        [field]: dateValue,
      })
    },
    [value, onChange],
  )

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex items-center border rounded-md bg-background">
          {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((preset) => (
            <Button
              key={preset}
              variant={value.preset === preset ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handlePresetChange(preset)}
              className="rounded-none first:rounded-l-md last:rounded-r-md"
            >
              {preset === 'custom' ? <CalendarIcon className="h-4 w-4" /> : PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>
      </div>

      {showCustom && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-background border rounded-md shadow-lg p-3 space-y-2 min-w-[240px]">
          <div className="text-sm font-medium">自定义日期</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">开始日期</label>
              <input
                type="date"
                value={value.startDate || ''}
                onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">结束日期</label>
              <input
                type="date"
                value={value.endDate || ''}
                onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
