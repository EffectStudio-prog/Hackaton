import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react'

interface AdminAccessModalProps {
  onClose: () => void
  onAuthenticated: () => void
  expectedUsername: string
  expectedPassword: string
}

const AdminAccessModal: React.FC<AdminAccessModalProps> = ({
  onClose,
  onAuthenticated,
  expectedUsername,
  expectedPassword,
}) => {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = () => {
    if (username.trim().toLowerCase() === expectedUsername.trim().toLowerCase() && password === expectedPassword) {
      setError('')
      onAuthenticated()
      onClose()
      return
    }

    setError(t('adminAuthError', { defaultValue: 'Incorrect admin username or password.' }))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('adminProtected', { defaultValue: 'Protected admin' })}
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">
              {t('adminLoginTitle', { defaultValue: 'Admin access' })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {t('adminLoginText', { defaultValue: 'Enter the special admin username and password to open the dashboard.' })}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2" aria-label={t('close', { defaultValue: 'Close' })}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <input
            value={username}
            onChange={event => setUsername(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('adminUsername', { defaultValue: 'Admin username' })}
            className="input-field text-sm"
            autoComplete="username"
          />
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('adminPassword', { defaultValue: 'Admin password' })}
              className="input-field pl-10 pr-14 text-sm"
              autoComplete="current-password"
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
        </div>

        {error && (
          <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <button onClick={handleSubmit} className="btn-primary mt-5 w-full">
          {t('adminOpenDashboard', { defaultValue: 'Open dashboard' })}
        </button>
      </div>
    </div>
  )
}

export default AdminAccessModal
