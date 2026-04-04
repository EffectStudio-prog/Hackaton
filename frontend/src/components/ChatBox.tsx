import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Crown,
  History,
  MapPin,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCircle2,
} from 'lucide-react'

import AttachmentList from './AttachmentList'
import ConsultationPanel from './ConsultationPanel'
import MessageBubble from './MessageBubble'
import PremiumMapPage from './PremiumMapPage'
import { apiFetch } from '../utils/api'
import { ensureLocalConsultation } from '../utils/doctorPortal'
import { createSharedAttachment, type SharedAttachment } from '../utils/fileUploads'
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
  clinics?: Facility[]
  hospitals?: Facility[]
  urgent?: boolean
}

interface Conversation {
  id: string
  title: string
  preview: string
  updatedAt: number
  messages: Message[]
  ownerUserId?: number | null
  ownerUsername?: string
  ownerEmail?: string
}

interface ChatBoxProps {
  isPremium: boolean
  userId?: number
  userLabel?: string
  language: string
  onOpenPremium: () => void
  onRequireAuth: () => void
  onViewDoctorProfile?: (doctor: Doctor) => void
  onOpenWellness?: () => void
  onOpenProfile?: () => void
}

const CHAT_HISTORY_KEY = 'mydoctor-chat-history'
const CHAT_HISTORY_MINIMIZED_KEY = 'mydoctor-chat-history-minimized'
const LOCAL_DOCTOR_KEY = 'mydoctor-local-doctors'
const LOCAL_DOCTOR_RECOMMENDATION_LIMIT = 6
const PATIENT_SESSION_KEY = 'mydoctor-patient-session'
const SIDEBAR_VISIBLE_ITEMS = 5

interface StoredDoctorRecord {
  id: number
  name: string
  email: string
  specialty: string
  location: string
  is_authorized: boolean
}

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

const normalizeText = (value?: string | null) => (value ?? '').trim().toLowerCase()

const buildAttachmentContext = (attachments: SharedAttachment[]) => {
  if (attachments.length === 0) return ''
  return `\n\nAttached files:\n${attachments.map(file => `- ${file.name} (${file.type || 'file'})`).join('\n')}`
}

const loadLocalDoctors = (): StoredDoctorRecord[] => {
  try {
    const raw = localStorage.getItem(LOCAL_DOCTOR_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const buildLocalDoctorRecommendations = (specialty?: string): Doctor[] => {
  const requestedSpecialty = normalizeText(specialty)
  if (!requestedSpecialty) return []

  const registeredDoctors = loadLocalDoctors()

  const mappedDoctors = registeredDoctors.map((doctor, index) => ({
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    rating: doctor.is_authorized ? 4.9 : 4.7,
    location: doctor.location,
    distance: Number((0.6 + index * 0.4).toFixed(1)),
    consultation_fee: doctor.is_authorized ? 120000 : 90000,
  }))

  const matchingDoctors = mappedDoctors.filter(doctor => normalizeText(doctor.specialty).includes(requestedSpecialty))

  return matchingDoctors.slice(0, LOCAL_DOCTOR_RECOMMENDATION_LIMIT)
}

const mergeDoctorRecommendations = (primaryDoctors: Doctor[] = [], localDoctors: Doctor[] = [], isPremiumUser = false) => {
  const merged: Doctor[] = []
  const seenDoctorKeys = new Set<string>()

  for (const doctor of [...localDoctors, ...primaryDoctors]) {
    const key = `${normalizeText(doctor.name)}|${normalizeText(doctor.specialty)}|${normalizeText(doctor.location)}`
    if (seenDoctorKeys.has(key)) continue
    seenDoctorKeys.add(key)
    merged.push(doctor)
  }

  return merged.slice(0, isPremiumUser ? 6 : 3)
}

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

const loadPatientSessionKey = () => {
  try {
    const existing = localStorage.getItem(PATIENT_SESSION_KEY)
    if (existing) return existing
    const next = `guest-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(PATIENT_SESSION_KEY, next)
    return next
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 10)}`
  }
}

const ChatBox: React.FC<ChatBoxProps> = ({ isPremium, userId, userLabel, language, onOpenPremium, onRequireAuth, onViewDoctorProfile, onOpenWellness, onOpenProfile }) => {
  const { t, i18n } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>(() => loadStoredConversations())
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => loadStoredConversations()[0]?.id ?? null)
  const [messages, setMessages] = useState<Message[]>(() => loadStoredConversations()[0]?.messages ?? [])
  const [input, setInput] = useState('')
  const [selectedAttachments, setSelectedAttachments] = useState<SharedAttachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [mapError, setMapError] = useState('')
  const [mapIframeUrl, setMapIframeUrl] = useState('')
  const [isHistoryMinimized, setIsHistoryMinimized] = useState(() => localStorage.getItem(CHAT_HISTORY_MINIMIZED_KEY) === 'true')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [patientSessionKey] = useState(() => loadPatientSessionKey())
  const [consultationState, setConsultationState] = useState<{
    target: { id: number; name: string; specialty: string }
    consultationId: number | null
    demoMode: boolean
    patientLabel?: string
  } | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const element = messagesContainerRef.current
    if (!element) return

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
      setShowScrollToBottom(distanceFromBottom > 160)
    }

    handleScroll()
    element.addEventListener('scroll', handleScroll)
    return () => element.removeEventListener('scroll', handleScroll)
  }, [messages.length, consultationState, mapIframeUrl])

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
      ownerUserId: userId ?? null,
      ownerUsername: userLabel || undefined,
      ownerEmail: userLabel?.includes('@') ? userLabel : undefined,
    }

    setConversations(previous => {
      const filtered = previous.filter(conversation => conversation.id !== conversationId)
      return sortConversations([nextConversation, ...filtered])
    })
  }, [t, userId, userLabel])

  const handleStartNewChat = () => {
    if (isLoading) return
    setCurrentConversationId(null)
    setMessages([])
    setInput('')
    setSelectedAttachments([])
    setMapIframeUrl('')
    setMapError('')
  }

  const handleSelectConversation = (conversationId: string) => {
    if (isLoading) return
    setCurrentConversationId(conversationId)
    setMapIframeUrl('')
    setMapError('')
    setSelectedAttachments([])
  }

  const handleDeleteConversation = useCallback((conversationId: string) => {
    if (isLoading) return

    setConversations(previous => {
      const remaining = previous.filter(conversation => conversation.id !== conversationId)

      if (currentConversationId === conversationId) {
        const nextConversationId = remaining[0]?.id ?? null
        setCurrentConversationId(nextConversationId)
        setMessages(remaining[0]?.messages ?? [])
        setMapIframeUrl('')
        setMapError('')
      }

      return remaining
    })
  }, [currentConversationId, isLoading])

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
    const nextPatientLabel = userLabel || t('callCenterPatientLabel', { defaultValue: 'Call center visitor' })
    const patientKey = userId ? `user-${userId}` : patientSessionKey
    const consultation = ensureLocalConsultation({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
      },
      userId: userId ?? 0,
      patientKey,
      patientLabel: nextPatientLabel,
    })

    setConsultationState({
      target: { id: doctor.id, name: doctor.name, specialty: doctor.specialty },
      consultationId: consultation.id,
      demoMode: false,
      patientLabel: nextPatientLabel,
    })
  }, [patientSessionKey, t, userId, userLabel])

  const openFacilityCallCenter = useCallback((facility: Facility) => {
    setConsultationState({
      target: {
        id: facility.id,
        name: `${facility.name} ${t('callCenterLabel', { defaultValue: 'Call center' })}`,
        specialty: facility.specialty_focus,
      },
      consultationId: null,
      demoMode: true,
      patientLabel: t('callCenterPatientLabel', { defaultValue: 'Call center visitor' }),
    })
  }, [t])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if ((!trimmed && selectedAttachments.length === 0) || isLoading) return

    const conversationId = currentConversationId ?? genId()
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: trimmed,
      attachments: selectedAttachments,
      createdAt: Date.now(),
      isPremium,
    }
    const typingMsg: Message = { id: 'typing', role: 'typing', content: '' }
    const pendingMessages = [...messages, userMsg, typingMsg]

    setCurrentConversationId(conversationId)
    setMessages(pendingMessages)
    upsertConversation(conversationId, pendingMessages)
    setInput('')
    setSelectedAttachments([])
    setIsLoading(true)

    try {
      const response = await apiFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${trimmed}${buildAttachmentContext(selectedAttachments)}`.trim(),
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
      const mergedDoctors = mergeDoctorRecommendations(
        data.doctors,
        buildLocalDoctorRecommendations(data.specialty),
        isPremium
      )
      const aiMsg: Message = {
        id: genId(),
        role: 'ai',
        content: data.reply,
        createdAt: Date.now(),
        summary: data.summary,
        likelyCondition: data.likely_condition,
        predictions: data.predictions,
        preventionTips: data.prevention_tips,
        emergencyWarning: data.emergency_warning,
        specialty: data.specialty,
        urgency: data.urgency_level,
        nextSteps: data.next_steps,
        followUpQuestions: data.follow_up_questions,
        doctors: mergedDoctors,
        clinics: data.clinics,
        hospitals: data.hospitals,
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
        content: t('chatBackendUnavailable', {
          error: errText,
          defaultValue:
            'Could not reach the backend.\n\nMake sure:\n- The FastAPI server is running on port 8000\n- The triage API is available\n\nError: {{error}}',
        }),
      }

      const failedMessages = pendingMessages.filter(message => message.id !== 'typing').concat(errorMsg)
      setMessages(failedMessages)
      upsertConversation(conversationId, failedMessages)
    } finally {
      setIsLoading(false)
    }
  }, [currentConversationId, i18n.language, isLoading, isPremium, language, messages, selectedAttachments, t, upsertConversation, userId])

  const handleAttachmentUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) {
      return
    }

    try {
      const nextFiles = await Promise.all(Array.from(fileList).map(createSharedAttachment))
      setSelectedAttachments(previous => [...previous, ...nextFiles].slice(0, 4))
    } catch (error) {
      const message = error instanceof Error && error.message === 'file_too_large'
        ? t('fileTooLarge', { defaultValue: 'Each file must be smaller than 8 MB.' })
        : t('fileUploadFailed', { defaultValue: 'Could not read the selected file.' })
      setMapError(message)
    } finally {
      event.target.value = ''
    }
  }, [t])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(input)
    }
  }

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const suggestions = [
    t('chatSuggestionOne', { defaultValue: 'I have a severe headache and nausea' }),
    t('chatSuggestionTwo', { defaultValue: 'My chest hurts and I feel short of breath' }),
    t('chatSuggestionThree', { defaultValue: 'I have a rash on my arm' }),
    t('chatSuggestionFour', { defaultValue: 'My child has a high fever' }),
  ]
  const showWelcome = messages.length === 0 && !currentConversationId
  const reservationUserKey = userId ? `user-${userId}` : patientSessionKey
  const reservationUserLabel = userLabel || t('callCenterPatientLabel', { defaultValue: 'Call center visitor' })

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
  const visibleConversations = showAllHistory
    ? formattedConversations
    : formattedConversations.slice(0, SIDEBAR_VISIBLE_ITEMS)

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <aside
        className={`border-b lg:border-b-0 lg:border-r border-white/50 dark:border-gray-700/50 bg-white/35 dark:bg-gray-900/35 backdrop-blur-sm flex-shrink-0 transition-all duration-200 ${
          isHistoryMinimized ? 'w-full lg:w-[88px]' : 'w-full lg:w-72 lg:min-w-72'
        }`}
      >
        <div className="h-full px-2 py-3 sm:px-3 sm:py-4 flex flex-col gap-3">
          <div className={`flex items-center ${isHistoryMinimized ? 'justify-between lg:flex-col' : ''} gap-2`}>
            <button
              onClick={() => setIsHistoryMinimized(value => !value)}
              className="btn-ghost inline-flex items-center justify-center gap-2"
              title={isHistoryMinimized ? t('maximizePanel', { defaultValue: 'Maximize' }) : t('minimizePanel', { defaultValue: 'Minimal' })}
            >
              {isHistoryMinimized ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              {!isHistoryMinimized && <span className="hidden sm:inline">{t('minimizePanel', { defaultValue: 'Minimal' })}</span>}
            </button>

            <button
              onClick={handleStartNewChat}
              disabled={isLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-3 text-sm font-semibold transition-colors ${
                isHistoryMinimized ? 'w-auto lg:w-full px-4 lg:px-0' : 'flex-1'
              }`}
              title={t('newChat')}
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span className={isHistoryMinimized ? 'lg:hidden' : ''}>{t('newChat')}</span>
            </button>
          </div>

          {!isHistoryMinimized && (
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 px-1">
              <History className="w-3.5 h-3.5" />
              {t('chatHistory')}
            </div>
          )}

          {!isHistoryMinimized && (
            <div className="min-h-0 flex-1 flex flex-col">
              <div className="flex-1 gap-2 overflow-x-auto lg:flex lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden pb-1">
              {formattedConversations.length === 0 ? (
                <div className="glass-card p-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  {t('historyEmpty')}
                </div>
              ) : (
                visibleConversations.map(conversation => (
                  <div
                    key={conversation.id}
                    className={`min-w-[220px] sm:min-w-[260px] lg:min-w-0 rounded-2xl transition-all border ${
                      currentConversationId === conversation.id
                        ? 'bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-100'
                        : 'bg-white/60 border-white/50 text-gray-700 hover:bg-white dark:bg-gray-900/50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900'
                    }`}
                  >
                    <div className="flex items-start gap-2 p-3">
                      <button
                        onClick={() => handleSelectConversation(conversation.id)}
                        disabled={isLoading}
                        title={conversation.title}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold leading-5 truncate">{conversation.title}</p>
                          <span className="text-[10px] uppercase tracking-wide opacity-60 flex-shrink-0">
                            {conversation.shortDate}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 opacity-75 truncate">{conversation.preview}</p>
                      </button>
                      <button
                        onClick={() => handleDeleteConversation(conversation.id)}
                        disabled={isLoading}
                        title={t('deleteChat', { defaultValue: 'Delete chat' })}
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
              </div>

              {formattedConversations.length > SIDEBAR_VISIBLE_ITEMS && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowAllHistory(value => !value)}
                    className="btn-ghost w-full px-3 py-2 text-xs font-semibold"
                  >
                    {showAllHistory
                      ? t('showLess', { defaultValue: 'Show less' })
                      : t('showMore', { defaultValue: 'Show more' })}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={`mt-auto space-y-2 pt-2 ${isHistoryMinimized ? 'flex flex-col items-center' : ''}`}>
            {onOpenWellness && (
              <button
                onClick={onOpenWellness}
                className={`w-full rounded-2xl border border-cyan-200/80 bg-cyan-50/80 px-3 py-3 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-100/70 dark:border-cyan-900/60 dark:bg-cyan-500/10 dark:hover:border-cyan-700 dark:hover:bg-cyan-500/15 ${
                  isHistoryMinimized ? 'lg:w-auto lg:px-3' : ''
                }`}
                title={t('mentalWellnessNav', { defaultValue: 'Mental wellness support' })}
              >
                <span className="flex w-full items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-600 dark:text-cyan-300" />
                  <span className={`min-w-0 flex-1 ${isHistoryMinimized ? 'lg:hidden' : ''}`}>
                    <span className="block break-words text-sm font-semibold leading-5 text-cyan-900 dark:text-cyan-100">
                      {t('mentalWellnessNav', { defaultValue: 'Mental wellness support' })}
                    </span>
                    <span className="mt-0.5 block break-words text-xs leading-5 text-cyan-700/80 dark:text-cyan-200/80">
                      {t('mentalWellnessHint', { defaultValue: 'Calming help and grounding steps' })}
                    </span>
                  </span>
                </span>
              </button>
            )}

            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className={`w-full rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-brand-700 dark:hover:bg-brand-900/20 ${
                  isHistoryMinimized ? 'lg:w-auto lg:px-3' : ''
                }`}
                title={userLabel || t('userProfile', { defaultValue: 'User profile' })}
              >
                <span className="flex w-full items-start gap-2">
                  <UserCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
                  <span className={`min-w-0 flex-1 ${isHistoryMinimized ? 'lg:hidden' : ''}`}>
                    <span className="block break-words text-sm font-semibold leading-5 text-slate-900 dark:text-white">
                      {t('userProfile', { defaultValue: 'User profile' })}
                    </span>
                    <span className="mt-0.5 block break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {userLabel || t('loginTitle', { defaultValue: 'Log in' })}
                    </span>
                  </span>
                </span>
              </button>
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
        ) : consultationState && !consultationState.demoMode ? (
          <ConsultationPanel
            actorType="user"
            actorId={userId ?? 0}
            doctor={{
              id: consultationState.target.id,
              name: consultationState.target.name,
              specialty: consultationState.target.specialty,
            }}
            initialConsultationId={consultationState.consultationId}
            variant="page"
            storageMode="local"
            onClose={() => setConsultationState(null)}
          />
        ) : consultationState ? (
          <ConsultationPanel
            actorType="user"
            actorId={0}
            doctor={{
              id: consultationState.target.id,
              name: consultationState.target.name,
              specialty: consultationState.target.specialty,
            }}
            initialConsultationId={consultationState.consultationId}
            variant="page"
              demoSession={{
                doctorName: consultationState.target.name,
                doctorSpecialty: consultationState.target.specialty,
                patientLabel: consultationState.patientLabel ?? t('demoPatientLabel', { defaultValue: 'Demo patient' }),
              }}
            onClose={() => setConsultationState(null)}
          />
        ) : (
          <>
            <div ref={messagesContainerRef} className="relative flex-1 overflow-y-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
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
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
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
                          className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-2 text-xs sm:w-auto sm:text-sm"
                        >
                          <Crown className="w-4 h-4" />
                          {t('upgradePremium')}
                        </button>
                      </div>
                    </div>
                  )}

                  {onOpenWellness && (
                    <div className="glass-card max-w-xl w-full p-4 sm:p-5 mb-6 text-left border-cyan-200/80 dark:border-cyan-900/50">
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {t('mentalWellnessCardTitle', { defaultValue: 'Need emotional support too?' })}
                          </p>
                          <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-6">
                            {t('mentalWellnessCardText', { defaultValue: 'Open the mental wellness page for calming exercises, low-pressure support, and a simple recovery plan.' })}
                          </p>
                        </div>
                        <button
                          onClick={onOpenWellness}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 sm:w-auto sm:text-sm"
                        >
                          <Sparkles className="w-4 h-4" />
                          {t('mentalWellnessOpen', { defaultValue: 'Open support' })}
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
                  language={language}
                  isPremium={isPremium}
                  onOpenPremium={onOpenPremium}
                  onStartDoctorChat={openDoctorConsultation}
                  onViewDoctorProfile={onViewDoctorProfile}
                  onStartFacilityChat={openFacilityCallCenter}
                  reservationUserKey={reservationUserKey}
                  reservationUserLabel={reservationUserLabel}
                />
              ))}

              {showScrollToBottom && (
                <button
                  onClick={scrollToBottom}
                  className="sticky bottom-4 ml-auto mr-2 sm:mr-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-500/30 transition-colors hover:bg-brand-700"
                  aria-label={t('scrollToLatest', { defaultValue: 'Go to latest message' })}
                  title={t('scrollToLatest', { defaultValue: 'Go to latest message' })}
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="px-3 sm:px-4 pb-1">
              <p className="text-center text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                {t('disclaimer')}
              </p>
            </div>

            <div className="px-2 sm:px-4 pb-3 sm:pb-4 pt-2">
              <div className="chat-composer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                      {t('smartComposer', { defaultValue: 'Smart symptom input' })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t('smartComposerHint', { defaultValue: 'Describe symptoms, attach reports, and send everything in one message.' })}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('aiAssistLabel', { defaultValue: 'AI-assisted' })}
                  </div>
                </div>

                {selectedAttachments.length > 0 && (
                  <div className="mt-3">
                    <AttachmentList attachments={selectedAttachments} />
                    <button
                      onClick={() => setSelectedAttachments([])}
                      className="btn-ghost mt-2 px-3 py-1.5 text-xs"
                    >
                      {t('clearAttachments', { defaultValue: 'Clear attachments' })}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    id="chat-input"
                    className="input-field flex-1 min-h-[52px] sm:min-h-[58px] max-h-[120px] sm:max-h-[160px] text-[13px] sm:text-sm border-0 bg-transparent focus:ring-0 py-3 sm:py-3.5 px-0 shadow-none"
                    placeholder={t('placeholder')}
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={isLoading || mapState === 'loading'}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleAttachmentUpload}
                    multiple
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="composer-icon-button"
                    aria-label={t('uploadFile', { defaultValue: 'Upload a file' })}
                    title={t('uploadFile', { defaultValue: 'Upload a file' })}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  {isPremium && (
                    <button
                      id="map-button"
                      onClick={openPremiumHospitalsMap}
                      disabled={mapState === 'loading'}
                      className="composer-icon-button"
                      aria-label={t('premiumMapOpen')}
                      title={mapState === 'loading' ? t('findingNearestHospital') : t('premiumMapOpen')}
                    >
                      <MapPin className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    id="send-button"
                    onClick={() => sendMessage(input)}
                    disabled={(!input.trim() && selectedAttachments.length === 0) || isLoading}
                    className="btn-primary flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center p-0 rounded-2xl"
                    aria-label={t('send')}
                    title={t('send')}
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ChatBox
