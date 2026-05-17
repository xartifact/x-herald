'use client'

import { useState, useMemo } from 'react'

import { useGroupPageGroups } from './use-group-page-groups'
import { useGroupPageInstances } from './use-group-page-instances'

export function useModelGroupPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const groupState = useGroupPageGroups()
  const instanceState = useGroupPageInstances()

  const filteredGroups = useMemo(
    () =>
      groupState.groups.filter(
        (group) =>
          group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [groupState.groups, searchQuery],
  )

  return {
    searchQuery,
    setSearchQuery,
    expandedGroup,
    setExpandedGroup,
    filteredGroups,
    ...groupState,
    ...instanceState,
  }
}
