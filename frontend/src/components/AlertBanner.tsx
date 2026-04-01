import React from 'react'
import { AlertTriangle, Phone, Siren } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AlertBannerProps {
  message?: string
}

const AlertBanner: React.FC<AlertBannerProps> = ({ message }) => {
  const { t } = useTranslation()

  return (
    <div className="animate-slide-up mx-1 mb-3">
      <div className="relative overflow-hidden rounded-2xl border border-red-200/70 bg-gradient-to-r from-red-700 via-red-600 to-rose-600 p-4 shadow-2xl shadow-red-500/40 ring-2 ring-red-300/70 dark:border-red-400/20 dark:ring-red-400/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_35%)]" />
        <div className="absolute top-3 right-3">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-100"></span>
          </span>
        </div>

        <div className="relative flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 rounded-xl bg-white/12 p-2">
            <Siren className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.22em] font-black text-red-100/90">
              {t('urgencyHigh', { defaultValue: 'High urgency' })}
            </p>
            <p className="font-bold text-white text-sm leading-relaxed">
              {message || t('emergency')}
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-100" />
              <span className="text-xs font-semibold text-red-50">
                {t('emergencyNow', { defaultValue: 'Get emergency help now' })}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Phone className="w-4 h-4 text-red-100" />
              <a
                href="tel:103"
                className="text-white font-black text-xl hover:text-red-50 transition-colors underline underline-offset-2"
              >
                103
              </a>
              <span className="text-red-100 text-sm font-medium">- {t('emergencyServices')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AlertBanner
