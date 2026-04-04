import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, LogIn, MessageCircleMore, UserPlus, X } from 'lucide-react'
import { apiFetch } from '../utils/api'

const AUTH_DRAFT_KEY = 'mydoctor-auth-draft'
const LOCAL_USER_KEY = 'mydoctor-local-users'

interface AuthUser {
  id: number
  username: string
  email: string
  is_premium: boolean
}

interface AuthModalProps {
  onClose: () => void
  onAuthenticated: (user: AuthUser, mode: 'login' | 'signup') => void
}

interface StoredUser extends AuthUser {
  password: string
}

const loadStoredUsers = (): StoredUser[] => {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveStoredUsers = (users: StoredUser[]) => {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(users))
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onAuthenticated }) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.mode === 'signup' ? 'signup' : 'login'
    } catch {
      return 'login'
    }
  })
  const [email, setEmail] = useState(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.email ?? ''
    } catch {
      return ''
    }
  })
  const [username, setUsername] = useState(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.username ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_DRAFT_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.password ?? ''
    } catch {
      return ''
    }
  })
  const [confirmPassword, setConfirmPassword] = useState(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_DRAFT_KEY)
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
  const [isTelegramSubmitting, setIsTelegramSubmitting] = useState(false)

  const persistDraft = (next: {
    mode?: 'login' | 'signup'
    username?: string
    email?: string
    password?: string
    confirmPassword?: string
  }) => {
    try {
      sessionStorage.setItem(
        AUTH_DRAFT_KEY,
        JSON.stringify({
          mode: next.mode ?? mode,
          username: next.username ?? username,
          email: next.email ?? email,
          password: next.password ?? password,
          confirmPassword: next.confirmPassword ?? confirmPassword,
        })
      )
    } catch {}
  }

  const handleSubmit = async () => {
    const cleanUsername = username.trim().toLowerCase()
    const cleanEmail = email.trim()
    const cleanPassword = password.trim()

    if (!cleanUsername) {
      setError(t('authUsernameError', { defaultValue: 'Enter a username.' }))
      return
    }

    if (mode === 'signup' && !/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      setError(
        t('authUsernameRulesError', {
          defaultValue: 'Username must be 3-32 characters and use letters, numbers, dots, underscores, or dashes.',
        })
      )
      return
    }

    if (mode === 'signup' && (!cleanEmail || !cleanEmail.includes('@'))) {
      setError(t('authEmailError', { defaultValue: 'Enter a valid email address.' }))
      return
    }

    if (cleanPassword.length < 6) {
      setError(t('authPasswordError', { defaultValue: 'Password must be at least 6 characters long.' }))
      return
    }

    if (mode === 'signup' && cleanPassword !== confirmPassword.trim()) {
      setError(t('authPasswordMatchError', { defaultValue: 'Passwords do not match.' }))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const users = loadStoredUsers()

      if (mode === 'signup') {
        const usernameTaken = users.some(user => user.username.toLowerCase() === cleanUsername)
        const emailTaken = users.some(user => user.email.toLowerCase() === cleanEmail.toLowerCase())
        if (usernameTaken) {
          throw new Error(t('authUsernameTaken', { defaultValue: 'That username is already taken.' }))
        }
        if (emailTaken) {
          throw new Error(t('authEmailTaken', { defaultValue: 'That email is already registered.' }))
        }

        const newUser: StoredUser = {
          id: Date.now(),
          username: cleanUsername,
          email: cleanEmail,
          is_premium: false,
          password: cleanPassword,
        }
        saveStoredUsers([newUser, ...users])
        sessionStorage.removeItem(AUTH_DRAFT_KEY)
        onAuthenticated(newUser, 'signup')
        onClose()
        return
      }

      const matched = users.find(
        user =>
          (user.username.toLowerCase() === cleanUsername || user.email.toLowerCase() === cleanUsername) &&
          user.password === cleanPassword
      )

      if (!matched) {
        throw new Error(t('authGenericError', { defaultValue: 'Authentication failed.' }))
      }

      sessionStorage.removeItem(AUTH_DRAFT_KEY)
      onAuthenticated(matched, 'login')
      onClose()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t('authGenericError', { defaultValue: 'Authentication failed.' }))
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

  const handleTelegramLogin = async () => {
    setError('')
    setIsTelegramSubmitting(true)

    try {
      const returnTo = (() => {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.delete('telegram_auth')
        nextUrl.searchParams.delete('telegram_error')
        return nextUrl.toString()
      })()

      const response = await apiFetch(`/auth/telegram/url?return_to=${encodeURIComponent(returnTo)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.auth_url) {
        throw new Error(data?.detail || t('telegramLoginUnavailable', { defaultValue: 'Telegram login is not configured yet.' }))
      }

      window.location.href = String(data.auth_url)
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t('telegramLoginFailed', { defaultValue: 'Could not start Telegram login.' })
      )
      setIsTelegramSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-gray-950/45 backdrop-blur-sm overflow-y-auto px-4 py-4 sm:py-6">
      <div className="min-h-full flex items-center justify-center">
        <div className="glass-card w-full max-w-md max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600 dark:text-brand-300">
              {mode === 'login' ? t('loginTitle', { defaultValue: 'Log in' }) : t('signupTitle', { defaultValue: 'Sign up' })}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {t('authWelcome', { defaultValue: 'Access your MyDoctor account' })}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-2" aria-label={t('close', { defaultValue: 'Close' })}>
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
              {t('loginTitle', { defaultValue: 'Log in' })}
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
              {t('signupTitle', { defaultValue: 'Sign up' })}
            </span>
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-3 dark:border-sky-300/10 dark:bg-sky-400/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-200">
            {t('telegramLoginLabel', { defaultValue: 'Telegram account' })}
          </p>
          <p className="mt-2 text-xs leading-6 text-sky-700 dark:text-sky-100/90">
            {t('telegramRealLoginHint', { defaultValue: 'Real Telegram login can return your profile photo and, with consent, your verified phone number.' })}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleTelegramLogin()}
              disabled={isTelegramSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MessageCircleMore className="h-4 w-4" />
              {isTelegramSubmitting
                ? t('telegramRedirecting', { defaultValue: 'Redirecting to Telegram...' })
                : t('telegramContinue', { defaultValue: 'Continue with Telegram' })}
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <input
            value={username}
            onChange={event => {
              setUsername(event.target.value)
              persistDraft({ username: event.target.value })
            }}
            placeholder={
              mode === 'login'
                ? t('username', { defaultValue: 'Username' })
                : t('createUsername', { defaultValue: 'Create a username' })
            }
            className="input-field text-sm"
            autoComplete="username"
            autoCapitalize="none"
            onKeyDown={handleKeyDown}
          />
          {mode === 'signup' && (
            <input
              value={email}
              onChange={event => {
                setEmail(event.target.value)
                persistDraft({ email: event.target.value })
              }}
              placeholder={t('emailAddress', { defaultValue: 'Email address' })}
              className="input-field text-sm"
              autoComplete="email"
              onKeyDown={handleKeyDown}
            />
          )}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={event => {
                setPassword(event.target.value)
                persistDraft({ password: event.target.value })
              }}
              placeholder={t('password', { defaultValue: 'Password' })}
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
                placeholder={t('confirmPassword', { defaultValue: 'Confirm password' })}
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

        {error && (
          <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="btn-primary mt-5 w-full"
        >
          {mode === 'login'
            ? t('loginTitle', { defaultValue: 'Log in' })
            : t('signupTitle', { defaultValue: 'Sign up' })}
        </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
