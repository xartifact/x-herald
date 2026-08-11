import { useState } from 'react'

interface SelectedProvider {
  id: string
  name: string
}

export function useProviderDialogState() {
  const [thinkingMappingOpen, setThinkingMappingOpen] = useState(false)
  const [syncModelsOpen, setSyncModelsOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider | null>(null)

  const handleConfigureThinkingMapping = (providerId: string, name: string) => {
    setSelectedProvider({ id: providerId, name })
    setThinkingMappingOpen(true)
  }

  const handleSyncModels = (providerId: string, name: string) => {
    setSelectedProvider({ id: providerId, name })
    setSyncModelsOpen(true)
  }

  return {
    thinkingMappingOpen,
    setThinkingMappingOpen,
    syncModelsOpen,
    setSyncModelsOpen,
    selectedProvider,
    handleConfigureThinkingMapping,
    handleSyncModels,
  }
}
