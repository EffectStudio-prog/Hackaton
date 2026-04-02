export interface PremiumConfig {
  monthlyPrice: number
  yearlyPrice: number
}

const PREMIUM_CONFIG_KEY = 'mydoctor-premium-config'

export const DEFAULT_PREMIUM_CONFIG: PremiumConfig = {
  monthlyPrice: 2.5,
  yearlyPrice: 27,
}

export const loadPremiumConfig = (): PremiumConfig => {
  try {
    const raw = localStorage.getItem(PREMIUM_CONFIG_KEY)
    if (!raw) return DEFAULT_PREMIUM_CONFIG
    const parsed = JSON.parse(raw)
    return {
      monthlyPrice: Number(parsed?.monthlyPrice) || DEFAULT_PREMIUM_CONFIG.monthlyPrice,
      yearlyPrice: Number(parsed?.yearlyPrice) || DEFAULT_PREMIUM_CONFIG.yearlyPrice,
    }
  } catch {
    return DEFAULT_PREMIUM_CONFIG
  }
}

export const savePremiumConfig = (config: PremiumConfig) => {
  localStorage.setItem(PREMIUM_CONFIG_KEY, JSON.stringify(config))
}
