import React from 'react'
import { Bot, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import DoctorCard from './DoctorCard'
import FacilityCard from './FacilityCard'

interface Doctor {
  id: number
  name: string
  specialty: string
  rating: number
  location: string
  distance: number
  consultation_fee?: number
}

interface Message {
  id: string
  role: 'user' | 'ai' | 'typing'
  content: string
  summary?: string
  likelyCondition?: string
  preventionTips?: string[]
  emergencyWarning?: string
  specialty?: string
  doctors?: Doctor[]
  clinics?: Facility[]
  hospitals?: Facility[]
  urgent?: boolean
  urgency?: string
  nextSteps?: string[]
  followUpQuestions?: string[]
}

interface Facility {
  id: number
  name: string
  facility_type: string
  specialty_focus: string
  rating: number
  location: string
  distance: number
  reservation_fee: number
  description?: string
}

interface MessageBubbleProps {
  message: Message
  isPremium?: boolean
  onOpenPremium?: () => void
  onStartDoctorChat?: (doctor: Doctor) => void
  onStartFacilityChat?: (facility: Facility) => void
  reservationUserKey?: string
  reservationUserLabel?: string
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onStartDoctorChat,
  onStartFacilityChat,
  reservationUserKey,
  reservationUserLabel,
}) => {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isTyping = message.role === 'typing'
  const hasDoctors = !!message.doctors && message.doctors.length > 0
  const hasClinics = !!message.clinics && message.clinics.length > 0
  const hasHospitals = !!message.hospitals && message.hospitals.length > 0
  const hasRecommendations = hasDoctors || hasClinics || hasHospitals

  if (isTyping) {
    return (
      <div className="flex items-end gap-2 sm:gap-3 animate-fade-in pl-1 sm:pl-0">
        <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md">
          <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
        </div>
        <div className="glass-card px-3 py-2 sm:px-4 sm:py-3 max-w-[200px]">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{t('thinking')}</span>
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        </div>
      </div>
    )
  }

  if (isUser) {
    return (
      <div className="flex items-end gap-2 flex-row-reverse animate-fade-in pr-1 sm:pr-0">
        <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-md">
          <User className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
        </div>
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl rounded-br-sm shadow-lg shadow-brand-500/20">
            <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 sm:gap-3 animate-fade-in pl-1 sm:pl-0">
      <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md mt-1">
        <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
      </div>
      <div className="flex-1 max-w-[92%] sm:max-w-[85%] space-y-2 sm:space-y-3">
        <div className="glass-card px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[13px] sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200">
            {hasRecommendations
              ? t('careRecommendations', { defaultValue: 'Recommended care options based on your symptoms.' })
              : t('noDoctors')}
          </p>
        </div>

        {hasDoctors && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">
              {t('recommendedDoctor', { defaultValue: 'Recommended doctor' })}
            </p>
            {message.doctors?.map((doctor, index) => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                index={index}
                onStartChat={onStartDoctorChat}
                reservationUserKey={reservationUserKey}
                reservationUserLabel={reservationUserLabel}
              />
            ))}
          </div>
        )}

        {hasClinics && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('recommendedClinics', { defaultValue: 'Recommended clinics' })}
            </p>
            {message.clinics?.map((facility, index) => (
              <FacilityCard
                key={`clinic-${facility.id}`}
                facility={facility}
                index={index}
                reservationUserKey={reservationUserKey}
                onOpenCallCenter={onStartFacilityChat}
              />
            ))}
          </div>
        )}

        {hasHospitals && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('recommendedHospitals', { defaultValue: 'Recommended hospitals' })}
            </p>
            {message.hospitals?.map((facility, index) => (
              <FacilityCard
                key={`hospital-${facility.id}`}
                facility={facility}
                index={index}
                reservationUserKey={reservationUserKey}
                onOpenCallCenter={onStartFacilityChat}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
