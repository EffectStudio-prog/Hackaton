import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, BriefcaseMedical, Crown, Globe, LogIn, Moon, Sun, User, UserPlus } from 'lucide-react'

import AdminAccessModal from './components/admin/AdminAccessModal'
import Dashboard from './components/admin/Dashboard'
import AuthModal from './components/AuthModal'
import ChatBox from './components/ChatBox'
import ConsultationPanel from './components/ConsultationPanel'
import DoctorAuthModal from './components/DoctorAuthModal'
import PremiumPage from './components/PremiumPage'

interface AuthUser {
  id: number
  username: string
  email: string
  is_premium: boolean
}

interface DoctorUser {
  id: number
  name: string
  email: string
  specialty: string
  is_authorized: boolean
}

const AUTH_STORAGE_KEY = 'mydoctor-auth-user'
const DOCTOR_AUTH_STORAGE_KEY = 'mydoctor-doctor-auth-user'
const REFERRAL_STORAGE_KEY = 'mydoctor-referrals'
const LOCAL_USER_KEY = 'mydoctor-local-users'
const ADMIN_AUTH_STORAGE_KEY = 'mydoctor-admin-auth'
const ADMIN_USERNAME = 'mydoctor-admin'
const ADMIN_PASSWORD = 'mydoctor2026'

interface ReferralState {
  points: number
  referrals: number
}

const getReferralStorageKey = (userId?: number) =>
  userId ? `${REFERRAL_STORAGE_KEY}-${userId}` : `${REFERRAL_STORAGE_KEY}-guest`

const loadReferralState = (userId?: number): ReferralState => {
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

function App() {
  const { t, i18n } = useTranslation()
  const languages = [
    { code: 'en', label: 'EN', name: t('languageEnglish') },
    { code: 'ru', label: 'RU', name: t('languageRussian') },
    { code: 'uz', label: 'UZ', name: t('languageUzbek') },
  ]
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('medmap-dark') === 'true')
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw)
      if (!parsed) {
        return null
      }
      return {
        ...parsed,
        username: parsed.username ?? parsed.email ?? '',
      }
    } catch {
      return null
    }
  })
  const [doctorUser, setDoctorUser] = useState<DoctorUser | null>(() => {
    try {
      const raw = localStorage.getItem(DOCTOR_AUTH_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [isPremium, setIsPremium] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return Boolean(parsed?.is_premium)
      }
    } catch {}
    return localStorage.getItem('medmap-premium') === 'true'
  })
  const [showPremiumPage, setShowPremiumPage] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [showAdminAccessModal, setShowAdminAccessModal] = useState(false)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showDoctorAuthModal, setShowDoctorAuthModal] = useState(false)
  const [showDoctorPortal, setShowDoctorPortal] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [adminTapCount, setAdminTapCount] = useState(0)
  const [lastAdminTap, setLastAdminTap] = useState(0)
  const [referralState, setReferralState] = useState<ReferralState>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return loadReferralState(parsed?.id)
    } catch {
      return loadReferralState()
    }
  })
  const [currentLang, setCurrentLang] = useState(() => {
    const savedLanguage = localStorage.getItem('medmap-language')
    const initialLanguage = savedLanguage || i18n.resolvedLanguage || i18n.language || 'en'
    return initialLanguage.split('-')[0]
  })

  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem('medmap-dark', String(darkMode))
  }, [darkMode])

  useEffect(() => {
    const savedLanguage = localStorage.getItem('medmap-language')
    const activeLanguage = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]

    if (savedLanguage && savedLanguage !== activeLanguage) {
      i18n.changeLanguage(savedLanguage)
      return
    }

    setCurrentLang(activeLanguage)
    document.documentElement.lang = activeLanguage
  }, [i18n, i18n.language, i18n.resolvedLanguage])

  useEffect(() => {
    localStorage.setItem('medmap-premium', String(isPremium))
  }, [isPremium])

  useEffect(() => {
    if (authUser) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }, [authUser])

  useEffect(() => {
    if (doctorUser) {
      localStorage.setItem(DOCTOR_AUTH_STORAGE_KEY, JSON.stringify(doctorUser))
    } else {
      localStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY)
    }
  }, [doctorUser])

  useEffect(() => {
    localStorage.setItem(
      getReferralStorageKey(authUser?.id),
      JSON.stringify(referralState)
    )
  }, [authUser?.id, referralState])

  useEffect(() => {
    setReferralState(loadReferralState(authUser?.id))
  }, [authUser?.id])

  useEffect(() => {
    if (isAdminAuthenticated) {
      sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true')
    } else {
      sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY)
    }
  }, [isAdminAuthenticated])

  const handleLangChange = async (code: string) => {
    localStorage.setItem('medmap-language', code)
    await i18n.changeLanguage(code)
    setCurrentLang(code)
    document.documentElement.lang = code
    setShowLangMenu(false)
  }

  const syncPremium = async (nextPremium: boolean) => {
    if (!authUser) {
      setIsPremium(nextPremium)
      return
    }

    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const updated = parsed.map((user: AuthUser & { password?: string }) =>
            user.id === authUser.id ? { ...user, is_premium: nextPremium } : user
          )
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updated))
        }
      }
      const nextUser = { ...authUser, is_premium: nextPremium }
      setAuthUser(nextUser)
      setIsPremium(nextPremium)
    } catch {
      throw new Error(t('premiumSyncError', { defaultValue: 'Could not update premium status.' }))
    }
  }

  const handleActivatePremium = async () => {
    await syncPremium(true)
    setShowPremiumPage(false)
  }

  const handleDeactivatePremium = async () => {
    await syncPremium(false)
  }

  const handleAuthenticated = (user: AuthUser) => {
    setAuthUser(user)
    setIsPremium(Boolean(user.is_premium))
  }

  const handleDoctorAuthenticated = (doctor: DoctorUser) => {
    setDoctorUser(doctor)
    setShowDoctorPortal(true)
  }

  const handleLogout = () => {
    setAuthUser(null)
    setIsPremium(false)
  }

  const handleDoctorLogout = () => {
    setDoctorUser(null)
    setShowDoctorPortal(false)
  }

  const handleAddReferral = () => {
    setReferralState(previous => ({
      points: previous.points + 1,
      referrals: previous.referrals + 1,
    }))
  }

  const handleRedeemReferralMonth = async () => {
    if (referralState.points < 10) {
      return
    }

    setReferralState(previous => ({
      ...previous,
      points: previous.points - 10,
    }))
    await syncPremium(true)
  }

  const handleAdminAccessTrigger = () => {
    const now = Date.now()
    const shouldReset = now - lastAdminTap > 3000
    setLastAdminTap(now)

    setAdminTapCount(previous => {
      const nextCount = shouldReset ? 1 : previous + 1

      if (nextCount >= 5) {
        setAdminTapCount(0)
        setShowLangMenu(false)
        setShowAuthModal(false)
        setShowDoctorAuthModal(false)
        setShowPremiumPage(false)
        setShowAdminDashboard(false)
        setShowAdminAccessModal(true)
        return 0
      }

      return nextCount
    })
  }

  const handleAdminAuthenticated = () => {
    setIsAdminAuthenticated(true)
    setShowAdminDashboard(true)
    setShowPremiumPage(false)
  }

  const referralCode = authUser
    ? `MYDOC-${String(authUser.id).padStart(4, '0')}`
    : 'MYDOC-GUEST'

  const currentLangLabel = languages.find(language => language.code === currentLang)?.label || 'EN'

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900 transition-colors duration-300">
      <header className="relative z-50 flex-shrink-0 border-b border-white/50 dark:border-gray-700/50 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <button
              onClick={handleAdminAccessTrigger}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20 transition-transform hover:scale-[1.02]"
              title={isAdminAuthenticated ? t('adminUnlocked', { defaultValue: 'Admin access unlocked' }) : undefined}
            >
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base leading-tight">
                {t('appName')}
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 leading-tight hidden sm:block truncate">
                {t('tagline')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 xl:max-w-[72%]">
            {authUser ? (
              <button
                onClick={handleLogout}
                className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                title={t('logout', { defaultValue: 'Log out' })}
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline max-w-[9rem] truncate">
                  {authUser.username || authUser.email}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                title={t('loginTitle', { defaultValue: 'Log in' })}
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden md:inline">{t('loginTitle', { defaultValue: 'Log in' })}</span>
                <UserPlus className="w-3.5 h-3.5 hidden md:inline" />
              </button>
            )}

            {doctorUser ? (
              <>
                <button
                  onClick={() => setShowDoctorPortal(value => !value)}
                  className={`btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold ${
                    showDoctorPortal ? 'text-brand-700 dark:text-brand-300' : ''
                  }`}
                  title={t('doctorPortalTitle')}
                >
                  <BriefcaseMedical className="w-4 h-4" />
                  <span className="hidden md:inline">{t('doctorPortalTitle')}</span>
                </button>
                <button
                  onClick={handleDoctorLogout}
                  className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                  title={t('logout')}
                >
                  <span className="hidden xl:inline max-w-[12rem] truncate">
                    {doctorUser.name} {doctorUser.is_authorized ? `- ${t('doctorApprovedShort')}` : `- ${t('doctorPendingShort')}`}
                  </span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowDoctorAuthModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                title={t('doctorLoginTitle')}
              >
                <BriefcaseMedical className="w-4 h-4" />
                <span className="hidden md:inline">{t('doctorLoginTitle')}</span>
              </button>
            )}

            <div className="relative">
              <button
                id="lang-toggle"
                onClick={() => setShowLangMenu(open => !open)}
                className="btn-ghost flex items-center gap-1.5 text-sm font-semibold"
                title={t('changeLanguage')}
                aria-label={t('changeLanguage')}
                aria-expanded={showLangMenu}
                aria-haspopup="menu"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden md:inline">{currentLangLabel}</span>
              </button>

              {showLangMenu && (
                <div
                  className="absolute right-0 top-full mt-2 glass-card py-1 w-36 z-[60] animate-fade-in"
                  role="menu"
                  aria-label={t('changeLanguage')}
                >
                  {languages.map(language => (
                    <button
                      key={language.code}
                      onClick={() => handleLangChange(language.code)}
                      role="menuitemradio"
                      aria-checked={currentLang === language.code}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-brand-50 dark:hover:bg-brand-900/30 ${
                        currentLang === language.code
                          ? 'text-brand-600 dark:text-brand-400 font-semibold'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {language.label} - {language.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              id="premium-toggle"
              onClick={() => {
                setShowPremiumPage(true)
                setShowAdminDashboard(false)
              }}
              className={`btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold ${
                isPremium
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              title={isPremium ? t('premiumManage') : t('switchToPremium')}
            >
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">
                {isPremium ? t('premiumBadge') : t('upgradePremium')}
              </span>
              <span className="hidden 2xl:inline text-[10px] opacity-60">
                {isPremium ? t('premiumFeatureDoctors') : t('premiumTeaser')}
              </span>
            </button>

            <button
              id="dark-mode-toggle"
              onClick={() => setDarkMode(value => !value)}
              className="btn-ghost"
              title={darkMode ? t('lightMode') : t('darkMode')}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 overflow-hidden w-full flex flex-col ${
          showAdminDashboard || showPremiumPage
            ? 'max-w-7xl mx-auto px-2 sm:px-4 lg:px-6'
            : 'max-w-none px-0'
        }`}
      >
        {showAdminDashboard ? (
          <Dashboard onBack={() => setShowAdminDashboard(false)} />
        ) : showPremiumPage ? (
          <PremiumPage
            isPremium={isPremium}
            onActivate={handleActivatePremium}
            onDeactivate={handleDeactivatePremium}
            onBack={() => setShowPremiumPage(false)}
            referralPoints={referralState.points}
            referralCount={referralState.referrals}
            referralCode={referralCode}
            onAddReferral={handleAddReferral}
            onRedeemReferralMonth={handleRedeemReferralMonth}
          />
        ) : (
          <ChatBox
            isPremium={isPremium}
            userId={authUser?.id}
            language={currentLang}
            onOpenPremium={() => setShowPremiumPage(true)}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}
      </main>

      {showLangMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowLangMenu(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {showDoctorAuthModal && (
        <DoctorAuthModal
          onClose={() => setShowDoctorAuthModal(false)}
          onAuthenticated={handleDoctorAuthenticated}
        />
      )}

      {showAdminAccessModal && (
        <AdminAccessModal
          onClose={() => setShowAdminAccessModal(false)}
          onAuthenticated={handleAdminAuthenticated}
          expectedUsername={ADMIN_USERNAME}
          expectedPassword={ADMIN_PASSWORD}
        />
      )}

      {showDoctorPortal && doctorUser && (
        <ConsultationPanel
          actorType="doctor"
          actorId={doctorUser.id}
          onClose={() => setShowDoctorPortal(false)}
        />
      )}
    </div>
  )
}

export default App
