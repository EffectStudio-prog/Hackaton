import React from 'react'
import { ArrowLeft, MapPin, Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PremiumMapPageProps {
  iframeUrl: string
  onBack: () => void
}

const PremiumMapPage: React.FC<PremiumMapPageProps> = ({ iframeUrl, onBack }) => {
  const { t } = useTranslation()

  return (
    <div className="flex-1 overflow-hidden px-2 sm:px-4 py-3 sm:py-4">
      <div className="glass-card h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 px-4 py-3 sm:px-5">
          <div>
            <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
              {t('premiumMapAnywhereTitle')}
            </p>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('premiumMapAnywhereText')}
            </p>
          </div>
          <button
            onClick={onBack}
            className="btn-ghost inline-flex items-center gap-2 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('backToChat')}</span>
          </button>
        </div>

        <div className="px-4 py-3 sm:px-5 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-brand-700 dark:text-brand-300">
            <Navigation className="w-3.5 h-3.5" />
            {t('premiumNearestHospital')}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-700 dark:text-red-300">
            <MapPin className="w-3.5 h-3.5" />
            {t('premiumMapRadius')}
          </div>
        </div>

        <div className="flex-1 bg-slate-100 dark:bg-slate-950">
          <iframe
            src={iframeUrl}
            title={t('premiumMapAnywhereTitle')}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  )
}

export default PremiumMapPage
