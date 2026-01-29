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
