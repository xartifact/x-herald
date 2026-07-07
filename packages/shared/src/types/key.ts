export interface VirtualKey {
  id: string
  key: string
  name: string
  allowedModels: string[] | null
  rateLimitRpm: number | null
  rateLimitRpd: number | null
  tokenLimitDaily: bigint | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KeyFormData {
  name: string
  allowedModels: string
  rateLimitRpm?: number | null
  rateLimitRpd?: number | null
  tokenLimitDaily?: number | null
  enabled: boolean
  expiresAt: string
}
