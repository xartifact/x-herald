import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThinkingTypeMapping } from '../types';

const API_BASE = '/api/providers';

export function useProviderThinkingTypeMappings(providerId: string) {
  return useQuery<ThinkingTypeMapping[]>({
    queryKey: ['providers', providerId, 'thinking-type-mappings'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/${providerId}/thinking-type-mappings`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch thinking type mappings');
      }
      return result.data || [];
    },
    enabled: !!providerId,
  });
}

interface UpdateThinkingTypeMappingsParams {
  providerId: string;
  mappings: ThinkingTypeMapping[];
}

export function useUpdateProviderThinkingTypeMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ providerId, mappings }: UpdateThinkingTypeMappingsParams) => {
      const response = await fetch(`${API_BASE}/${providerId}/thinking-type-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to update thinking type mappings');
      }
      return result.data;
    },
    onSuccess: (_, { providerId }) => {
      queryClient.invalidateQueries({
        queryKey: ['providers', providerId, 'thinking-type-mappings'],
      });
    },
  });
}
