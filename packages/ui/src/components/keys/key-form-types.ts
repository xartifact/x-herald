export interface KeyFormData {
  name: string
  allowedModels: string
  rateLimitRpm?: number
  rateLimitRpd?: number
  tokenLimitDaily?: number
  enabled: boolean
  expiresAt: string
}
