import React, { useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck, ClipboardCopy, ClipboardList, Crown, Gift, ShieldCheck, Sparkles, Stethoscope, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PremiumPageProps {
  isPremium: boolean
  onActivate: () => void
  onDeactivate: () => void
  onBack: () => void
  monthlyPrice: number
  yearlyPrice: number
  referralPoints: number
  referralCount: number
  referralCode: string
  referralLink: string
  onRedeemReferralMonth: () => void
  accountType?: 'user' | 'doctor'
}

const PremiumPage: React.FC<PremiumPageProps> = ({
  isPremium,
  onActivate,
  onDeactivate,
  onBack,
  monthlyPrice,
  yearlyPrice,
  referralPoints,
  referralCount,
  referralCode,
  referralLink,
  onRedeemReferralMonth,
  accountType = 'user',
}) => {
  const { t } = useTranslation()
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvc, setCvc] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [referralMessage, setReferralMessage] = useState('')

  const yearlySavingsPercent = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100)

  const plans = useMemo(
    () => [
      { id: 'monthly', name: t('planMonthly'), price: `$${monthlyPrice.toFixed(2)}`, note: t('planMonthlyNote') },
      { id: 'yearly', name: t('planYearly'), price: `$${yearlyPrice.toFixed(2)}`, note: t('planYearlyNote', { percent: yearlySavingsPercent }) },
    ],
    [monthlyPrice, t, yearlyPrice, yearlySavingsPercent]
  )

  const features = [
    {
      icon: Stethoscope,
      title: t('premiumFeatureDoctors'),
      description: t('premiumFeatureDoctorsDesc'),
    },
    {
      icon: ClipboardList,
      title: t('premiumFeaturePlan'),
      description: t('premiumFeaturePlanDesc'),
    },
    {
      icon: Sparkles,
      title: t('premiumFeatureQuestions'),
      description: t('premiumFeatureQuestionsDesc'),
    },
    {
      icon: ShieldCheck,
      title: t('premiumFeatureMap'),
      description: t('premiumFeatureMapDesc'),
    },
    {
      icon: BadgeCheck,
      title: accountType === 'doctor'
        ? t('premiumDoctorAutoReply', { defaultValue: 'AI auto-reply drafts' })
        : t('premiumFeaturePriority', { defaultValue: 'Priority triage mode' }),
      description: accountType === 'doctor'
        ? t('premiumDoctorAutoReplyDesc', { defaultValue: 'Generate patient-safe response drafts inside consultations with one click.' })
        : t('premiumFeaturePriorityDesc', { defaultValue: 'Get clearer summaries, richer prediction cards, and faster premium care suggestions.' }),
    },
    {
      icon: Users,
      title: accountType === 'doctor'
        ? t('premiumDoctorInsights', { defaultValue: 'Patient conversation insights' })
        : t('premiumFeatureFamily', { defaultValue: 'Family care shortcuts' }),
      description: accountType === 'doctor'
        ? t('premiumDoctorInsightsDesc', { defaultValue: 'See stronger consultation workflow tools for handling multiple patients smoothly.' })
        : t('premiumFeatureFamilyDesc', { defaultValue: 'Save more history and move faster when checking symptoms for family members.' }),
    },
  ]

  const handleActivate = () => {
    const cleanCardNumber = cardNumber.replace(/\s+/g, '')
    const cleanCvc = cvc.trim()
    const cleanExpiry = expiryDate.trim()
    const cleanName = cardName.trim()

    if (!cleanName || cleanCardNumber.length < 12 || !cleanExpiry || cleanCvc.length < 3) {
      setCheckoutError(t('premiumPaymentError', { defaultValue: 'Please fill in a valid card name, card number, expiry date, and CVC.' }))
      return
    }

    setCheckoutError('')
    onActivate()
  }

  const handleCopyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setReferralMessage(t('referralCopied'))
    } catch {
      setReferralMessage(t('referralCopyFallback'))
    }
  }

  const handleRedeemReferralMonth = () => {
    onRedeemReferralMonth()
    setReferralMessage(t('referralRedeemed'))
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-6 sm:px-0 sm:py-8">
      <div className="w-full max-w-7xl mx-auto">
        <button
          onClick={onBack}
          className="btn-ghost inline-flex items-center gap-2 mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToChat')}
        </button>

        <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-orange-100 px-6 py-8 shadow-2xl shadow-amber-500/10 dark:border-amber-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/40 sm:px-8 sm:py-10">
          <div className="absolute -top-8 right-0 h-36 w-36 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-500/15" />
          <div className="relative flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1 xl:max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Crown className="w-3.5 h-3.5" />
                {isPremium ? t('premiumActive') : t('premiumHeading')}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                {accountType === 'doctor'
                  ? t('doctorPremiumTitle', { defaultValue: 'Upgrade your doctor workspace' })
                  : t('premiumTitle')}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {accountType === 'doctor'
                  ? t('doctorPremiumSubtitle', { defaultValue: 'Doctor Premium adds AI-assisted draft replies, stronger consultation workflow support, and a more powerful portal experience.' })
                  : t('premiumSubtitle')}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
                {features.map(feature => {
                  const Icon = feature.icon
                  return (
                    <div
                      key={feature.title}
                      className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900/70 dark:shadow-none"
                    >
                      <Icon className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{feature.title}</p>
                      <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">{feature.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass-card w-full xl:max-w-[25rem] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                {t('premiumSafeCheckout')}
              </div>

              <div className="mt-4 space-y-3">
                {plans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                      selectedPlan === plan.id
                        ? 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-500/10 dark:border-amber-300 dark:bg-amber-500/10'
                        : 'border-slate-200 bg-white/80 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{plan.note}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{plan.price}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {accountType === 'user' && (
              <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/80 p-4 dark:border-brand-900/40 dark:bg-brand-900/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('referralTitle')}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">
                      {t('referralSubtitle')}
                    </p>
                  </div>
                  <Gift className="w-5 h-5 text-brand-600 dark:text-brand-300" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/80 p-3 dark:bg-slate-900/60">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <Users className="w-3.5 h-3.5" />
                      {t('referralPoints')}
                    </div>
                    <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{referralPoints}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('referralFriendsCount', { count: referralCount })}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3 dark:bg-slate-900/60">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t('referralLinkLabel', { defaultValue: 'Referral link' })}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white break-all">{referralLink}</p>
                    <button
                      onClick={handleCopyReferralCode}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5" />
                      {t('copyReferralCode')}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleRedeemReferralMonth}
                    disabled={referralPoints < 10}
                    className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('redeemReferralMonth')}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {t('referralExplain')}
                </p>

                {referralMessage && (
                  <p className="mt-2 text-xs leading-5 text-emerald-600 dark:text-emerald-300">
                    {referralMessage}
                  </p>
                )}
              </div>
              )}

              <div className="mt-5 space-y-3">
                <input
                  value={cardName}
                  onChange={event => setCardName(event.target.value)}
                  placeholder={t('cardName', { defaultValue: 'Cardholder name' })}
                  className="input-field text-sm"
                  disabled={isPremium}
                />
                <input
                  value={cardNumber}
                  onChange={event => setCardNumber(event.target.value)}
                  placeholder={t('cardNumber', { defaultValue: 'Card number' })}
                  className="input-field text-sm"
                  inputMode="numeric"
                  disabled={isPremium}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={expiryDate}
                    onChange={event => setExpiryDate(event.target.value)}
                    placeholder={t('cardExpiry', { defaultValue: 'MM/YY' })}
                    className="input-field text-sm"
                    disabled={isPremium}
                  />
                  <input
                    value={cvc}
                    onChange={event => setCvc(event.target.value)}
                    placeholder={t('cardCvc', { defaultValue: 'CVC' })}
                    className="input-field text-sm"
                    inputMode="numeric"
                    disabled={isPremium}
                  />
                </div>
              </div>

              {checkoutError && (
                <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">
                  {checkoutError}
                </p>
              )}

              {!isPremium ? (
                <button
                  onClick={handleActivate}
                  className="btn-primary mt-5 w-full flex items-center justify-center gap-2"
                >
                  <BadgeCheck className="w-4 h-4" />
                  {t('premiumActivate')}
                </button>
              ) : (
                <div className="mt-5 space-y-2">
                  <button
                    onClick={onDeactivate}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white/80 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
                  >
                    {t('disablePremium', { defaultValue: 'Disable Premium' })}
                  </button>
                  <button
                    onClick={onActivate}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-slate-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                  >
                    {t('enablePremium', { defaultValue: 'Enable Premium' })}
                  </button>
                </div>
              )}

              <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                {t('premiumDisclaimer')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default PremiumPage
