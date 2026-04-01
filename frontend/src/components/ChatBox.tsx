import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Crown,
  History,
  MapPin,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Stethoscope,
} from 'lucide-react'

import ConsultationPanel from './ConsultationPanel'
import MessageBubble from './MessageBubble'
import PremiumMapPage from './PremiumMapPage'
import { apiFetch } from '../utils/api'
import { buildNearbyHospitalsMapUrl, requestCurrentPosition } from '../utils/maps'

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
  createdAt?: number
  isPremium?: boolean
  summary?: string
  likelyCondition?: string
  preventionTips?: string[]
  emergencyWarning?: string
  specialty?: string
  urgency?: string
  nextSteps?: string[]
  followUpQuestions?: string[]
  doctors?: Doctor[]
  urgent?: boolean
}

interface Conversation {
  id: string
  title: string
  preview: string
  updatedAt: number
  messages: Message[]
}

interface ChatBoxProps {
  isPremium: boolean
  userId?: number
  language: string
  onOpenPremium: () => void
  onRequireAuth: () => void
}

const CHAT_HISTORY_KEY = 'mydoctor-chat-history'
const CHAT_HISTORY_MINIMIZED_KEY = 'mydoctor-chat-history-minimized'

const SUGGESTIONS: Record<string, string[]> = {
  en: [
    'I have a severe headache and nausea',
    'My chest hurts and I feel short of breath',
    'I have a rash on my arm',
    'My child has a high fever',
  ],
  ru: [
    'У меня сильная головная боль и тошнота',
    'Боль в груди и трудно дышать',
    'На руке появилась сыпь',
    'У моего ребенка высокая температура',
  ],
  uz: [
    "Boshim qattiq og'riyapti va ko'ngil ayniyapti",
    "Ko'kragim og'riyapti va nafas olish qiyin",
    "Qo'limda toshma bor",
    'Farzandimning isitmasi baland',
  ],
}

const genId = () => Math.random().toString(36).substring(2, 10)

const sortConversations = (conversations: Conversation[]) =>
  [...conversations].sort((left, right) => right.updatedAt - left.updatedAt)

const loadStoredConversations = (): Conversation[] => {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return sortConversations(parsed)
  } catch {
    return []
  }
}

const ChatBox: React.FC<ChatBoxProps> = ({ isPremium, userId, language, onOpenPremium, onRequireAuth }) => {
  const { t, i18n } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>(() => loadStoredConversations())
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => loadStoredConversations()[0]?.id ?? null)
  const [messages, setMessages] = useState<Message[]>(() => loadStoredConversations()[0]?.messages ?? [])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [mapError, setMapError] = useState('')
  const [mapIframeUrl, setMapIframeUrl] = useState('')
  const [isHistoryMinimized, setIsHistoryMinimized] = useState(() => localStorage.getItem(CHAT_HISTORY_MINIMIZED_KEY) === 'true')
  const [consultationState, setConsultationState] = useState<{ doctor: Doctor; consultationId: number } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_MINIMIZED_KEY, String(isHistoryMinimized))
  }, [isHistoryMinimized])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const element = textareaRef.current
    if (element) {
      element.style.height = 'auto'
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`
    }
  }, [input])

  useEffect(() => {
    if (!currentConversationId) {
      setMessages([])
      return
    }

    const activeConversation = conversations.find(conversation => conversation.id === currentConversationId)
    setMessages(activeConversation?.messages ?? [])
  }, [currentConversationId, conversations])

  const upsertConversation = useCallback((conversationId: string, nextMessages: Message[]) => {
    const persistedMessages = nextMessages.filter(message => message.role !== 'typing')
    if (persistedMessages.length === 0) return

    const firstUserMessage = persistedMessages.find(message => message.role === 'user')?.content || t('newChat')
    const lastMessage = persistedMessages[persistedMessages.length - 1]?.content || firstUserMessage
    const nextConversation: Conversation = {
      id: conversationId,
      title: firstUserMessage.slice(0, 42),
      preview: lastMessage.slice(0, 72),
      updatedAt: Date.now(),
      messages: persistedMessages,
    }

    setConversations(previous => {
      const filtered = previous.filter(conversation => conversation.id !== conversationId)
      return sortConversations([nextConversation, ...filtered])
    })
  }, [t])

  const handleStartNewChat = () => {
    if (isLoading) return
    setCurrentConversationId(null)
    setMessages([])
    setInput('')
    setMapIframeUrl('')
    setMapError('')
  }

  const handleSelectConversation = (conversationId: string) => {
    if (isLoading) return
    setCurrentConversationId(conversationId)
    setMapIframeUrl('')
    setMapError('')
  }

  const openPremiumHospitalsMap = useCallback(async () => {
    try {
      setMapState('loading')
      setMapError('')
      const position = await requestCurrentPosition()
      const { latitude, longitude } = position.coords
      setMapIframeUrl(buildNearbyHospitalsMapUrl(latitude, longitude))
      setMapState('idle')
    } catch (error) {
      setMapState('error')
      if (error instanceof Error && error.message === 'geolocation_not_supported') {
        setMapError(t('premiumMapUnsupported'))
        return
      }
      setMapError(t('premiumMapDenied'))
    }
  }, [t])

  const openDoctorConsultation = useCallback(async (doctor: Doctor) => {
    if (!userId) {
      onRequireAuth()
      return
    }

    try {
      const response = await apiFetch('/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          doctor_id: doctor.id,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.detail ?? t('consultationCreateError'))
      }

      setConsultationState({ doctor, consultationId: data.id })
    } catch (error) {
      const errText = error instanceof Error ? error.message : t('consultationCreateError')
      window.alert(errText)
    }
  }, [onRequireAuth, t, userId])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const conversationId = currentConversationId ?? genId()
    const userMsg: Message = { id: genId(), role: 'user', content: trimmed, createdAt: Date.now(), isPremium }
    const typingMsg: Message = { id: 'typing', role: 'typing', content: '' }
    const pendingMessages = [...messages, userMsg, typingMsg]

    setCurrentConversationId(conversationId)
    setMessages(pendingMessages)
    upsertConversation(conversationId, pendingMessages)
    setInput('')
    setIsLoading(true)

    try {
      const response = await apiFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          user_id: userId ?? null,
          language: i18n.language?.split('-')[0] || language,
          is_premium: isPremium,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error?.detail ?? `Server error ${response.status}`)
      }

      const data = await response.json()
      const aiMsg: Message = {
        id: genId(),
        role: 'ai',
        content: data.reply,
        createdAt: Date.now(),
        summary: data.summary,
        likelyCondition: data.likely_condition,
        preventionTips: data.prevention_tips,
        emergencyWarning: data.emergency_warning,
        specialty: data.specialty,
        urgency: data.urgency_level,
        nextSteps: data.next_steps,
        followUpQuestions: data.follow_up_questions,
        doctors: data.doctors,
        urgent: data.urgent,
      }

      const resolvedMessages = pendingMessages.filter(message => message.id !== 'typing').concat(aiMsg)
      setMessages(resolvedMessages)
      upsertConversation(conversationId, resolvedMessages)
    } catch (error: unknown) {
      const errText = error instanceof Error ? error.message : String(error)
      const errorMsg: Message = {
        id: genId(),
        role: 'ai',
        content: `Could not reach the backend.\n\nMake sure:\n- The FastAPI server is running on port 8000\n- The triage API is available\n\nError: ${errText}`,
      }

      const failedMessages = pendingMessages.filter(message => message.id !== 'typing').concat(errorMsg)
      setMessages(failedMessages)
      upsertConversation(conversationId, failedMessages)
    } finally {
      setIsLoading(false)
    }
  }, [currentConversationId, i18n.language, isLoading, isPremium, language, messages, upsertConversation, userId])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(input)
    }
  }

  const lang = i18n.language?.split('-')[0] || 'en'
  const suggestions = SUGGESTIONS[lang] ?? SUGGESTIONS.en
  const showWelcome = messages.length === 0 && !currentConversationId

  const formattedConversations = useMemo(
    () =>
      conversations.map(conversation => ({
        ...conversation,
        shortDate: new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
        }).format(new Date(conversation.updatedAt)),
      })),
    [conversations]
  )

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={`border-b lg:border-b-0 lg:border-r border-white/50 dark:border-gray-700/50 bg-white/35 dark:bg-gray-900/35 backdrop-blur-sm flex-shrink-0 transition-all duration-200 ${
          isHistoryMinimized ? 'w-[88px]' : 'w-full lg:w-72 lg:min-w-72'
        }`}
      >
        <div className="h-full px-2 py-3 sm:px-3 sm:py-4 flex flex-col gap-3">
          <div className={`flex ${isHistoryMinimized ? 'flex-col' : 'items-center'} gap-2`}>
            <button
              onClick={() => setIsHistoryMinimized(value => !value)}
              className="btn-ghost inline-flex items-center justify-center gap-2"
              title={isHistoryMinimized ? t('maximizePanel', { defaultValue: 'Maximize' }) : t('minimizePanel', { defaultValue: 'Minimal' })}
            >
              {isHistoryMinimized ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              {!isHistoryMinimized && <span>{t('minimizePanel', { defaultValue: 'Minimal' })}</span>}
            </button>

            <button
              onClick={handleStartNewChat}
              disabled={isLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-3 text-sm font-semibold transition-colors ${
                isHistoryMinimized ? 'w-full px-0' : 'flex-1'
              }`}
              title={t('newChat')}
            >
              <MessageSquarePlus className="w-4 h-4" />
              {!isHistoryMinimized && <span>{t('newChat')}</span>}
            </button>
          </div>

          {!isHistoryMinimized && (
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 px-1">
              <History className="w-3.5 h-3.5" />
              {t('chatHistory')}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden pb-1">
            {formattedConversations.length === 0 ? (
              isHistoryMinimized ? (
                <div className="glass-card w-full p-3 flex items-center justify-center">
                  <History className="w-4 h-4 text-gray-400" />
                </div>
              ) : (
                <div className="glass-card p-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  {t('historyEmpty')}
                </div>
              )
            ) : (
              formattedConversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation.id)}
                  disabled={isLoading}
                  title={conversation.title}
                  className={`min-w-[220px] lg:min-w-0 text-left rounded-2xl px-3 py-3 transition-all border ${
                    currentConversationId === conversation.id
                      ? 'bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-100'
                      : 'bg-white/60 border-white/50 text-gray-700 hover:bg-white dark:bg-gray-900/50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900'
                  } ${isHistoryMinimized ? 'min-w-0 w-full flex items-center justify-center px-0' : ''}`}
                >
                  {isHistoryMinimized ? (
                    <History className="w-4 h-4" />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold leading-5 truncate">{conversation.title}</p>
                        <span className="text-[10px] uppercase tracking-wide opacity-60 flex-shrink-0">
                          {conversation.shortDate}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 opacity-75 truncate">{conversation.preview}</p>
                    </>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {mapIframeUrl ? (
          <PremiumMapPage
            iframeUrl={mapIframeUrl}
            onBack={() => {
              setMapIframeUrl('')
              setMapError('')
            }}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
              {showWelcome && (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fade-in px-2">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-2xl shadow-brand-500/30 mb-4 sm:mb-6">
                    <Stethoscope className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {t('welcomeTitle')}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed text-xs sm:text-sm mb-6 sm:mb-8">
                    {t('welcomeText')}
                  </p>

                  {!isPremium && (
                    <div className="glass-card max-w-xl w-full p-4 sm:p-5 mb-6 text-left">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {t('premiumUpsellTitle')}
                          </p>
                          <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-6">
                            {t('premiumUpsellText')}
                          </p>
                        </div>
                        <button
                          onClick={onOpenPremium}
                          className="btn-primary flex items-center gap-2 px-4 py-2 text-xs sm:text-sm"
                        >
                          <Crown className="w-4 h-4" />
                          {t('upgradePremium')}
                        </button>
                      </div>
                    </div>
                  )}

                  {mapError && isPremium && (
                    <div className="max-w-xl w-full mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-left dark:border-red-900/40 dark:bg-red-500/10">
                      <p className="text-[11px] sm:text-xs text-red-600 dark:text-red-300 leading-relaxed">
                        {mapError}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-lg">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => sendMessage(suggestion)}
                        className="text-[11px] sm:text-xs bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-700 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full transition-colors text-left"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(message => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isPremium={isPremium}
                  onOpenPremium={onOpenPremium}
                  onStartDoctorChat={openDoctorConsultation}
                />
              ))}

              <div ref={bottomRef} />
            </div>

            <div className="px-3 sm:px-4 pb-1">
              <p className="text-center text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                {t('disclaimer')}
              </p>
            </div>

            <div className="px-2 sm:px-4 pb-3 sm:pb-4 pt-2">
              <div className="glass-card p-1.5 sm:p-2 flex items-end gap-1.5 sm:gap-2">
                <textarea
                  ref={textareaRef}
                  id="chat-input"
                  className="input-field flex-1 min-h-[44px] sm:min-h-[48px] max-h-[120px] sm:max-h-[160px] text-[13px] sm:text-sm border-0 bg-transparent focus:ring-0 py-2.5 sm:py-3 px-3"
                  placeholder={t('placeholder')}
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading || mapState === 'loading'}
                />
                {isPremium && (
                  <button
                    id="map-button"
                    onClick={openPremiumHospitalsMap}
                    disabled={mapState === 'loading'}
                    className="flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-lg sm:rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
                    aria-label={t('premiumMapOpen')}
                    title={mapState === 'loading' ? t('findingNearestHospital') : t('premiumMapOpen')}
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                )}
                <button
                  id="send-button"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="btn-primary flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center p-0 rounded-lg sm:rounded-xl"
                  aria-label={t('send')}
                  title={t('send')}
                >
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {consultationState && userId && (
        <ConsultationPanel
          actorType="user"
          actorId={userId}
          doctor={{
            id: consultationState.doctor.id,
            name: consultationState.doctor.name,
            specialty: consultationState.doctor.specialty,
          }}
          initialConsultationId={consultationState.consultationId}
          onClose={() => setConsultationState(null)}
        />
      )}
    </div>
  )
}

export default ChatBox
