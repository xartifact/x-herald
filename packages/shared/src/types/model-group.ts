export type RoutingStrategy = 'round_robin' | 'weighted' | 'least_response_time' | 'priority' | 'smart';

export interface RoutingConfig {
  strategy: RoutingStrategy;
  fallbackEnabled: boolean;
  params?: Record<string, any>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
