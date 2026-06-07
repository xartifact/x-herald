export interface KeyFormData {
  name: string
  allowedModels: string
  rateLimitRpm?: number | null
  rateLimitRpd?: number | null
  tokenLimitDaily?: number | null
  enabled: boolean
  expiresAt: string
}
