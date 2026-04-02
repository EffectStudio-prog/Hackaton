import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CalendarClock, LoaderCircle, MessageCircle, MessagesSquare, Send, Stethoscope, X } from 'lucide-react'

import {
  appendLocalConsultationMessage,
  getDoctorQueueSlots,
  getLocalConsultation,
  listDoctorLocalConsultations,
  type DoctorQueueSlot,
} from '../utils/doctorPortal'

interface ConsultationMessage {
  id: number
  sender_type: 'user' | 'doctor'
  sender_id: number
  content: string
  created_at: string
}

interface Consultation {
  id: number
  user_id: number
  doctor_id: number
  doctor_name: string
  doctor_specialty: string
  patient_email: string
  patient_label?: string
  status: string
  created_at: string
  updated_at: string
  messages: ConsultationMessage[]
}

interface DoctorSummary {
  id: number
  name: string
  specialty: string
}

interface DemoSession {
  doctorName: string
  doctorSpecialty: string
  patientLabel: string
}

interface ConsultationPanelProps {
  actorType: 'user' | 'doctor'
  actorId: number
  doctor?: DoctorSummary
  initialConsultationId?: number | null
  onClose: () => void
  variant?: 'modal' | 'page'
  demoSession?: DemoSession | null
  storageMode?: 'local' | 'remote'
}

const ConsultationPanel: React.FC<ConsultationPanelProps> = ({
  actorType,
  actorId,
  doctor,
  initialConsultationId = null,
  onClose,
  variant = 'modal',
  demoSession = null,
  storageMode = 'remote',
}) => {
  const { t } = useTranslation()
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [queueSlots, setQueueSlots] = useState<DoctorQueueSlot[]>([])
  const [selectedConsultationId, setSelectedConsultationId] = useState<number | null>(initialConsultationId)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [doctorView, setDoctorView] = useState<'consultations' | 'queue'>('consultations')
  const isDemo = !!demoSession
  const isLocal = storageMode === 'local' && !isDemo

  const fetchConsultation = useCallback(async (consultationId: number) => {
    const response = await fetch(`/consultations/${consultationId}?actor_type=${actorType}&actor_id=${actorId}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.detail ?? t('consultationLoadError'))
    }
    return data as Consultation
  }, [actorId, actorType, t])

  const loadDoctorConsultations = useCallback(async () => {
    const response = await fetch(`/doctor-consultations?doctor_id=${actorId}`)
    const data = await response.json().catch(() => ([]))
    if (!response.ok) {
      throw new Error(t('consultationLoadError'))
    }
    const nextConsultations = Array.isArray(data) ? data : []
    setConsultations(nextConsultations)
    if (!selectedConsultationId && nextConsultations[0]?.id) {
      setSelectedConsultationId(nextConsultations[0].id)
    }
  }, [actorId, selectedConsultationId, t])

  const loadUserConsultation = useCallback(async () => {
    if (!selectedConsultationId) return
    const consultation = await fetchConsultation(selectedConsultationId)
    setConsultations(previous => {
      const others = previous.filter(item => item.id !== consultation.id)
      return [consultation, ...others]
    })
  }, [fetchConsultation, selectedConsultationId])

  const loadLocalDoctorData = useCallback(() => {
    const nextConsultations = listDoctorLocalConsultations(actorId)
    setConsultations(nextConsultations)
    setQueueSlots(getDoctorQueueSlots(actorId))
    if (!selectedConsultationId && nextConsultations[0]?.id) {
      setSelectedConsultationId(nextConsultations[0].id)
    }
  }, [actorId, selectedConsultationId])

  const loadLocalUserConsultation = useCallback(() => {
    if (!selectedConsultationId) return
    const consultation = getLocalConsultation(selectedConsultationId)
    if (!consultation) return
    setConsultations(previous => {
      const others = previous.filter(item => item.id !== consultation.id)
      return [consultation, ...others]
    })
  }, [selectedConsultationId])

  useEffect(() => {
    if (isDemo) {
      const now = new Date().toISOString()
      setConsultations([
        {
          id: initialConsultationId ?? 1,
          user_id: actorId,
          doctor_id: doctor?.id ?? 0,
          doctor_name: demoSession?.doctorName ?? doctor?.name ?? t('doctorConsultationTitle'),
          doctor_specialty: demoSession?.doctorSpecialty ?? doctor?.specialty ?? t('consultationReady'),
          patient_email: demoSession?.patientLabel ?? 'demo@patient.local',
          patient_label: demoSession?.patientLabel ?? 'Demo patient',
          status: 'open',
          created_at: now,
          updated_at: now,
          messages: [
            {
              id: 1,
              sender_type: 'doctor',
              sender_id: doctor?.id ?? 0,
              content: t('demoDoctorGreeting', {
                defaultValue: 'Hello, this is a demo consultation. Tell me what symptom is bothering you the most right now.',
              }),
              created_at: now,
            },
            {
              id: 2,
              sender_type: 'user',
              sender_id: actorId,
              content: t('demoUserMessage', {
                defaultValue: 'I have had a headache since morning and I would like some guidance before booking.',
              }),
              created_at: now,
            },
            {
              id: 3,
              sender_type: 'doctor',
              sender_id: doctor?.id ?? 0,
              content: t('demoDoctorReply', {
                defaultValue: 'For this demo, please rest, drink water, and arrange an in-person visit if symptoms get worse or new symptoms appear.',
              }),
              created_at: now,
            },
          ],
        },
      ])
      setSelectedConsultationId(initialConsultationId ?? 1)
      setQueueSlots([])
      setError('')
      return
    }

    const load = async () => {
      setError('')
      try {
        if (isLocal) {
          if (actorType === 'doctor') {
            loadLocalDoctorData()
          } else {
            loadLocalUserConsultation()
          }
          return
        }

        if (actorType === 'doctor') {
          await loadDoctorConsultations()
        } else {
          await loadUserConsultation()
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t('consultationLoadError'))
      }
    }

    void load()
  }, [
    actorId,
    actorType,
    demoSession,
    doctor?.id,
    doctor?.name,
    doctor?.specialty,
    initialConsultationId,
    isDemo,
    isLocal,
    loadDoctorConsultations,
    loadLocalDoctorData,
    loadLocalUserConsultation,
    loadUserConsultation,
    t,
  ])

  useEffect(() => {
    if (isDemo) return

    const interval = window.setInterval(() => {
      if (isLocal) {
        if (actorType === 'doctor') {
          loadLocalDoctorData()
        } else {
          loadLocalUserConsultation()
        }
        return
      }

      if (actorType === 'doctor') {
        void loadDoctorConsultations().catch(() => {})
        return
      }
      void loadUserConsultation().catch(() => {})
    }, isLocal ? 2000 : 4000)

    return () => window.clearInterval(interval)
  }, [actorType, isDemo, isLocal, loadDoctorConsultations, loadLocalDoctorData, loadLocalUserConsultation, loadUserConsultation])

  const selectedConsultation = useMemo(
    () => consultations.find(item => item.id === selectedConsultationId) ?? null,
    [consultations, selectedConsultationId]
  )

  const pendingRequestCount = useMemo(
    () =>
      consultations.filter(consultation => {
        const lastMessage = consultation.messages[consultation.messages.length - 1]
        return !lastMessage || lastMessage.sender_type === 'user'
      }).length,
    [consultations]
  )

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  )

  const handleSend = async () => {
    if (!selectedConsultationId || !message.trim() || isBusy) return

    if (isDemo) {
      const userMessage = message.trim()
      const sentAt = new Date().toISOString()
      const selectedId = selectedConsultationId

      setConsultations(previous =>
        previous.map(consultation =>
          consultation.id !== selectedId
            ? consultation
            : {
                ...consultation,
                updated_at: sentAt,
                messages: [
                  ...consultation.messages,
                  {
                    id: Date.now(),
                    sender_type: actorType,
                    sender_id: actorId,
                    content: userMessage,
                    created_at: sentAt,
                  },
                  {
                    id: Date.now() + 1,
                    sender_type: actorType === 'user' ? 'doctor' : 'user',
                    sender_id: actorType === 'user' ? doctor?.id ?? 0 : actorId,
                    content: t('demoDoctorFollowUp', {
                      doctor: demoSession?.doctorName ?? doctor?.name ?? t('recommendedDoctor'),
                      defaultValue:
                        '{{doctor}}: Thanks, I noted that for the demo. Please monitor the symptom and book an in-person visit if it continues.',
                    }),
                    created_at: sentAt,
                  },
                ],
              }
        )
      )
      setMessage('')
      return
    }

    if (isLocal) {
      const consultation = appendLocalConsultationMessage({
        consultationId: selectedConsultationId,
        actorType,
        actorId,
        content: message,
      })
      if (consultation) {
        setConsultations(previous => {
          const others = previous.filter(item => item.id !== consultation.id)
          return [consultation, ...others]
        })
        if (actorType === 'doctor') {
          setQueueSlots(getDoctorQueueSlots(actorId))
        }
      }
      setMessage('')
      return
    }

    setIsBusy(true)
    setError('')

    try {
      const response = await fetch(`/consultations/${selectedConsultationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_type: actorType,
          actor_id: actorId,
          content: message,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.detail ?? t('consultationSendError'))
      }

      const consultation = data as Consultation
      setConsultations(previous => {
        const others = previous.filter(item => item.id !== consultation.id)
        return [consultation, ...others]
      })
      setSelectedConsultationId(consultation.id)
      setMessage('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('consultationSendError'))
    } finally {
      setIsBusy(false)
    }
  }

  const isPage = variant === 'page'

  return (
    <div className={isPage ? 'h-full min-h-0 flex flex-col' : 'fixed inset-0 z-[90] bg-gray-950/45 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5'}>
      <div className={`${isPage ? 'glass-card h-full w-full overflow-hidden flex' : 'glass-card w-full max-w-6xl h-[85vh] overflow-hidden flex'}`}>
        {actorType === 'doctor' && (
          <aside className="w-72 border-r border-white/50 dark:border-gray-700/50 bg-white/35 dark:bg-gray-900/30 hidden md:flex flex-col">
            <div className="p-3 border-b border-white/50 dark:border-gray-700/50 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('doctorPortalTitle')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDoctorView('consultations')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    doctorView === 'consultations'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white/70 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <MessagesSquare className="h-4 w-4" />
                    {t('doctorConsultations')}
                  </span>
                </button>
                <button
                  onClick={() => setDoctorView('queue')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    doctorView === 'queue'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white/70 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    {t('doctorQueuePage', { defaultValue: 'Queue page' })}
                  </span>
                </button>
              </div>
              {pendingRequestCount > 0 && doctorView === 'consultations' && (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  {t('doctorIncomingRequests', {
                    count: pendingRequestCount,
                    defaultValue: '{{count}} incoming requests waiting',
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {doctorView === 'consultations' ? (
                consultations.length === 0 ? (
                  <div className="rounded-2xl bg-white/70 dark:bg-gray-900/60 p-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
                    {t('doctorConsultationsEmpty')}
                  </div>
                ) : (
                  consultations.map(consultation => {
                    const lastMessage = consultation.messages[consultation.messages.length - 1]
                    const hasPendingReply = !lastMessage || lastMessage.sender_type === 'user'
                    return (
                      <button
                        key={consultation.id}
                        onClick={() => {
                          setDoctorView('consultations')
                          setSelectedConsultationId(consultation.id)
                        }}
                        className={`w-full text-left rounded-2xl p-3 border transition-colors ${
                          selectedConsultationId === consultation.id
                            ? 'bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-100'
                            : 'bg-white/70 dark:bg-gray-900/60 border-white/60 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold truncate">
                            {consultation.patient_label || consultation.patient_email}
                          </p>
                          {hasPendingReply && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                              {t('newRequestBadge', { defaultValue: 'New' })}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs opacity-75 truncate">
                          {lastMessage?.content || t('consultationReady')}
                        </p>
                      </button>
                    )
                  })
                )
              ) : queueSlots.length === 0 ? (
                <div className="rounded-2xl bg-white/70 dark:bg-gray-900/60 p-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  {t('doctorQueueEmpty', { defaultValue: 'No reserved patients in the queue yet.' })}
                </div>
              ) : (
                queueSlots.map(slot => (
                  <div
                    key={`${slot.reserverKey}-${slot.queueNumber}`}
                    className="rounded-2xl border border-white/60 bg-white/70 p-3 text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{slot.patientLabel}</p>
                      <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-200">
                        {t('queueNumber', { number: slot.queueNumber })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('consultationSlot', {
                        start: timeFormatter.format(new Date(slot.startsAt)),
                        end: timeFormatter.format(new Date(slot.endsAt)),
                        defaultValue: 'Session: {{start}} - {{end}}',
                      })}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('reservedByLabel', {
                        name: slot.patientLabel,
                        defaultValue: 'Reserved by: {{name}}',
                      })}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      {t('reservedAtLabel', {
                        time: timeFormatter.format(new Date(slot.reservedAt)),
                        defaultValue: 'Reserved at {{time}}',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-4 border-b border-white/50 dark:border-gray-700/50 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                {actorType === 'doctor'
                  ? doctorView === 'queue'
                    ? t('doctorQueuePage', { defaultValue: 'Queue page' })
                    : t('doctorPortalTitle')
                  : t('doctorConsultationTitle')}
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                {actorType === 'doctor'
                  ? doctorView === 'queue'
                    ? t('doctorQueueTitle', { defaultValue: 'Reserved patients' })
                    : selectedConsultation?.patient_label || selectedConsultation?.patient_email || t('doctorConsultations')
                  : doctor?.name || selectedConsultation?.doctor_name || t('doctorConsultationTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {actorType === 'doctor'
                  ? doctorView === 'queue'
                    ? t('doctorQueueSubtitle', {
                        minutes: 30,
                        defaultValue: 'Each consultation session is {{minutes}} minutes.',
                      })
                    : selectedConsultation?.doctor_specialty || t('consultationReady')
                  : doctor?.specialty || selectedConsultation?.doctor_specialty || t('consultationReady')}
              </p>
            </div>
            {isPage && actorType !== 'doctor' ? (
              <button onClick={onClose} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm" aria-label={t('backToChat')}>
                <ArrowLeft className="w-4 h-4" />
                <span>{t('backToChat')}</span>
              </button>
            ) : !isPage ? (
              <button onClick={onClose} className="btn-ghost p-2" aria-label={t('close')}>
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {error && (
            <div className="px-4 pt-3">
              <div className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs leading-6 text-red-700 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            </div>
          )}

          {actorType === 'doctor' && doctorView === 'queue' ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {queueSlots.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center">
                    <CalendarClock className="w-7 h-7" />
                  </div>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-7">
                    {t('doctorQueueEmpty', { defaultValue: 'No reserved patients in the queue yet.' })}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {queueSlots.map(slot => (
                    <div
                      key={`${slot.reserverKey}-page-${slot.queueNumber}`}
                      className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {slot.patientLabel}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('queueNumber', { number: slot.queueNumber })}
                          </p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/20 dark:text-brand-200">
                          <CalendarClock className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <p>
                          {t('reservedByLabel', {
                            name: slot.patientLabel,
                            defaultValue: 'Reserved by: {{name}}',
                          })}
                        </p>
                        <p>
                          {t('consultationSlot', {
                            start: timeFormatter.format(new Date(slot.startsAt)),
                            end: timeFormatter.format(new Date(slot.endsAt)),
                            defaultValue: 'Session: {{start}} - {{end}}',
                          })}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('reservedAtLabel', {
                            time: timeFormatter.format(new Date(slot.reservedAt)),
                            defaultValue: 'Reserved at {{time}}',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {!selectedConsultation ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center">
                      {actorType === 'doctor' ? <Stethoscope className="w-7 h-7" /> : <MessageCircle className="w-7 h-7" />}
                    </div>
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-7">
                      {actorType === 'doctor' ? t('doctorConsultationsEmpty') : t('consultationStartHint')}
                    </p>
                  </div>
                ) : (
                  selectedConsultation.messages.map(item => {
                    const isOwn = item.sender_type === actorType
                    return (
                      <div key={item.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          isOwn
                            ? 'bg-brand-600 text-white rounded-br-sm'
                            : 'bg-white/80 dark:bg-gray-900/70 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                        }`}>
                          {item.content}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="p-4 border-t border-white/50 dark:border-gray-700/50">
                <div className="glass-card p-2 flex items-end gap-2">
                  <textarea
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    placeholder={t('consultationPlaceholder')}
                    className="input-field flex-1 border-0 bg-transparent focus:ring-0 min-h-[52px] max-h-[140px]"
                    rows={1}
                    disabled={!selectedConsultation || isBusy}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!selectedConsultation || !message.trim() || isBusy}
                    className="btn-primary w-11 h-11 p-0 flex items-center justify-center"
                    aria-label={t('send')}
                  >
                    {isBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConsultationPanel
