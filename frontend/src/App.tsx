import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, BrainCircuit, BriefcaseMedical, Crown, Globe, HeartHandshake, LogIn, Moon, Sun, User, UserPlus } from 'lucide-react'

import AdminAccessModal from './components/admin/AdminAccessModal'
import Dashboard from './components/admin/Dashboard'
import AuthModal from './components/AuthModal'
import ChatBox from './components/ChatBox'
import ConsultationPanel from './components/ConsultationPanel'
import DiseasePredictorPage from './components/DiseasePredictorPage'
import DoctorAuthModal from './components/DoctorAuthModal'
import LandingPage from './components/LandingPage'
import MentalWellnessPage from './components/MentalWellnessPage'
import PremiumPage from './components/PremiumPage'
import ProfilePage from './components/ProfilePage'
import { countDoctorPendingRequests, listDoctorLocalConsultations, loadLocalConsultations } from './utils/doctorPortal'
import { loadPremiumConfig } from './utils/premiumConfig'
import {
  applyReferralReward,
  buildReferralCode,
  buildReferralLink,
  loadReferralState,
  stashReferralCodeFromUrl,
  type ReferralState,
} from './utils/referrals'

interface AuthUser {
  id: number
  username: string
  email: string
  is_premium: boolean
  photo_url?: string
  phone_number?: string
}

interface DoctorUser {
  id: number
  name: string
  email: string
  specialty: string
  location?: string
  is_authorized: boolean
  diploma_status?: 'verified' | 'needs_review'
  diploma_name?: string
  is_premium?: boolean
  photo_url?: string
}

interface ViewedDoctorProfile {
  id: number
  name: string
  email: string
  specialty: string
  location?: string
  is_authorized: boolean
  photo_url?: string
}

const AUTH_STORAGE_KEY = 'mydoctor-auth-user'
const DOCTOR_AUTH_STORAGE_KEY = 'mydoctor-doctor-auth-user'
const LOCAL_USER_KEY = 'mydoctor-local-users'
const ADMIN_AUTH_STORAGE_KEY = 'mydoctor-admin-auth'
const ADMIN_USERNAME = 'mydoctor-admin'
const ADMIN_PASSWORD = 'mydoctor2026'

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
  const [showDoctorPortal, setShowDoctorPortal] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DOCTOR_AUTH_STORAGE_KEY))
    } catch {
      return false
    }
  })
  const [doctorPendingRequests, setDoctorPendingRequests] = useState(0)
  const [activePage, setActivePage] = useState<'chat' | 'predictor' | 'profile' | 'wellness'>('chat')
  const [viewedDoctorProfile, setViewedDoctorProfile] = useState<ViewedDoctorProfile | null>(null)
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
  const [premiumConfig, setPremiumConfig] = useState(() => loadPremiumConfig())
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
    if (typeof window === 'undefined') return

    const currentUrl = new URL(window.location.href)
    const telegramAuth = currentUrl.searchParams.get('telegram_auth')
    const telegramError = currentUrl.searchParams.get('telegram_error')
    if (!telegramAuth && !telegramError) {
      return
    }

    if (telegramAuth) {
      try {
        const normalized = telegramAuth.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
        const decoded = JSON.parse(window.atob(padded)) as AuthUser
        const nextUser: AuthUser = {
          ...decoded,
          username: decoded.username ?? decoded.email ?? '',
        }
        setAuthUser(nextUser)
        setIsPremium(Boolean(nextUser.is_premium))
        setActivePage('chat')
        setShowAuthModal(false)
      } catch {}
    }

    currentUrl.searchParams.delete('telegram_auth')
    currentUrl.searchParams.delete('telegram_error')
    window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
  }, [])

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
      setShowDoctorPortal(true)
    } else {
      localStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY)
      setShowDoctorPortal(false)
    }
  }, [doctorUser])

  useEffect(() => {
    if (!doctorUser) {
      setDoctorPendingRequests(0)
      return
    }

    const syncPendingRequests = () => {
      setDoctorPendingRequests(countDoctorPendingRequests(doctorUser.id))
    }

    syncPendingRequests()
    const interval = window.setInterval(syncPendingRequests, 2000)
    return () => window.clearInterval(interval)
  }, [doctorUser])

  useEffect(() => {
    setReferralState(loadReferralState(authUser?.id))
  }, [authUser?.id])

  useEffect(() => {
    stashReferralCodeFromUrl()
  }, [])

  useEffect(() => {
    if (isAdminAuthenticated) {
      sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true')
    } else {
      sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY)
    }
  }, [isAdminAuthenticated])

  useEffect(() => {
    const syncPremiumConfig = () => setPremiumConfig(loadPremiumConfig())
    window.addEventListener('storage', syncPremiumConfig)
    return () => window.removeEventListener('storage', syncPremiumConfig)
  }, [])

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
    if (doctorUser && !authUser) {
      setDoctorUser({ ...doctorUser, is_premium: true })
      try {
        const raw = localStorage.getItem('mydoctor-local-doctors')
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          localStorage.setItem(
            'mydoctor-local-doctors',
            JSON.stringify(parsed.map(doctor => (doctor.id === doctorUser.id ? { ...doctor, is_premium: true } : doctor)))
          )
        }
      } catch {}
      setShowPremiumPage(false)
      return
    }
    await syncPremium(true)
    setShowPremiumPage(false)
  }

  const handleDeactivatePremium = async () => {
    if (doctorUser && !authUser) {
      setDoctorUser({ ...doctorUser, is_premium: false })
      try {
        const raw = localStorage.getItem('mydoctor-local-doctors')
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          localStorage.setItem(
            'mydoctor-local-doctors',
            JSON.stringify(parsed.map(doctor => (doctor.id === doctorUser.id ? { ...doctor, is_premium: false } : doctor)))
          )
        }
      } catch {}
      return
    }
    await syncPremium(false)
  }

  const handleAuthenticated = (user: AuthUser, mode: 'login' | 'signup') => {
    if (mode === 'signup') {
      applyReferralReward(user.id)
    }
    setAuthUser(user)
    setIsPremium(Boolean(user.is_premium))
    setActivePage('chat')
  }

  const handleDoctorAuthenticated = (doctor: DoctorUser) => {
    setDoctorUser(doctor)
    setShowDoctorPortal(true)
    setActivePage('chat')
  }

  const handleUserPhotoChange = (photoUrl: string) => {
    if (!authUser) return

    const nextUser = { ...authUser, photo_url: photoUrl }
    setAuthUser(nextUser)

    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        localStorage.setItem(
          LOCAL_USER_KEY,
          JSON.stringify(parsed.map(user => (user.id === authUser.id ? { ...user, photo_url: photoUrl } : user)))
        )
      }
    } catch {}
  }

  const handleDoctorPhotoChange = (photoUrl: string) => {
    if (!doctorUser) return

    const nextDoctor = { ...doctorUser, photo_url: photoUrl }
    setDoctorUser(nextDoctor)

    try {
      const raw = localStorage.getItem('mydoctor-local-doctors')
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        localStorage.setItem(
          'mydoctor-local-doctors',
          JSON.stringify(parsed.map(doctor => (doctor.id === doctorUser.id ? { ...doctor, photo_url: photoUrl } : doctor)))
        )
      }
    } catch {}
  }

  const handleLogout = () => {
    setAuthUser(null)
    setIsPremium(false)
    setActivePage('chat')
  }

  const handleDoctorLogout = () => {
    setDoctorUser(null)
    setShowDoctorPortal(false)
    setActivePage('chat')
    setViewedDoctorProfile(null)
  }

  const handleOpenDoctorProfile = (doctor: { id: number; name: string; specialty: string; location: string }) => {
    try {
      const raw = localStorage.getItem('mydoctor-local-doctors')
      const parsed = raw ? JSON.parse(raw) : []
      const matched = Array.isArray(parsed) ? parsed.find(item => item.id === doctor.id) : null

      setViewedDoctorProfile({
        id: doctor.id,
        name: matched?.name ?? doctor.name,
        email: matched?.email ?? `${doctor.name.toLowerCase().replace(/\s+/g, '.')}@mydoctor.local`,
        specialty: matched?.specialty ?? doctor.specialty,
        location: matched?.location ?? doctor.location,
        is_authorized: Boolean(matched?.is_authorized),
        photo_url: matched?.photo_url,
      })
      setShowDoctorPortal(false)
      setShowPremiumPage(false)
      setShowAdminDashboard(false)
      setActivePage('profile')
    } catch {
      setViewedDoctorProfile({
        id: doctor.id,
        name: doctor.name,
        email: `${doctor.name.toLowerCase().replace(/\s+/g, '.')}@mydoctor.local`,
        specialty: doctor.specialty,
        location: doctor.location,
        is_authorized: false,
      })
      setShowDoctorPortal(false)
      setShowPremiumPage(false)
      setShowAdminDashboard(false)
      setActivePage('profile')
    }
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

  const referralCode = authUser ? buildReferralCode(authUser.id) : 'MYDOC-GUEST'
  const referralLink = authUser ? buildReferralLink(authUser.id) : window.location.href
  const userConsultationCount = authUser
    ? loadLocalConsultations().filter(consultation => consultation.user_id === authUser.id).length
    : 0
  const doctorConsultationCount = doctorUser
    ? listDoctorLocalConsultations(doctorUser.id).length
    : 0

  const currentLangLabel = languages.find(language => language.code === currentLang)?.label || 'EN'

  return (
    <div className="h-full flex flex-col bg-[linear-gradient(180deg,#fffdfb_0%,#fff7f5_45%,#fff3f1_100%)] text-slate-900 transition-colors duration-300 dark:bg-[linear-gradient(180deg,#0d1324_0%,#10182b_50%,#151c31_100%)] dark:text-white">
      <header className="relative z-50 mx-3 mt-3 flex-shrink-0 rounded-[1.7rem] border border-white/70 bg-white/70 px-3 py-2.5 shadow-[0_22px_60px_-35px_rgba(240,128,128,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,0.9)] sm:mx-4 sm:mt-4 sm:px-4 sm:py-3">
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
            {!authUser && !doctorUser ? (
              <button
                onClick={() => setShowAuthModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                title={t('loginTitle', { defaultValue: 'Log in' })}
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden md:inline">{t('loginTitle', { defaultValue: 'Log in' })}</span>
                <UserPlus className="w-3.5 h-3.5 hidden md:inline" />
              </button>
            ) : null}

            {doctorUser ? (
              <>
                <button
                  onClick={() => {
                    setShowDoctorPortal(true)
                    setActivePage('chat')
                  }}
                  className={`btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold ${
                    showDoctorPortal ? 'text-brand-700 dark:text-brand-300' : ''
                  }`}
                  title={t('doctorPortalTitle')}
                >
                  <BriefcaseMedical className="w-4 h-4" />
                  <span className="hidden md:inline">{t('doctorPortalTitle')}</span>
                  {doctorPendingRequests > 0 && (
                    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {doctorPendingRequests}
                    </span>
                  )}
                </button>
              </>
            ) : !authUser ? (
              <button
                onClick={() => setShowDoctorAuthModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold"
                title={t('doctorLoginTitle')}
              >
                <BriefcaseMedical className="w-4 h-4" />
                <span className="hidden md:inline">{t('doctorLoginTitle')}</span>
              </button>
            ) : null}

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
              onClick={() => setActivePage(value => (value === 'predictor' ? 'chat' : 'predictor'))}
              className={`btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold ${
                activePage === 'predictor' ? 'text-brand-700 dark:text-brand-300' : ''
              }`}
              title={t('predictorTitle', { defaultValue: 'Symptom-based disease prediction' })}
            >
              <BrainCircuit className="w-4 h-4" />
              <span className="hidden md:inline">
                {t('predictorNav', { defaultValue: 'AI predictor' })}
              </span>
            </button>

            <button
              onClick={() => {
                setShowDoctorPortal(false)
                setViewedDoctorProfile(null)
                setActivePage(value => (value === 'wellness' ? 'chat' : 'wellness'))
              }}
              className={`btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold ${
                activePage === 'wellness' ? 'text-brand-700 dark:text-brand-300' : ''
              }`}
              title={t('mentalWellnessNav', { defaultValue: 'Mental wellness support' })}
            >
              <HeartHandshake className="w-4 h-4" />
              <span className="hidden md:inline">
                {t('mentalWellnessNav', { defaultValue: 'Mental wellness support' })}
              </span>
            </button>

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

      <main className={`relative flex-1 overflow-hidden w-full flex flex-col ${showAdminDashboard ? 'max-w-7xl mx-auto px-2 sm:px-4 lg:px-6' : 'max-w-none px-0'}`}>
        {showAdminDashboard ? (
          <Dashboard
            onBack={() => {
              setShowAdminDashboard(false)
              setPremiumConfig(loadPremiumConfig())
            }}
          />
        ) : activePage === 'profile' && (authUser || doctorUser || viewedDoctorProfile) ? (
          <ProfilePage
            authUser={authUser}
            doctorUser={viewedDoctorProfile ?? doctorUser}
            consultationCount={viewedDoctorProfile ? 0 : doctorUser ? doctorConsultationCount : userConsultationCount}
            onBack={() => {
              setActivePage('chat')
              setViewedDoctorProfile(null)
            }}
            onLogout={viewedDoctorProfile ? () => setActivePage('chat') : doctorUser ? handleDoctorLogout : handleLogout}
            onPhotoChange={viewedDoctorProfile ? undefined : doctorUser ? handleDoctorPhotoChange : handleUserPhotoChange}
            canEdit={!viewedDoctorProfile}
            canLogout={!viewedDoctorProfile}
          />
        ) : doctorUser && showDoctorPortal ? (
          <ConsultationPanel
            actorType="doctor"
            actorId={doctorUser.id}
            doctor={{
              id: doctorUser.id,
              name: doctorUser.name,
              specialty: doctorUser.specialty,
            }}
            storageMode="local"
            variant="page"
            onClose={() => setShowDoctorPortal(false)}
            onOpenProfile={() => {
              setViewedDoctorProfile(null)
              setShowDoctorPortal(false)
              setActivePage('profile')
            }}
            isPremiumDoctor={Boolean(doctorUser.is_premium)}
          />
        ) : activePage === 'predictor' ? (
          <DiseasePredictorPage />
        ) : activePage === 'wellness' ? (
          <MentalWellnessPage
            onBack={() => setActivePage('chat')}
          />
        ) : !authUser && !doctorUser && activePage === 'chat' ? (
          <LandingPage
            onOpenAuth={() => setShowAuthModal(true)}
            onOpenDoctorAuth={() => setShowDoctorAuthModal(true)}
            onOpenPremium={() => setShowPremiumPage(true)}
            onOpenPredictor={() => setActivePage('predictor')}
            onOpenWellness={() => setActivePage('wellness')}
          />
        ) : (
          <ChatBox
            isPremium={isPremium}
            userId={authUser?.id}
            userLabel={authUser?.username || authUser?.email || t('callCenterPatientLabel', { defaultValue: 'Call center visitor' })}
            language={currentLang}
            onOpenPremium={() => setShowPremiumPage(true)}
            onRequireAuth={() => setShowAuthModal(true)}
            onViewDoctorProfile={handleOpenDoctorProfile}
            onOpenWellness={() => {
              setShowDoctorPortal(false)
              setViewedDoctorProfile(null)
              setActivePage('wellness')
            }}
            onOpenProfile={
              authUser
                ? () => {
                    setViewedDoctorProfile(null)
                    setShowDoctorPortal(false)
                    setActivePage('profile')
                  }
                : undefined
            }
          />
        )}
      </main>

      {showLangMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowLangMenu(false)}
        />
      )}

      {showPremiumPage && (
        <div className="fixed inset-0 z-[70] bg-[#fff7f1]/65 px-3 py-4 backdrop-blur-xl dark:bg-[#060814]/70 sm:px-4 sm:py-6">
          <div className="h-full overflow-y-auto">
            <PremiumPage
              isPremium={doctorUser && !authUser ? Boolean(doctorUser.is_premium) : isPremium}
              onActivate={handleActivatePremium}
              onDeactivate={handleDeactivatePremium}
              onBack={() => setShowPremiumPage(false)}
              monthlyPrice={premiumConfig.monthlyPrice}
              yearlyPrice={premiumConfig.yearlyPrice}
              referralPoints={referralState.points}
              referralCount={referralState.referrals}
              referralCode={referralCode}
              referralLink={referralLink}
              onRedeemReferralMonth={handleRedeemReferralMonth}
              accountType={doctorUser && !authUser ? 'doctor' : 'user'}
            />
          </div>
        </div>
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

    </div>
  )
}

export default App
