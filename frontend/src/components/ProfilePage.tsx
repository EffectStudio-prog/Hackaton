import React, { useRef, useState } from 'react'
import { BriefcaseMedical, Camera, Crown, Eye, FileCheck2, LogOut, Mail, Phone, ShieldCheck, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CommonUserProfile {
  id: number
  username: string
  email: string
  is_premium: boolean
  photo_url?: string
  phone_number?: string
}

interface DoctorProfile {
  id: number
  name: string
  email: string
  specialty: string
  location?: string
  is_authorized: boolean
  diploma_status?: 'verified' | 'needs_review'
  diploma_name?: string
  is_premium?: boolean
  photo_url?: string
}

interface ProfilePageProps {
  authUser?: CommonUserProfile | null
  doctorUser?: DoctorProfile | null
  onLogout: () => void
  onBack: () => void
  consultationCount?: number
  onPhotoChange?: (photoUrl: string) => void
  canEdit?: boolean
  canLogout?: boolean
}

const ProfilePage: React.FC<ProfilePageProps> = ({
  authUser,
  doctorUser,
  onLogout,
  onBack,
  consultationCount = 0,
  onPhotoChange,
  canEdit = true,
  canLogout = true,
}) => {
  const { t } = useTranslation()
  const isDoctor = Boolean(doctorUser)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState(() => doctorUser?.photo_url || authUser?.photo_url || '')

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const nextUrl = String(reader.result || '')
      setPhotoPreview(nextUrl)
      onPhotoChange?.(nextUrl)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="glass-card overflow-hidden">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))] px-5 py-8 text-white sm:px-8">
            <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt={doctorUser?.name || authUser?.username || t('profilePhoto', { defaultValue: 'Profile photo' })}
                    className="h-24 w-24 rounded-3xl border-4 border-white/20 object-cover shadow-xl"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-white/20 bg-white/10 shadow-xl">
                    {isDoctor ? <BriefcaseMedical className="h-10 w-10 text-white" /> : <User className="h-10 w-10 text-white" />}
                  </div>
                )}
                {canEdit ? (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg transition hover:bg-slate-100"
                      title={t('uploadPhoto', { defaultValue: 'Upload photo' })}
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </>
                ) : (
                  <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg">
                    <Eye className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {t('profilePhoto', { defaultValue: 'Profile photo' })}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-200">
                  {canEdit
                    ? t('profilePhotoHint', { defaultValue: 'Upload a clear image for your account card.' })
                    : t('readOnlyProfileHint', { defaultValue: 'This is a read-only profile view.' })}
                </p>
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-200">
              {isDoctor ? t('doctorProfile', { defaultValue: 'Doctor profile' }) : t('userProfile', { defaultValue: 'User profile' })}
            </p>
            <h2 className="mt-3 text-3xl font-bold">
              {doctorUser?.name || authUser?.username || t('appName')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200">
              {isDoctor
                ? t('doctorProfileHint', { defaultValue: 'Manage your consultation workspace, identity details, and verification status.' })
                : t('userProfileHint', { defaultValue: 'Review your account details and premium status from one clean profile page.' })}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={onBack} className="btn-ghost bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
                {t('backToChat')}
              </button>
              {canLogout && (
                <button onClick={onLogout} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('logout')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="glass-card p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('profileDetails', { defaultValue: 'Profile details' })}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('emailAddress')}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Mail className="h-4 w-4 text-brand-500" />
                  {doctorUser?.email || authUser?.email}
                </p>
              </div>
              {authUser?.phone_number && !isDoctor && (
                <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('phoneNumber', { defaultValue: 'Phone number' })}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Phone className="h-4 w-4 text-brand-500" />
                    {authUser.phone_number}
                  </p>
                </div>
              )}
              {authUser && !isDoctor && (
                <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('premiumBadge')}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Crown className={`h-4 w-4 ${authUser.is_premium ? 'text-amber-500' : 'text-slate-400'}`} />
                    {authUser.is_premium ? t('premiumActive') : t('upgradePremium', { defaultValue: 'Upgrade' })}
                  </p>
                </div>
              )}
              {doctorUser && (
                <>
                  <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('doctorSpecialty')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{doctorUser.specialty}</p>
                  </div>
                  <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('premiumBadge')}</p>
                    <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Crown className={`h-4 w-4 ${doctorUser.is_premium ? 'text-amber-500' : 'text-slate-400'}`} />
                      {doctorUser.is_premium ? t('premiumActive') : t('upgradePremium', { defaultValue: 'Upgrade' })}
                    </p>
                  </div>
                  <div className="rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('doctorApprovalTitle')}</p>
                    <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <ShieldCheck className={`h-4 w-4 ${doctorUser.is_authorized ? 'text-emerald-500' : 'text-amber-500'}`} />
                      {doctorUser.is_authorized ? t('doctorApprovedShort') : t('doctorPendingShort')}
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="glass-card p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('workspaceStats', { defaultValue: 'Workspace stats' })}
              </h3>
              <div className="mt-4 rounded-3xl bg-brand-50 p-4 dark:bg-brand-900/20">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                  {isDoctor ? t('doctorConsultations') : t('chatHistory')}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{consultationCount}</p>
              </div>
            </div>

            {doctorUser && (
              <div className="glass-card p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('diplomaChecker', { defaultValue: 'Diploma checker' })}
                </h3>
                <div className="mt-4 rounded-3xl bg-white/70 p-4 dark:bg-slate-900/60">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <FileCheck2 className={`h-4 w-4 ${doctorUser.diploma_status === 'verified' ? 'text-emerald-500' : 'text-amber-500'}`} />
                    {doctorUser.diploma_status === 'verified'
                      ? t('diplomaVerified', { defaultValue: 'Diploma file passed local validation.' })
                      : t('diplomaNeedsReview', { defaultValue: 'Diploma file uploaded and marked for review.' })}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {doctorUser.diploma_name || t('noDiplomaUploaded', { defaultValue: 'No diploma file uploaded yet.' })}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
