import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@xartifact/x-herald-ui'
import { ClipboardList, FileText } from 'lucide-react'

import { ClassifierPromptTab } from './classifier-prompt-tab'
import { IntentLogsTab } from './intent-logs-tab'

const TABS = {
  logs: 'logs',
  prompts: 'prompts',
} as const

type TabValue = (typeof TABS)[keyof typeof TABS]

export function IntentRecognitionPage() {
  const [activeTab, setActiveTab] = useState<TabValue>(TABS.logs)

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as TabValue)}
      className="space-y-4"
    >
      <TabsList className="h-10">
        <TabsTrigger value={TABS.logs}>
          <ClipboardList className="mr-1.5 h-4 w-4" />
          分类记录
        </TabsTrigger>
        <TabsTrigger value={TABS.prompts}>
          <FileText className="mr-1.5 h-4 w-4" />
          提示词配置
        </TabsTrigger>
      </TabsList>

      <TabsContent value={TABS.logs} className="mt-0">
        <IntentLogsTab onNavigateToPrompts={() => setActiveTab(TABS.prompts)} />
      </TabsContent>

      <TabsContent value={TABS.prompts} className="mt-0">
        <ClassifierPromptTab />
      </TabsContent>
    </Tabs>
  )
}
