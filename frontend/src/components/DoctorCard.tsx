import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck2, ExternalLink, MapPin, MessageCircle, Navigation, Star } from 'lucide-react'
import { ensureDoctorReservation, loadDoctorReservations } from '../utils/doctorPortal'

interface Doctor {
  id: number
  name: string
  specialty: string
  rating: number
  location: string
  distance: number
  consultation_fee?: number
}

interface DoctorCardProps {
  doctor: Doctor
  index: number
  onStartChat?: (doctor: Doctor) => void
  onViewProfile?: (doctor: Doctor) => void
  reservationUserKey?: string
  reservationUserLabel?: string
}

const specialtyIcons: Record<string, string> = {
  cardiologist: '❤',
  neurologist: 'N',
  dermatologist: 'D',
  pediatrician: 'P',
  psychiatrist: 'S',
  orthopedist: 'O',
  'general practitioner': 'G',
}

const specialtyColors: Record<string, string> = {
  cardiologist: 'from-red-500 to-rose-500',
  neurologist: 'from-purple-500 to-indigo-500',
  dermatologist: 'from-amber-500 to-orange-500',
  pediatrician: 'from-blue-400 to-cyan-500',
  psychiatrist: 'from-teal-500 to-emerald-500',
  orthopedist: 'from-slate-500 to-gray-600',
  'general practitioner': 'from-brand-500 to-brand-600',
}

const getSpecialtyKey = (specialty: string) => specialty.toLowerCase()

const DoctorCard: React.FC<DoctorCardProps> = ({
  doctor,
  index,
  onStartChat,
  onViewProfile,
  reservationUserKey = 'guest',
  reservationUserLabel = 'Guest patient',
}) => {
  const { t } = useTranslation()
  const key = getSpecialtyKey(doctor.specialty)
  const icon = specialtyIcons[key] || 'DR'
  const gradient = specialtyColors[key] || 'from-brand-500 to-brand-600'
  const [queueNumber, setQueueNumber] = useState<number | null>(null)

  useEffect(() => {
    const reservations = loadDoctorReservations()
    const doctorQueue = reservations[String(doctor.id)] || []
    const existingIndex = doctorQueue.findIndex(item => item.reserverKey === reservationUserKey)
    setQueueNumber(existingIndex >= 0 ? existingIndex + 1 : null)
  }, [doctor.id, reservationUserKey])

  const description = useMemo(
    () =>
      t('doctorCardDescription', {
        specialty: doctor.specialty,
        rating: doctor.rating.toFixed(1),
        location: doctor.location,
        distance: doctor.distance.toFixed(1),
        defaultValue:
          '{{specialty}} available near {{location}} with a {{rating}} rating and an estimated {{distance}} km reach.',
      }),
    [doctor.distance, doctor.location, doctor.rating, doctor.specialty, t]
  )

  const handleReserve = () => {
    const result = ensureDoctorReservation({
      doctorId: doctor.id,
      reserverKey: reservationUserKey,
      patientLabel: reservationUserLabel,
    })
    setQueueNumber(result.queueNumber)
  }

  return (
    <div
      className="animate-fade-in glass-card p-3 sm:p-4 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
        <div
          className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-sm sm:text-base font-bold text-white shadow-lg`}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white text-[13px] sm:text-sm truncate leading-tight">
            {doctor.name}
          </h4>
          <p className="text-[10px] sm:text-xs text-brand-600 dark:text-brand-400 font-medium capitalize mt-0.5 sm:mt-0">
            {doctor.specialty}
          </p>
          <p className="mt-1.5 text-[10px] sm:text-xs leading-5 text-gray-600 dark:text-gray-300">
            {description}
          </p>

          {doctor.consultation_fee && (
            <p className="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-500 font-semibold mt-1">
              {new Intl.NumberFormat('uz-UZ').format(doctor.consultation_fee)} UZS
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:mt-2">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300">
                {doctor.rating.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Navigation className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                {doctor.distance.toFixed(1)} {t('km')}
              </span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1 sm:mt-1.5">
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 break-words">
              {doctor.location}
            </span>
          </div>

          {queueNumber && (
            <div className="mt-2 max-w-full rounded-2xl bg-emerald-50 px-2.5 py-2 text-[10px] sm:text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <div className="inline-flex items-center gap-1.5">
                <CalendarCheck2 className="w-3 h-3" />
                <span className="break-words">
                  {t('queueNumber', { number: queueNumber, defaultValue: 'Queue number: {{number}}' })}
                </span>
              </div>
              <p className="mt-1 break-words text-[10px] font-medium text-emerald-800/90 dark:text-emerald-200">
                {t('reservedByLabel', {
                  name: reservationUserLabel,
                  defaultValue: 'Reserved by: {{name}}',
                })}
              </p>
            </div>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-shrink-0 sm:flex-col">
          <button
            className={`flex w-full items-center justify-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-2 rounded-lg transition-colors sm:w-auto ${
              queueNumber
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            onClick={handleReserve}
          >
            <CalendarCheck2 className="w-3 h-3 hidden sm:block" />
            {queueNumber ? t('reserved', { defaultValue: 'Reserved' }) : t('reserveNow', { defaultValue: 'Reserve' })}
          </button>

          {onStartChat && (
            <button
              className="flex w-full items-center justify-center gap-1 sm:gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-2 rounded-lg transition-colors sm:w-auto"
              onClick={() => onStartChat(doctor)}
            >
              <MessageCircle className="w-3 h-3 hidden sm:block" />
              {t('doctorChat')}
            </button>
          )}

          <button
            className="flex w-full items-center justify-center gap-1 sm:gap-1.5 bg-brand-50 dark:bg-brand-900/40 hover:bg-brand-100 dark:hover:bg-brand-900/70 text-brand-700 dark:text-brand-300 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-2 rounded-lg transition-colors sm:w-auto"
            onClick={() => onViewProfile?.(doctor)}
          >
            <ExternalLink className="w-3 h-3 hidden sm:block" />
            {t('viewDoctor')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DoctorCard
