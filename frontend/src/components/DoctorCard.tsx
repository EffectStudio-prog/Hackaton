import React from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Star, MapPin, Navigation, ExternalLink } from 'lucide-react'

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
}

const specialtyIcons: Record<string, string> = {
  'cardiologist': '❤️',
  'neurologist': '🧠',
  'dermatologist': '🩺',
  'pediatrician': '👶',
  'psychiatrist': '🧘',
  'orthopedist': '🦴',
  'general practitioner': '🏥',
}

const specialtyColors: Record<string, string> = {
  'cardiologist': 'from-red-500 to-rose-500',
  'neurologist': 'from-purple-500 to-indigo-500',
  'dermatologist': 'from-amber-500 to-orange-500',
  'pediatrician': 'from-blue-400 to-cyan-500',
  'psychiatrist': 'from-teal-500 to-emerald-500',
  'orthopedist': 'from-slate-500 to-gray-600',
  'general practitioner': 'from-brand-500 to-brand-600',
}

const getSpecialtyKey = (specialty: string) => {
  return specialty.toLowerCase()
}

const DoctorCard: React.FC<DoctorCardProps> = ({ doctor, index, onStartChat }) => {
  const { t } = useTranslation()
  const key = getSpecialtyKey(doctor.specialty)
  const icon = specialtyIcons[key] || '👨‍⚕️'
  const gradient = specialtyColors[key] || 'from-brand-500 to-brand-600'

  return (
    <div
      className="animate-fade-in glass-card p-3 sm:p-4 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xl sm:text-2xl shadow-lg`}>
          {icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white text-[13px] sm:text-sm truncate leading-tight">
            {doctor.name}
          </h4>
          <p className="text-[10px] sm:text-xs text-brand-600 dark:text-brand-400 font-medium capitalize mt-0.5 sm:mt-0">
            {doctor.specialty}
          </p>
          {doctor.consultation_fee && (
            <p className="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-500 font-semibold mt-0.5">
              {new Intl.NumberFormat('uz-UZ').format(doctor.consultation_fee)} UZS
            </p>
          )}

          {/* Rating + Distance */}
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2">
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

          {/* Location */}
          <div className="flex items-center gap-1 mt-1 sm:mt-1.5">
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate w-24 sm:w-auto">
              {doctor.location}
            </span>
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2">
          {onStartChat && (
            <button
              className="flex items-center gap-1 sm:gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors"
              onClick={() => onStartChat(doctor)}
            >
              <MessageCircle className="w-3 h-3 hidden sm:block" />
              {t('doctorChat')}
            </button>
          )}
          <button
            className="flex items-center gap-1 sm:gap-1.5 bg-brand-50 dark:bg-brand-900/40 hover:bg-brand-100 dark:hover:bg-brand-900/70 text-brand-700 dark:text-brand-300 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors"
            onClick={() => alert(`Viewing profile for ${doctor.name}`)}
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
