import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { get, put } from '@xartifact/x-llm-gateway-ui';

import type { SyntheticThinkingStrategy, ThinkingTypeMapping } from '@xartifact/x-llm-gateway-shared';

const API_BASE = '/api/providers';

interface ThinkingConfigApiResponse {
  data: ThinkingTypeMapping[];
  syntheticThinking: SyntheticThinkingStrategy;
}

interface ThinkingConfigResponse {
  mappings: ThinkingTypeMapping[];
  syntheticThinking: SyntheticThinkingStrategy;
}

export function useProviderThinkingConfig(providerId: string) {
  return useQuery<ThinkingConfigResponse>({
    queryKey: ['providers', providerId, 'thinking-type-mappings'],
    queryFn: async () => {
      const result = await get<ThinkingConfigApiResponse>(
        `${API_BASE}/${providerId}/thinking-type-mappings`,
        { extractData: false },
      );
      return {
        mappings: result.data || [],
        syntheticThinking: result.syntheticThinking ?? 'strip',
      };
    },
    enabled: !!providerId,
  });
}

interface UpdateThinkingConfigParams {
  providerId: string;
  mappings: ThinkingTypeMapping[];
  syntheticThinking: SyntheticThinkingStrategy;
}

export function useUpdateProviderThinkingConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ providerId, mappings, syntheticThinking }: UpdateThinkingConfigParams) => {
      return put(
        `${API_BASE}/${providerId}/thinking-type-mappings`,
        { mappings, syntheticThinking },
      );
    },
    onSuccess: (_, { providerId }) => {
      queryClient.invalidateQueries({
        queryKey: ['providers', providerId, 'thinking-type-mappings'],
      });
    },
  });
}
