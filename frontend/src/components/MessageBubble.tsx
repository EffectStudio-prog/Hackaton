import React from 'react'
import { Bot, Lock, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import AlertBanner from './AlertBanner'
import DoctorCard from './DoctorCard'

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
  urgent?: boolean
  urgency?: string
  nextSteps?: string[]
  followUpQuestions?: string[]
}

interface MessageBubbleProps {
  message: Message
  isPremium?: boolean
  onOpenPremium?: () => void
  onStartDoctorChat?: (doctor: Doctor) => void
}

const urgencyMap: Record<string, string> = {
  low: 'urgencyLow',
  medium: 'urgencyMedium',
  high: 'urgencyHigh',
}

const normalizeText = (value?: string) =>
  (value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const uniqueTextList = (items?: string[]) => {
  const seen: string[] = []

  return (items || []).filter(item => {
    const normalized = normalizeText(item)
    if (!normalized) {
      return false
    }

    const isDuplicate = seen.some(existing =>
      existing === normalized ||
      existing.includes(normalized) ||
      normalized.includes(existing)
    )

    if (isDuplicate) {
      return false
    }

    seen.push(normalized)
    return true
  })
}

const splitIntoComparableParts = (value?: string) =>
  (value || '')
    .split(/[.!?\n]+/)
    .map(part => normalizeText(part))
    .filter(Boolean)

const isSimilarToAny = (value: string, comparisons: string[]) =>
  comparisons.some(existing => {
    if (!existing) return false
    return (
      existing === value ||
      existing.includes(value) ||
      value.includes(existing)
    )
  })

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isPremium = false,
  onOpenPremium,
  onStartDoctorChat,
}) => {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isTyping = message.role === 'typing'
  const normalizedContent = normalizeText(message.content)
  const normalizedLikelyCondition = normalizeText(message.likelyCondition)
  const normalizedSummary = normalizeText(message.summary)
  const normalizedEmergencyWarning = normalizeText(message.emergencyWarning)
  const contentParts = splitIntoComparableParts(message.content)
  const comparisonParts = uniqueTextList([
    ...contentParts,
    normalizedLikelyCondition,
    normalizedSummary,
    normalizedEmergencyWarning,
  ])
  const visibleLikelyCondition =
    !!normalizedLikelyCondition &&
    !isSimilarToAny(normalizedLikelyCondition, contentParts)
  const visibleSummary =
    !!normalizedSummary &&
    !isSimilarToAny(normalizedSummary, [normalizedContent, normalizedLikelyCondition])
  const visibleNextSteps = uniqueTextList(message.nextSteps).filter(step => {
    const normalized = normalizeText(step)
    return !isSimilarToAny(normalized, comparisonParts)
  })
  const visiblePreventionTips = uniqueTextList(message.preventionTips).filter(tip => {
    const normalized = normalizeText(tip)
    return !isSimilarToAny(normalized, comparisonParts)
  })
  const visibleFollowUpQuestions = uniqueTextList(message.followUpQuestions).filter(question => {
    const normalized = normalizeText(question)
    return !isSimilarToAny(normalized, comparisonParts)
  })
  const visibleEmergencyWarning =
    !!normalizedEmergencyWarning &&
    !isSimilarToAny(normalizedEmergencyWarning, [normalizedContent, normalizedLikelyCondition, normalizedSummary])
  const emergencyBubbleClass = message.urgent
    ? 'border border-red-200/80 bg-gradient-to-br from-red-50 via-white to-rose-50 shadow-2xl shadow-red-500/20 ring-2 ring-red-200/80 dark:border-red-500/30 dark:from-red-950/40 dark:via-gray-900 dark:to-rose-950/30 dark:ring-red-500/20'
    : 'glass-card'

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
        {message.urgent && <AlertBanner />}

        <div className={`${emergencyBubbleClass} px-3 py-2.5 sm:px-4 sm:py-3`}>
          {message.specialty && message.urgency && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2 pb-2 sm:mb-2.5 sm:pb-2.5 border-b border-gray-100 dark:border-gray-700">
              <span className="inline-flex items-center gap-1 sm:gap-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full capitalize">
                {message.specialty}
              </span>
              <span className={`text-[10px] sm:text-xs font-semibold ${message.urgent ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {t(urgencyMap[message.urgency] || 'urgencyLow')}
              </span>
              {message.urgent && (
                <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-500/30">
                  {t('emergencyNow', { defaultValue: 'Emergency' })}
                </span>
              )}
            </div>
          )}

          <p className={`text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap ${message.urgent ? 'text-red-950 dark:text-red-50 font-semibold' : 'text-gray-800 dark:text-gray-200'}`}>
            {message.content}
          </p>

          {visibleLikelyCondition && (
            <div className={`mt-3 pt-3 border-t ${message.urgent ? 'border-red-200/80 dark:border-red-500/20' : 'border-gray-100 dark:border-gray-700'}`}>
              <p className={`text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-1.5 ${message.urgent ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {t('likelyCondition', { defaultValue: 'Likely condition' })}
              </p>
              <p className={`text-[12px] sm:text-[13px] font-medium leading-relaxed ${message.urgent ? 'text-red-800 dark:text-red-100' : 'text-gray-700 dark:text-gray-200'}`}>
                {message.likelyCondition}
              </p>
            </div>
          )}

          {visibleSummary && (
            <div className={`mt-3 pt-3 border-t ${message.urgent ? 'border-red-200/80 dark:border-red-500/20' : 'border-gray-100 dark:border-gray-700'}`}>
              <p className={`text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-1.5 ${message.urgent ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {t('caseSummary', { defaultValue: 'Quick summary' })}
              </p>
              <p className={`text-[12px] sm:text-[13px] font-medium leading-relaxed ${message.urgent ? 'text-red-800 dark:text-red-100' : 'text-gray-600 dark:text-gray-300'}`}>
                {message.summary}
              </p>
            </div>
          )}

          {visibleNextSteps.length > 0 && (
            <div className={`mt-3 sm:mt-4 pt-3 sm:pt-4 border-t ${message.urgent ? 'border-red-200/80 dark:border-red-500/20' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-3 shadow-sm dark:border-emerald-800/50 dark:bg-emerald-900/20">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2 text-emerald-700 dark:text-emerald-300">
                {t('whatToDoNow', { defaultValue: 'What to do now' })}
              </p>
              <ul className="space-y-1.5">
                {visibleNextSteps.map((step, index) => (
                  <li
                    key={`${message.id}-step-${index}`}
                    className="text-[13px] sm:text-sm leading-relaxed text-emerald-900 dark:text-emerald-50 font-medium"
                  >
                    {step}
                  </li>
                ))}
              </ul>
              </div>
            </div>
          )}

          {visiblePreventionTips.length > 0 && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/90 px-3 py-3 shadow-sm dark:border-sky-800/50 dark:bg-sky-900/20">
                <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2 text-sky-700 dark:text-sky-300">
                  {t('preventLater', { defaultValue: 'How to prevent this later' })}
                </p>
                <ul className="space-y-1.5">
                  {visiblePreventionTips.map((tip, index) => (
                    <li
                      key={`${message.id}-prevention-${index}`}
                      className="text-[13px] sm:text-sm leading-relaxed text-sky-900 dark:text-sky-50 font-medium"
                    >
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {visibleFollowUpQuestions.length > 0 && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {t('followUpQuestions')}
              </p>
              <ul className="space-y-1.5">
                {visibleFollowUpQuestions.map((question, index) => (
                  <li
                    key={`${message.id}-question-${index}`}
                    className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed"
                  >
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {message.urgent && (
            <div className="mt-3 sm:mt-4 space-y-2">
              {visibleEmergencyWarning && (
                <div className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-3 dark:border-red-700/40 dark:bg-red-500/10">
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300 mb-1.5">
                    {t('emergencyWarning', { defaultValue: 'Emergency warning if needed' })}
                  </p>
                  <p className="text-[12px] sm:text-sm leading-5 text-red-800 dark:text-red-100">
                    {message.emergencyWarning}
                  </p>
                </div>
              )}
              {!isPremium && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 dark:border-amber-700/40 dark:bg-amber-500/10">
                  <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-300" />
                    <div className="flex-1">
                      <p className="text-[12px] sm:text-sm font-semibold text-amber-800 dark:text-amber-200">
                        {t('premiumMapTitle')}
                      </p>
                      <p className="mt-1 text-[11px] sm:text-xs leading-5 text-amber-700 dark:text-amber-100/90">
                        {t('premiumMapTeaser')}
                      </p>
                      <button
                        onClick={onOpenPremium}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        {t('upgradePremium')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {message.doctors && message.doctors.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">
              {t('recommendedDoctor', { defaultValue: 'Recommended doctor' })}
            </p>
            {message.doctors.map((doctor, index) => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                index={index}
                onStartChat={onStartDoctorChat}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
