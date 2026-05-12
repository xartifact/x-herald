export interface AvailableModelGroup {
  id: string;
  name: string;
  displayName: string;
  instanceCount: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  openDurationMs: number
  maxBackoffMs?: number
  maxTripsBeforeCooldown?: number
  cooldownDurationMs?: number
}

export interface SettingsData {
  aiModelGroupId: string | null;
  availableModelGroups: AvailableModelGroup[];
  circuitBreaker: CircuitBreakerConfig;
}

export interface SettingsFormData {
  aiModelGroupId?: string | null;
  circuitBreaker?: CircuitBreakerConfig;
}
