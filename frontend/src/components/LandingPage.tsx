import React from 'react'
import { ArrowRight, BrainCircuit, Crown, HeartHandshake, MessageCircleHeart, ShieldPlus, Sparkles, Stethoscope, UserRoundPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface LandingPageProps {
  onOpenAuth: () => void
  onOpenDoctorAuth: () => void
  onOpenPremium: () => void
  onOpenPredictor: () => void
  onOpenWellness: () => void
}

const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onOpenDoctorAuth,
  onOpenPremium,
  onOpenPredictor,
  onOpenWellness,
}) => {
  const { t } = useTranslation()

  const highlights = [
    t('landingChipOne', { defaultValue: 'AI symptom triage' }),
    t('landingChipTwo', { defaultValue: 'Doctor recommendations' }),
    t('landingChipThree', { defaultValue: 'Live premium support' }),
  ]

  const featureCards = [
    {
      eyebrow: t('landingCardTriageEyebrow', { defaultValue: 'Fast triage' }),
      title: t('landingCardTriageTitle', { defaultValue: 'Symptom chat' }),
      text: t('landingCardTriageText', { defaultValue: 'Describe symptoms naturally and get a cleaner triage summary, urgency level, and next steps.' }),
      pills: [
        t('landingPillUrgency', { defaultValue: 'Urgency checks' }),
        t('landingPillDoctors', { defaultValue: 'Doctor routing' }),
        t('landingPillUpload', { defaultValue: 'File uploads' }),
      ],
      icon: MessageCircleHeart,
      action: t('landingOpenChat', { defaultValue: 'Open chat' }),
      onClick: onOpenAuth,
    },
    {
      eyebrow: t('landingCardPredictEyebrow', { defaultValue: 'AI predictor' }),
      title: t('landingCardPredictTitle', { defaultValue: 'Disease prediction' }),
      text: t('landingCardPredictText', { defaultValue: 'Choose symptoms or describe them in text to see likely conditions with confidence and explanation.' }),
      pills: [
        t('landingPillPercent', { defaultValue: 'Percent view' }),
        t('landingPillHistory', { defaultValue: 'Saved history' }),
        t('landingPillExplain', { defaultValue: 'Reasoning cards' }),
      ],
      icon: BrainCircuit,
      action: t('landingOpenPredictor', { defaultValue: 'Open predictor' }),
      onClick: onOpenPredictor,
    },
    {
      eyebrow: t('landingCardWellnessEyebrow', { defaultValue: 'Mental support' }),
      title: t('landingCardWellnessTitle', { defaultValue: 'Wellness support' }),
      text: t('landingCardWellnessText', { defaultValue: 'Low-pressure emotional support, grounding steps, and a calmer action plan when your mental load feels high.' }),
      pills: [
        t('landingPillGrounding', { defaultValue: 'Grounding tools' }),
        t('landingPillCalm', { defaultValue: 'Calming plans' }),
        t('landingPillCrisis', { defaultValue: 'Crisis prompts' }),
      ],
      icon: HeartHandshake,
      action: t('landingOpenWellness', { defaultValue: 'Open support' }),
      onClick: onOpenWellness,
    },
    {
      eyebrow: t('landingCardDoctorEyebrow', { defaultValue: 'Doctor portal' }),
      title: t('landingCardDoctorTitle', { defaultValue: 'Consultation workspace' }),
      text: t('landingCardDoctorText', { defaultValue: 'Doctors can manage incoming patients, use premium booking drafts, and run the predictor inside the portal.' }),
      pills: [
        t('landingPillQueue', { defaultValue: 'Queue tools' }),
        t('landingPillPortal', { defaultValue: 'Doctor login' }),
        t('landingPillPremium', { defaultValue: 'Premium drafts' }),
      ],
      icon: Stethoscope,
      action: t('landingOpenDoctor', { defaultValue: 'Doctor access' }),
      onClick: onOpenDoctorAuth,
    },
  ]

  return (
    <div className="liquid-grid flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        <section className="glass-shell rounded-[2rem] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-600 dark:bg-white/10 dark:text-brand-300">
                {t('landingEyebrow', { defaultValue: 'Main menu' })}
              </div>
              <h2 className="mt-5 max-w-4xl font-serif text-4xl font-black leading-[0.92] tracking-[-0.04em] text-slate-900 dark:text-white sm:text-6xl xl:text-7xl">
                {t('landingHeroTitle', { defaultValue: 'Health guidance that feels calm, premium, and instantly clear.' })}
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {t('landingHeroText', { defaultValue: 'Choose a path, talk to the AI, upload reports, or open the doctor workspace. The whole product now uses a softer liquid-glass surface inspired by modern iOS styling.' })}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {highlights.map(item => (
                  <span key={item} className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[23rem] lg:grid-cols-1">
              <button onClick={onOpenAuth} className="liquid-cta">
                <span className="inline-flex items-center gap-2">
                  <UserRoundPlus className="h-4 w-4" />
                  {t('landingStartNow', { defaultValue: 'Start as patient' })}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={onOpenDoctorAuth} className="liquid-secondary">
                <span className="inline-flex items-center gap-2">
                  <ShieldPlus className="h-4 w-4" />
                  {t('landingDoctorAccess', { defaultValue: 'Doctor portal' })}
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="glass-shell relative overflow-hidden rounded-[2rem] px-5 py-6 sm:px-6 sm:py-7">
          <div className="absolute inset-y-0 right-0 w-1/3 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,188,0.38),transparent_68%)] dark:bg-[radial-gradient(circle_at_center,rgba(244,114,182,0.16),transparent_70%)]" />
          <div className="relative max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
              <Crown className="h-3.5 w-3.5" />
              {t('landingPremiumEyebrow', { defaultValue: 'Premium upgrade' })}
            </div>
            <h3 className="mt-4 max-w-4xl font-serif text-3xl font-black tracking-[-0.04em] text-slate-900 dark:text-white sm:text-5xl">
              {t('landingPremiumTitle', { defaultValue: 'Unlock richer guidance, cleaner AI cards, and a much more polished care experience.' })}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
              {t('landingPremiumText', { defaultValue: 'Premium now opens as a focused purchase popup with a softer checkout surface, better plan comparison, and stronger doctor and clinic tools.' })}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{t('landingPremiumPillOne', { defaultValue: 'Popup checkout' })}</span>
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{t('landingPremiumPillTwo', { defaultValue: 'Doctor premium tools' })}</span>
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{t('landingPremiumPillThree', { defaultValue: 'Map + AI perks' })}</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={onOpenPremium} className="liquid-cta">
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t('landingPremiumButton', { defaultValue: 'Open premium popup' })}
                </span>
              </button>
              <button onClick={onOpenPredictor} className="liquid-secondary">
                {t('landingPremiumSecondary', { defaultValue: 'See predictor first' })}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {featureCards.map(card => {
            const Icon = card.icon
            return (
              <article key={card.title} className="glass-shell rounded-[1.8rem] px-5 py-5 sm:px-6 sm:py-6">
                <div className="inline-flex rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {card.eyebrow}
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div className="max-w-[80%]">
                    <h4 className="text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
                      {card.title}
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      {card.text}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/80 text-brand-600 shadow-lg shadow-brand-200/40 dark:bg-white/10 dark:text-brand-300 dark:shadow-none">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {card.pills.map(pill => (
                    <span key={pill} className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                      {pill}
                    </span>
                  ))}
                </div>
                <button onClick={card.onClick} className="liquid-secondary mt-6">
                  {card.action}
                </button>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}

export default LandingPage
