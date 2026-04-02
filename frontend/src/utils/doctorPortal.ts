export interface PortalDoctorSummary {
  id: number
  name: string
  specialty: string
}

export interface LocalConsultationMessage {
  id: number
  sender_type: 'user' | 'doctor'
  sender_id: number
  content: string
  created_at: string
}

export interface LocalConsultationRecord {
  id: number
  user_id: number
  doctor_id: number
  doctor_name: string
  doctor_specialty: string
  patient_email: string
  patient_label: string
  patient_key: string
  status: string
  created_at: string
  updated_at: string
  messages: LocalConsultationMessage[]
  source: 'local'
}

export interface DoctorReservationEntry {
  reserverKey: string
  patientLabel: string
  reservedAt: number
}

export interface DoctorQueueSlot extends DoctorReservationEntry {
  queueNumber: number
  startsAt: string
  endsAt: string
}

type DoctorReservations = Record<string, DoctorReservationEntry[]>

const LOCAL_CONSULTATIONS_KEY = 'mydoctor-local-consultations'
const DOCTOR_RESERVATIONS_KEY = 'mydoctor-doctor-reservations'

export const CONSULTATION_SLOT_MINUTES = 30

const toIsoString = (value: number) => new Date(value).toISOString()

const roundUpToNextHalfHour = (timestamp: number) => {
  const date = new Date(timestamp)
  date.setSeconds(0, 0)

  const minutes = date.getMinutes()
  if (minutes === 0 || minutes === 30) {
    return date.getTime()
  }

  if (minutes < 30) {
    date.setMinutes(30, 0, 0)
    return date.getTime()
  }

  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date.getTime()
}

export const loadLocalConsultations = (): LocalConsultationRecord[] => {
  try {
    const raw = localStorage.getItem(LOCAL_CONSULTATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveLocalConsultations = (consultations: LocalConsultationRecord[]) => {
  localStorage.setItem(LOCAL_CONSULTATIONS_KEY, JSON.stringify(consultations))
}

export const ensureLocalConsultation = ({
  doctor,
  userId,
  patientKey,
  patientLabel,
}: {
  doctor: PortalDoctorSummary
  userId: number
  patientKey: string
  patientLabel: string
}) => {
  const consultations = loadLocalConsultations()
  const existing = consultations.find(
    consultation =>
      consultation.doctor_id === doctor.id &&
      consultation.patient_key === patientKey &&
      consultation.status === 'open'
  )

  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  const created: LocalConsultationRecord = {
    id: Date.now(),
    user_id: userId,
    doctor_id: doctor.id,
    doctor_name: doctor.name,
    doctor_specialty: doctor.specialty,
    patient_email: patientLabel,
    patient_label: patientLabel,
    patient_key: patientKey,
    status: 'open',
    created_at: now,
    updated_at: now,
    messages: [],
    source: 'local',
  }

  saveLocalConsultations([created, ...consultations])
  return created
}

export const getLocalConsultation = (consultationId: number) =>
  loadLocalConsultations().find(consultation => consultation.id === consultationId) ?? null

export const listDoctorLocalConsultations = (doctorId: number) =>
  loadLocalConsultations()
    .filter(consultation => consultation.doctor_id === doctorId)
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))

export const appendLocalConsultationMessage = ({
  consultationId,
  actorType,
  actorId,
  content,
}: {
  consultationId: number
  actorType: 'user' | 'doctor'
  actorId: number
  content: string
}) => {
  const trimmed = content.trim()
  if (!trimmed) {
    return getLocalConsultation(consultationId)
  }

  const now = new Date().toISOString()
  let updatedConsultation: LocalConsultationRecord | null = null

  const consultations = loadLocalConsultations().map(consultation => {
    if (consultation.id !== consultationId) {
      return consultation
    }

    updatedConsultation = {
      ...consultation,
      updated_at: now,
      messages: consultation.messages.concat({
        id: Date.now(),
        sender_type: actorType,
        sender_id: actorId,
        content: trimmed,
        created_at: now,
      }),
    }

    return updatedConsultation
  })

  if (updatedConsultation) {
    saveLocalConsultations(
      consultations.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    )
  }

  return updatedConsultation
}

export const countDoctorPendingRequests = (doctorId: number) =>
  listDoctorLocalConsultations(doctorId).filter(consultation => {
    const lastMessage = consultation.messages[consultation.messages.length - 1]
    return !lastMessage || lastMessage.sender_type === 'user'
  }).length

export const loadDoctorReservations = (): DoctorReservations => {
  try {
    const raw = localStorage.getItem(DOCTOR_RESERVATIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveDoctorReservations = (reservations: DoctorReservations) => {
  localStorage.setItem(DOCTOR_RESERVATIONS_KEY, JSON.stringify(reservations))
}

export const ensureDoctorReservation = ({
  doctorId,
  reserverKey,
  patientLabel,
}: {
  doctorId: number
  reserverKey: string
  patientLabel: string
}) => {
  const reservations = loadDoctorReservations()
  const doctorKey = String(doctorId)
  const doctorQueue = reservations[doctorKey] || []
  const existingIndex = doctorQueue.findIndex(item => item.reserverKey === reserverKey)

  if (existingIndex >= 0) {
    return {
      queueNumber: existingIndex + 1,
      entry: doctorQueue[existingIndex],
    }
  }

  const nextEntry: DoctorReservationEntry = {
    reserverKey,
    patientLabel,
    reservedAt: Date.now(),
  }
  const nextQueue = doctorQueue.concat(nextEntry)
  reservations[doctorKey] = nextQueue
  saveDoctorReservations(reservations)

  return {
    queueNumber: nextQueue.length,
    entry: nextEntry,
  }
}

export const getDoctorQueueSlots = (doctorId: number): DoctorQueueSlot[] => {
  const queue = loadDoctorReservations()[String(doctorId)] || []
  if (queue.length === 0) {
    return []
  }

  const firstSlotStart = roundUpToNextHalfHour(queue[0].reservedAt)

  return queue.map((entry, index) => {
    const startsAtTime = firstSlotStart + index * CONSULTATION_SLOT_MINUTES * 60 * 1000
    const endsAtTime = startsAtTime + CONSULTATION_SLOT_MINUTES * 60 * 1000

    return {
      ...entry,
      queueNumber: index + 1,
      startsAt: toIsoString(startsAtTime),
      endsAt: toIsoString(endsAtTime),
    }
  })
}
