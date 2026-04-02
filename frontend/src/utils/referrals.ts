export interface ReferralState {
  points: number
  referrals: number
}

const REFERRAL_STORAGE_KEY = 'mydoctor-referrals'
const REFERRAL_REWARDS_KEY = 'mydoctor-referral-rewards'
const PENDING_REFERRAL_KEY = 'mydoctor-pending-referral'

const getReferralStorageKey = (userId?: number) =>
  userId ? `${REFERRAL_STORAGE_KEY}-${userId}` : `${REFERRAL_STORAGE_KEY}-guest`

export const loadReferralState = (userId?: number): ReferralState => {
  try {
    const raw = localStorage.getItem(getReferralStorageKey(userId))
    if (!raw) {
      return { points: 0, referrals: 0 }
    }
    const parsed = JSON.parse(raw)
    return {
      points: Number(parsed?.points) || 0,
      referrals: Number(parsed?.referrals) || 0,
    }
  } catch {
    return { points: 0, referrals: 0 }
  }
}

export const saveReferralState = (userId: number, state: ReferralState) => {
  localStorage.setItem(getReferralStorageKey(userId), JSON.stringify(state))
}

export const buildReferralCode = (userId: number) => `MYDOC-${String(userId).padStart(4, '0')}`

export const parseReferralCode = (value: string) => {
  const matched = value.trim().match(/^MYDOC-(\d{4,})$/i)
  return matched ? Number(matched[1]) : null
}

export const buildReferralLink = (userId: number) => {
  const origin = window.location.origin
  const path = window.location.pathname
  const code = buildReferralCode(userId)
  return `${origin}${path}?ref=${encodeURIComponent(code)}`
}

export const stashReferralCodeFromUrl = () => {
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (!ref) return null
  sessionStorage.setItem(PENDING_REFERRAL_KEY, ref)
  params.delete('ref')
  const nextQuery = params.toString()
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
  window.history.replaceState({}, document.title, nextUrl)
  return ref
}

export const getPendingReferralCode = () => {
  try {
    return sessionStorage.getItem(PENDING_REFERRAL_KEY)
  } catch {
    return null
  }
}

export const clearPendingReferralCode = () => {
  try {
    sessionStorage.removeItem(PENDING_REFERRAL_KEY)
  } catch {}
}

const loadRewardLedger = (): Record<string, true> => {
  try {
    const raw = localStorage.getItem(REFERRAL_REWARDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveRewardLedger = (ledger: Record<string, true>) => {
  localStorage.setItem(REFERRAL_REWARDS_KEY, JSON.stringify(ledger))
}

export const applyReferralReward = (referredUserId: number) => {
  const pendingCode = getPendingReferralCode()
  if (!pendingCode) {
    return null
  }

  const referrerId = parseReferralCode(pendingCode)
  if (!referrerId || referrerId === referredUserId) {
    clearPendingReferralCode()
    return null
  }

  const rewardKey = `${referrerId}:${referredUserId}`
  const ledger = loadRewardLedger()
  if (ledger[rewardKey]) {
    clearPendingReferralCode()
    return null
  }

  const state = loadReferralState(referrerId)
  const nextState = {
    points: state.points + 1,
    referrals: state.referrals + 1,
  }
  saveReferralState(referrerId, nextState)
  ledger[rewardKey] = true
  saveRewardLedger(ledger)
  clearPendingReferralCode()
  return { referrerId, nextState }
}
