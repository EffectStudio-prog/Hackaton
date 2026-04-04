import React, { useEffect, useMemo, useState } from 'react'
import { Bot, BrainCircuit, CircleAlert, ClipboardList, Hospital, MessageSquareQuote, ShieldPlus, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import AttachmentList from './AttachmentList'
import DoctorCard from './DoctorCard'
import FacilityCard from './FacilityCard'
import type { SharedAttachment } from '../utils/fileUploads'
import { apiFetch } from '../utils/api'

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
  attachments?: SharedAttachment[]
  predictions?: Array<{
    disease_key: string
    disease: string
    probability: number
    confidence: 'low' | 'medium' | 'high'
    reasons?: string[]
  }>
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
  language: string
  isPremium?: boolean
  onOpenPremium?: () => void
  onStartDoctorChat?: (doctor: Doctor) => void
  onViewDoctorProfile?: (doctor: Doctor) => void
  onStartFacilityChat?: (facility: Facility) => void
  reservationUserKey?: string
  reservationUserLabel?: string
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  language,
  onStartDoctorChat,
  onViewDoctorProfile,
  onStartFacilityChat,
  reservationUserKey,
  reservationUserLabel,
}) => {
  const { t } = useTranslation()
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({})
  const isUser = message.role === 'user'
  const isTyping = message.role === 'typing'
  const hasDoctors = !!message.doctors && message.doctors.length > 0
  const hasClinics = !!message.clinics && message.clinics.length > 0
  const hasHospitals = !!message.hospitals && message.hospitals.length > 0
  const hasPredictions = !!message.predictions && message.predictions.length > 0
  const hasRecommendations = hasDoctors || hasClinics || hasHospitals
  const hasStructuredContent =
    Boolean(message.summary) ||
    Boolean(message.likelyCondition) ||
    Boolean(message.emergencyWarning) ||
    Boolean(message.nextSteps?.length) ||
    Boolean(message.followUpQuestions?.length) ||
    hasPredictions ||
    hasRecommendations

  const topPrediction = message.predictions?.[0]
  const showRawExplanation = Boolean(message.content) && hasStructuredContent

  const translationItems = useMemo(() => {
    if (isUser || isTyping) return []

    const items: Array<{ key: string; value: string }> = []
    const pushItem = (key: string, value?: string) => {
      const trimmed = (value || '').trim()
      if (trimmed) {
        items.push({ key, value: trimmed })
      }
    }

    pushItem('content', message.content)
    pushItem('summary', message.summary)
    pushItem('likelyCondition', message.likelyCondition)
    pushItem('emergencyWarning', message.emergencyWarning)
    message.nextSteps?.forEach((step, index) => pushItem(`nextStep-${index}`, step))
    message.followUpQuestions?.forEach((question, index) => pushItem(`followUp-${index}`, question))
    message.predictions?.forEach((prediction, index) => {
      pushItem(`prediction-disease-${index}`, prediction.disease)
      prediction.reasons?.forEach((reason, reasonIndex) => pushItem(`prediction-reason-${index}-${reasonIndex}`, reason))
    })
    message.clinics?.forEach((facility, index) => pushItem(`clinic-description-${index}`, facility.description))
    message.hospitals?.forEach((facility, index) => pushItem(`hospital-description-${index}`, facility.description))
    return items
  }, [isTyping, isUser, message])

  useEffect(() => {
    if (translationItems.length === 0 || !language) {
      setTranslatedTexts({})
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const response = await apiFetch('/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: translationItems.map(item => item.value),
            target_language: language,
          }),
        })

        if (!response.ok) {
          throw new Error(`Translate failed: ${response.status}`)
        }

        const data = await response.json()
        const translations = Array.isArray(data?.translations) ? data.translations : []
        if (cancelled) return

        const nextMap: Record<string, string> = {}
        translationItems.forEach((item, index) => {
          nextMap[item.key] = translations[index] || item.value
        })
        setTranslatedTexts(nextMap)
      } catch {
        if (!cancelled) {
          const fallbackMap: Record<string, string> = {}
          translationItems.forEach(item => {
            fallbackMap[item.key] = item.value
          })
          setTranslatedTexts(fallbackMap)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [language, translationItems])

  const getTranslated = (key: string, original?: string) => translatedTexts[key] || original || ''

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
            {message.content && (
              <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            )}
            <AttachmentList attachments={message.attachments} compact />
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
        {hasStructuredContent ? (
          <>
            <div className="glass-card overflow-hidden">
              <div className="border-b border-white/50 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.02))] px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                      {t('aiPredictionTitle', { defaultValue: 'AI illness prediction' })}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                      {getTranslated('likelyCondition', message.likelyCondition) || getTranslated('prediction-disease-0', topPrediction?.disease) || t('careRecommendations', { defaultValue: 'Recommended care options based on your symptoms.' })}
                    </p>
                    {message.summary && (
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {getTranslated('summary', message.summary)}
                      </p>
                    )}
                  </div>
                  {topPrediction && (
                    <div className="rounded-2xl bg-white/80 px-3 py-2 text-right shadow-sm dark:bg-slate-900/70">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        {t('predictionRank', { rank: 1, defaultValue: 'Top 1' })}
                      </p>
                      <p className="mt-1 text-xl font-bold text-brand-700 dark:text-brand-300">
                        {topPrediction.probability.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
                {message.emergencyWarning && (
                  <div className="rounded-2xl border border-red-200 bg-red-50/90 px-3 py-3 dark:border-red-900/30 dark:bg-red-500/10">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                      <CircleAlert className="h-4 w-4" />
                      {getTranslated('emergencyWarning', message.emergencyWarning)}
                    </p>
                  </div>
                )}

                {hasPredictions && (
                  <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      <BrainCircuit className="h-4 w-4 text-brand-500" />
                      {t('possibleIllnesses', { defaultValue: 'Possible illnesses' })}
                    </p>
                    <div className="mt-2 grid gap-2">
                      {message.predictions?.slice(0, 3).map((prediction, index) => (
                        <div key={prediction.disease_key} className="rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {index + 1}. {getTranslated(`prediction-disease-${index}`, prediction.disease)}
                              </p>
                              {prediction.reasons && prediction.reasons.length > 0 && (
                                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                  {getTranslated(`prediction-reason-${index}-0`, prediction.reasons[0])}
                                </p>
                              )}
                            </div>
                            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                              {prediction.probability.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {message.nextSteps && message.nextSteps.length > 0 && (
                  <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      <ClipboardList className="h-4 w-4 text-emerald-500" />
                      {t('whatToDoNow', { defaultValue: 'What to do now' })}
                    </p>
                    <div className="mt-2 space-y-2">
                      {message.nextSteps.map((step, index) => (
                        <div key={step} className="rounded-2xl bg-emerald-50/80 px-3 py-2.5 text-sm leading-6 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
                          {getTranslated(`nextStep-${index}`, step)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                  <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      <ShieldPlus className="h-4 w-4 text-amber-500" />
                      {t('followUpQuestions', { defaultValue: 'Helpful follow-up questions' })}
                    </p>
                    <div className="mt-2 space-y-2">
                      {message.followUpQuestions.map((question, index) => (
                        <div key={question} className="rounded-2xl bg-amber-50/80 px-3 py-2.5 text-sm leading-6 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                          {getTranslated(`followUp-${index}`, question)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <AttachmentList attachments={message.attachments} compact />
              </div>
            </div>

            {showRawExplanation && (
              <div className="glass-card px-3 py-3 sm:px-4">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <MessageSquareQuote className="h-4 w-4 text-slate-400" />
                  {t('detailedExplanation', { defaultValue: 'Detailed explanation' })}
                </p>
                <p className="mt-2 text-[13px] sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {getTranslated('content', message.content)}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="glass-card px-3 py-2.5 sm:px-4 sm:py-3">
            {message.content && (
              <p className="text-[13px] sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {getTranslated('content', message.content)}
              </p>
            )}
            <AttachmentList attachments={message.attachments} compact />
          </div>
        )}

        {hasDoctors && (
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <User className="h-3.5 w-3.5 text-brand-500" />
              {t('recommendedDoctor', { defaultValue: 'Recommended doctor' })}
            </p>
            {message.doctors?.map((doctor, index) => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                index={index}
                onStartChat={onStartDoctorChat}
                onViewProfile={onViewDoctorProfile}
                reservationUserKey={reservationUserKey}
                reservationUserLabel={reservationUserLabel}
              />
            ))}
          </div>
        )}

        {hasClinics && (
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Hospital className="h-3.5 w-3.5 text-brand-500" />
              {t('recommendedClinics', { defaultValue: 'Recommended clinics' })}
            </p>
            {message.clinics?.map((facility, index) => (
              <FacilityCard
                key={`clinic-${facility.id}`}
                facility={{ ...facility, description: getTranslated(`clinic-description-${index}`, facility.description) }}
                index={index}
                reservationUserKey={reservationUserKey}
                onOpenCallCenter={onStartFacilityChat}
              />
            ))}
          </div>
        )}

        {hasHospitals && (
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Hospital className="h-3.5 w-3.5 text-red-500" />
              {t('recommendedHospitals', { defaultValue: 'Recommended hospitals' })}
            </p>
            {message.hospitals?.map((facility, index) => (
              <FacilityCard
                key={`hospital-${facility.id}`}
                facility={{ ...facility, description: getTranslated(`hospital-description-${index}`, facility.description) }}
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
