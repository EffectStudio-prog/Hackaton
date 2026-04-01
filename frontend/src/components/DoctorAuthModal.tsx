import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, LogIn, ShieldCheck, Stethoscope, UserPlus, X } from 'lucide-react'

const DOCTOR_AUTH_DRAFT_KEY = 'mydoctor-doctor-auth-draft'
const LOCAL_DOCTOR_KEY = 'mydoctor-local-doctors'

interface DoctorUser {
  id: number
  name: string
  email: string
  specialty: string
  is_authorized: boolean
}

interface DoctorAuthModalProps {
  onClose: () => void
  onAuthenticated: (doctor: DoctorUser) => void
}

interface StoredDoctor extends DoctorUser {
  location: string
  password: string
}

const loadStoredDoctors = (): StoredDoctor[] => {
  try {
    const raw = localStorage.getItem(LOCAL_DOCTOR_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveStoredDoctors = (doctors: StoredDoctor[]) => {
  localStorage.setItem(LOCAL_DOCTOR_KEY, JSON.stringify(doctors))
}

const DoctorAuthModal: React.FC<DoctorAuthModalProps> = ({ onClose, onAuthenticated }) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.mode === 'signup' ? 'signup' : 'login'
    } catch {
      return 'login'
    }
  })
  const [name, setName] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.name ?? ''
    } catch {
      return ''
    }
  })
  const [specialty, setSpecialty] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.specialty ?? ''
    } catch {
      return ''
    }
  })
  const [location, setLocation] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.location ?? ''
    } catch {
      return ''
    }
  })
  const [email, setEmail] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.email ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.password ?? ''
    } catch {
      return ''
    }
  })
  const [confirmPassword, setConfirmPassword] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DOCTOR_AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.confirmPassword ?? ''
    } catch {
      return ''
    }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const persistDraft = (next: {
    mode?: 'login' | 'signup'
    name?: string
    specialty?: string
    location?: string
    email?: string
    password?: string
    confirmPassword?: string
  }) => {
    try {
      sessionStorage.setItem(
        DOCTOR_AUTH_DRAFT_KEY,
        JSON.stringify({
          mode: next.mode ?? mode,
          name: next.name ?? name,
          specialty: next.specialty ?? specialty,
          location: next.location ?? location,
          email: next.email ?? email,
          password: next.password ?? password,
          confirmPassword: next.confirmPassword ?? confirmPassword,
        })
      )
    } catch {}
  }

  const handleSubmit = async () => {
    const cleanEmail = email.trim()
    const cleanPassword = password.trim()
    const cleanName = name.trim()
    const cleanSpecialty = specialty.trim()
    const cleanLocation = location.trim()

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(t('authEmailError'))
      return
    }

    if (cleanPassword.length < 6) {
      setError(t('authPasswordError'))
      return
    }

    if (mode === 'signup' && !cleanName) {
      setError(t('doctorNameError'))
      return
    }

    if (mode === 'signup' && !cleanSpecialty) {
      setError(t('doctorSpecialtyError'))
      return
    }

    if (mode === 'signup' && !cleanLocation) {
      setError(t('doctorLocationError'))
      return
    }

    if (mode === 'signup' && cleanPassword !== confirmPassword.trim()) {
      setError(t('authPasswordMatchError'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const doctors = loadStoredDoctors()

      if (mode === 'signup') {
        const emailTaken = doctors.some(doctor => doctor.email.toLowerCase() === cleanEmail.toLowerCase())
        if (emailTaken) {
          throw new Error(t('doctorEmailTaken', { defaultValue: 'That doctor email is already registered.' }))
        }

        const newDoctor: StoredDoctor = {
          id: Date.now(),
          name: cleanName,
          email: cleanEmail,
          specialty: cleanSpecialty,
          location: cleanLocation,
          is_authorized: false,
          password: cleanPassword,
        }
        saveStoredDoctors([newDoctor, ...doctors])
        sessionStorage.removeItem(DOCTOR_AUTH_DRAFT_KEY)
        onAuthenticated(newDoctor)
        onClose()
        return
      }

      const matched = doctors.find(
        doctor => doctor.email.toLowerCase() === cleanEmail.toLowerCase() && doctor.password === cleanPassword
      )
      if (!matched) {
        throw new Error(t('doctorAuthError'))
      }

      sessionStorage.removeItem(DOCTOR_AUTH_DRAFT_KEY)
      onAuthenticated(matched)
      onClose()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t('doctorAuthError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 z-[85] bg-gray-950/45 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-lg p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600 dark:text-brand-300">
              {mode === 'login' ? t('doctorLoginTitle') : t('doctorSignupTitle')}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {t('doctorAuthWelcome')}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-2" aria-label={t('close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setMode('login')
              setError('')
              persistDraft({ mode: 'login' })
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-brand-600 text-white' : 'bg-white/70 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300'}`}
          >
            <span className="inline-flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              {t('doctorLoginTitle')}
            </span>
          </button>
          <button
            onClick={() => {
              setMode('signup')
              setError('')
              persistDraft({ mode: 'signup' })
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-brand-600 text-white' : 'bg-white/70 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300'}`}
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {t('doctorSignupTitle')}
            </span>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {mode === 'signup' && (
            <>
              <input
                value={name}
                onChange={event => {
                  setName(event.target.value)
                  persistDraft({ name: event.target.value })
                }}
                placeholder={t('doctorFullName')}
                className="input-field text-sm"
                onKeyDown={handleKeyDown}
              />
              <input
                value={specialty}
                onChange={event => {
                  setSpecialty(event.target.value)
                  persistDraft({ specialty: event.target.value })
                }}
                placeholder={t('doctorSpecialty')}
                className="input-field text-sm"
                onKeyDown={handleKeyDown}
              />
              <input
                value={location}
                onChange={event => {
                  setLocation(event.target.value)
                  persistDraft({ location: event.target.value })
                }}
                placeholder={t('doctorLocation')}
                className="input-field text-sm"
                onKeyDown={handleKeyDown}
              />
            </>
          )}
          <input
            value={email}
            onChange={event => {
              setEmail(event.target.value)
              persistDraft({ email: event.target.value })
            }}
            placeholder={t('emailAddress')}
            className="input-field text-sm"
            autoComplete="email"
            onKeyDown={handleKeyDown}
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={event => {
                setPassword(event.target.value)
                persistDraft({ password: event.target.value })
              }}
              placeholder={t('password')}
              className="input-field pr-14 text-sm"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
              aria-label={showPassword ? t('hidePassword', { defaultValue: 'Hide password' }) : t('showPassword', { defaultValue: 'Show password' })}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === 'signup' && (
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={event => {
                  setConfirmPassword(event.target.value)
                  persistDraft({ confirmPassword: event.target.value })
                }}
                placeholder={t('confirmPassword')}
                className="input-field pr-14 text-sm"
                autoComplete="new-password"
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(value => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                aria-label={showConfirmPassword ? t('hidePassword', { defaultValue: 'Hide password' }) : t('showPassword', { defaultValue: 'Show password' })}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50/80 dark:bg-brand-900/20 p-3 text-xs leading-6 text-brand-700 dark:text-brand-200">
          <div className="inline-flex items-center gap-2 font-semibold">
            <Stethoscope className="w-4 h-4" />
            {t('doctorPortalNote')}
          </div>
          <p className="mt-1">{t('doctorPortalHelp')}</p>
        </div>

        {mode === 'signup' && (
          <div className="mt-3 rounded-2xl bg-amber-50/90 dark:bg-amber-900/20 p-3 text-xs leading-6 text-amber-800 dark:text-amber-200">
            <div className="inline-flex items-center gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              {t('doctorApprovalTitle')}
            </div>
            <p className="mt-1">{t('doctorApprovalText')}</p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <button onClick={handleSubmit} disabled={isSubmitting} className="btn-primary mt-5 w-full">
          {mode === 'login' ? t('doctorLoginTitle') : t('doctorSignupTitle')}
        </button>
      </div>
    </div>
  )
}

export default DoctorAuthModal
