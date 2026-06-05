'use client'

import type { ComponentProps } from 'react'

import { ModelInstanceForm } from '../../model-groups'

import { ProviderFormDialog, SyncModelsDialog } from './index'
import { ThinkingTypeMappingDialog } from './ThinkingTypeMappingDialog'

interface ProviderPageDialogsProps {
  instance: ComponentProps<typeof ModelInstanceForm>
  providerForm: ComponentProps<typeof ProviderFormDialog>
  syncModels: ComponentProps<typeof SyncModelsDialog>
  thinkingMapping: ComponentProps<typeof ThinkingTypeMappingDialog>
}

export function ProviderPageDialogs({ instance, providerForm, syncModels, thinkingMapping }: ProviderPageDialogsProps) {
  return (
    <>
      <ModelInstanceForm {...instance} />
      <ProviderFormDialog {...providerForm} />
      <SyncModelsDialog {...syncModels} />
      <ThinkingTypeMappingDialog {...thinkingMapping} />
    </>
  )
}
