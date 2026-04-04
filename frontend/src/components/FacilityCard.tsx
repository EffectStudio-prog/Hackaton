import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, CalendarCheck2, ExternalLink, Headset, MapPin, Navigation, Star } from 'lucide-react'

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

interface FacilityCardProps {
  facility: Facility
  index: number
  reservationUserKey?: string
  onOpenCallCenter?: (facility: Facility) => void
}

type FacilityReservations = Record<string, Array<{ reserverKey: string; reservedAt: number }>>

const FACILITY_RESERVATIONS_KEY = 'mydoctor-facility-reservations'

const loadReservations = (): FacilityReservations => {
  try {
    const raw = localStorage.getItem(FACILITY_RESERVATIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveReservations = (value: FacilityReservations) => {
  localStorage.setItem(FACILITY_RESERVATIONS_KEY, JSON.stringify(value))
}

const FacilityCard: React.FC<FacilityCardProps> = ({
  facility,
  index,
  reservationUserKey = 'guest',
  onOpenCallCenter,
}) => {
  const { t } = useTranslation()
  const [queueNumber, setQueueNumber] = useState<number | null>(null)

  useEffect(() => {
    const reservations = loadReservations()
    const queue = reservations[`${facility.facility_type}-${facility.id}`] || []
    const existingIndex = queue.findIndex(item => item.reserverKey === reservationUserKey)
    setQueueNumber(existingIndex >= 0 ? existingIndex + 1 : null)
  }, [facility.facility_type, facility.id, reservationUserKey])

  const description = useMemo(
    () =>
      facility.description ||
      t('facilityCardDescription', {
        type: facility.facility_type === 'hospital' ? t('hospitalLabel') : t('clinicLabel'),
        specialty: facility.specialty_focus,
        location: facility.location,
        rating: facility.rating.toFixed(1),
        defaultValue: '{{type}} for {{specialty}} support near {{location}} with a {{rating}} rating.',
      }),
    [facility.description, facility.facility_type, facility.location, facility.rating, facility.specialty_focus, t]
  )

  const handleReserve = () => {
    const key = `${facility.facility_type}-${facility.id}`
    const reservations = loadReservations()
    const queue = reservations[key] || []
    const existingIndex = queue.findIndex(item => item.reserverKey === reservationUserKey)

    if (existingIndex >= 0) {
      setQueueNumber(existingIndex + 1)
      return
    }

    const nextQueue = [...queue, { reserverKey: reservationUserKey, reservedAt: Date.now() }]
    reservations[key] = nextQueue
    saveReservations(reservations)
    setQueueNumber(nextQueue.length)
  }

  return (
    <div
      className="animate-fade-in glass-card p-3 sm:p-4 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg">
          <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-[13px] font-semibold leading-tight text-gray-900 dark:text-white sm:text-sm">
              {facility.name}
            </h4>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {facility.facility_type === 'hospital' ? t('hospitalLabel') : t('clinicLabel')}
            </span>
          </div>

          <p className="mt-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400 sm:text-xs">
            {facility.specialty_focus}
          </p>
          <p className="mt-1.5 text-[10px] leading-5 text-gray-600 dark:text-gray-300 sm:text-xs">
            {description}
          </p>

          {facility.reservation_fee > 0 ? (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-500 sm:text-xs">
              {new Intl.NumberFormat('uz-UZ').format(facility.reservation_fee)} UZS
            </p>
          ) : (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-500 sm:text-xs">
              {t('emergencyServices')}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:mt-2">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400 sm:h-3.5 sm:w-3.5" />
              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 sm:text-xs">
                {facility.rating.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Navigation className="h-3 w-3 text-gray-400 sm:h-3.5 sm:w-3.5" />
              <span className="text-[10px] text-gray-500 dark:text-gray-400 sm:text-xs">
                {facility.distance.toFixed(1)} {t('km')}
              </span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1 sm:mt-1.5">
            <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400 sm:h-3.5 sm:w-3.5" />
            <span className="break-words text-[10px] text-gray-500 dark:text-gray-400 sm:text-xs">
              {facility.location}
            </span>
          </div>

          {queueNumber && (
            <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 sm:text-xs">
              <CalendarCheck2 className="h-3 w-3" />
              <span className="break-words">{t('queueNumber', { number: queueNumber })}</span>
            </div>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-shrink-0 sm:flex-col">
          <button
            className={`flex w-full items-center justify-center gap-1 px-2 py-2 text-[10px] font-semibold rounded-lg transition-colors sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs ${
              queueNumber
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            onClick={handleReserve}
          >
            <CalendarCheck2 className="hidden h-3 w-3 sm:block" />
            {queueNumber ? t('reserved') : t('reserveNow')}
          </button>

          {onOpenCallCenter && (
            <button
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-2 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-brand-700 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs"
              onClick={() => onOpenCallCenter(facility)}
            >
              <Headset className="hidden h-3 w-3 sm:block" />
              {t('callCenterChat', { defaultValue: 'Call center chat' })}
            </button>
          )}

          <button
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-50 px-2 py-2 text-[10px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300 dark:hover:bg-brand-900/70 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs"
            onClick={() => alert(`${t('viewDoctor')}: ${facility.name}`)}
          >
            <ExternalLink className="hidden h-3 w-3 sm:block" />
            {t('viewDoctor')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FacilityCard
