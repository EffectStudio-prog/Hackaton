import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, MessageCircle, Send, Stethoscope, X } from 'lucide-react'

import { apiFetch } from '../utils/api'

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

interface ConsultationPanelProps {
  actorType: 'user' | 'doctor'
  actorId: number
  doctor?: DoctorSummary
  initialConsultationId?: number | null
  onClose: () => void
}

const ConsultationPanel: React.FC<ConsultationPanelProps> = ({
  actorType,
  actorId,
  doctor,
  initialConsultationId = null,
  onClose,
}) => {
  const { t } = useTranslation()
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [selectedConsultationId, setSelectedConsultationId] = useState<number | null>(initialConsultationId)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const fetchConsultation = useCallback(async (consultationId: number) => {
    const response = await apiFetch(`/consultations/${consultationId}?actor_type=${actorType}&actor_id=${actorId}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.detail ?? t('consultationLoadError'))
    }
    return data as Consultation
  }, [actorId, actorType, t])

  const loadDoctorConsultations = useCallback(async () => {
    const response = await apiFetch(`/doctor-consultations?doctor_id=${actorId}`)
    const data = await response.json().catch(() => ([]))
    if (!response.ok) {
      throw new Error(t('consultationLoadError'))
    }
    setConsultations(Array.isArray(data) ? data : [])
    if (!selectedConsultationId && Array.isArray(data) && data[0]?.id) {
      setSelectedConsultationId(data[0].id)
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

  useEffect(() => {
    const load = async () => {
      setError('')
      try {
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
  }, [actorType, loadDoctorConsultations, loadUserConsultation, t])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (actorType === 'doctor') {
        void loadDoctorConsultations().catch(() => {})
        return
      }
      void loadUserConsultation().catch(() => {})
    }, 4000)

    return () => window.clearInterval(interval)
  }, [actorType, loadDoctorConsultations, loadUserConsultation])

  const selectedConsultation = useMemo(
    () => consultations.find(item => item.id === selectedConsultationId) ?? null,
    [consultations, selectedConsultationId]
  )

  const handleSend = async () => {
    if (!selectedConsultationId || !message.trim() || isBusy) return

    setIsBusy(true)
    setError('')

    try {
      const response = await apiFetch(`/consultations/${selectedConsultationId}/messages`, {
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

  return (
    <div className="fixed inset-0 z-[90] bg-gray-950/45 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="glass-card w-full max-w-6xl h-[85vh] overflow-hidden flex">
        {actorType === 'doctor' && (
          <aside className="w-72 border-r border-white/50 dark:border-gray-700/50 bg-white/35 dark:bg-gray-900/30 hidden md:flex flex-col">
            <div className="p-4 border-b border-white/50 dark:border-gray-700/50">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('doctorConsultations')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {consultations.length === 0 ? (
                <div className="rounded-2xl bg-white/70 dark:bg-gray-900/60 p-3 text-xs leading-6 text-gray-500 dark:text-gray-400">
                  {t('doctorConsultationsEmpty')}
                </div>
              ) : (
                consultations.map(consultation => (
                  <button
                    key={consultation.id}
                    onClick={() => setSelectedConsultationId(consultation.id)}
                    className={`w-full text-left rounded-2xl p-3 border transition-colors ${
                      selectedConsultationId === consultation.id
                        ? 'bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-100'
                        : 'bg-white/70 dark:bg-gray-900/60 border-white/60 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">{consultation.patient_email}</p>
                    <p className="mt-1 text-xs opacity-75 truncate">
                      {consultation.messages[consultation.messages.length - 1]?.content || t('consultationReady')}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-4 border-b border-white/50 dark:border-gray-700/50 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                {actorType === 'doctor' ? t('doctorPortalTitle') : t('doctorConsultationTitle')}
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                {actorType === 'doctor'
                  ? selectedConsultation?.patient_email || t('doctorConsultations')
                  : doctor?.name || selectedConsultation?.doctor_name || t('doctorConsultationTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {actorType === 'doctor'
                  ? selectedConsultation?.doctor_specialty || t('consultationReady')
                  : doctor?.specialty || selectedConsultation?.doctor_specialty || t('consultationReady')}
              </p>
            </div>
            <button onClick={onClose} className="btn-ghost p-2" aria-label={t('close')}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="px-4 pt-3">
              <div className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs leading-6 text-red-700 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            </div>
          )}

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
        </div>
      </div>
    </div>
  )
}

export default ConsultationPanel
