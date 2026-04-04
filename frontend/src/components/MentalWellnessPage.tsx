import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Brain, HeartHandshake, MoonStar, Sparkles, Wind } from 'lucide-react'

type MoodKey = 'overwhelmed' | 'anxious' | 'sad' | 'burned_out' | 'restless'
type GoalKey = 'calm' | 'focus' | 'sleep' | 'motivation'

interface MentalWellnessPageProps {
  onBack: () => void
}

const moodOptions: MoodKey[] = ['overwhelmed', 'anxious', 'sad', 'burned_out', 'restless']
const goalOptions: GoalKey[] = ['calm', 'focus', 'sleep', 'motivation']

const crisisKeywords = [
  'suicide',
  'kill myself',
  'self harm',
  'hurt myself',
  'want to die',
  'end my life',
  "o'zimni o'ldir",
  "o'zimni o'ldirmoq",
  "jonimga qasd",
]

const containsCrisisLanguage = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return crisisKeywords.some(keyword => normalized.includes(keyword))
}

const MentalWellnessPage: React.FC<MentalWellnessPageProps> = ({ onBack }) => {
  const { t } = useTranslation()
  const [selectedMood, setSelectedMood] = useState<MoodKey>('anxious')
  const [selectedGoal, setSelectedGoal] = useState<GoalKey>('calm')
  const [concern, setConcern] = useState('')
  const [hasGenerated, setHasGenerated] = useState(false)

  const crisisDetected = useMemo(() => containsCrisisLanguage(concern), [concern])
  const activeSupport = useMemo(
    () => ({
      summary: t(`mentalWellnessSupport.${selectedMood}.summary`),
      explanation: t(`mentalWellnessSupport.${selectedMood}.explanation`),
      steps: [1, 2, 3].map(index => t(`mentalWellnessSupport.${selectedMood}.step${index}`)),
    }),
    [selectedMood, t]
  )

  const focusLine = concern.trim()
    ? `${t('mentalWellnessFocusPrefix')}${concern.trim().slice(0, 120)}${concern.trim().length > 120 ? '...' : ''}`
    : t('mentalWellnessFocusFallback')

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button onClick={onBack} className="btn-ghost inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t('backToChat')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-brand-600 text-white shadow-lg shadow-cyan-500/20">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-600 dark:text-cyan-300">
                {t('mentalWellnessNav')}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {t('mentalWellnessTitle')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t('mentalWellnessSubtitle')}
              </p>
            </div>
          </div>

          {crisisDetected && (
            <div className="mt-5 rounded-3xl border border-red-300 bg-red-50 px-4 py-4 dark:border-red-800/60 dark:bg-red-500/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-300" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-200">
                    {t('mentalWellnessCrisisTitle')}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-red-700/90 dark:text-red-200/90">
                    {t('mentalWellnessCrisisText')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('mentalWellnessMoodPrompt')}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {moodOptions.map(option => {
                const active = selectedMood === option
                return (
                  <button
                    key={option}
                    onClick={() => setSelectedMood(option)}
                    className={`rounded-3xl border px-4 py-4 text-left transition-all ${
                      active
                        ? 'border-brand-400 bg-brand-50 shadow-lg shadow-brand-500/10 dark:border-brand-500 dark:bg-brand-500/10'
                        : 'border-slate-200 bg-white/80 hover:border-brand-200 hover:bg-brand-50/60 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-brand-700 dark:hover:bg-brand-900/20'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t(`mentalWellnessMood.${option}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      {t(`mentalWellnessMood.${option}.subtitle`)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('mentalWellnessGoalPrompt')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {goalOptions.map(option => {
                const active = selectedGoal === option
                return (
                  <button
                    key={option}
                    onClick={() => setSelectedGoal(option)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-cyan-400 bg-cyan-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-700 dark:hover:text-cyan-300'
                    }`}
                  >
                    {t(`mentalWellnessGoal.${option}`)}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              {t('mentalWellnessConcernLabel')}
            </label>
            <textarea
              value={concern}
              onChange={event => setConcern(event.target.value)}
              rows={5}
              placeholder={t('mentalWellnessConcernPlaceholder')}
              className="mt-3 min-h-[140px] w-full rounded-3xl border-2 border-slate-300 bg-white/95 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-950/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-400"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setHasGenerated(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition-transform hover:scale-[1.01]"
            >
              <Sparkles className="h-4 w-4" />
              {t('mentalWellnessGenerate')}
            </button>
            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
              {t('mentalWellnessGenerateHint')}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="glass-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-brand-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('mentalWellnessResponseTitle')}
              </h3>
            </div>

            {!hasGenerated ? (
              <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">
                {t('mentalWellnessResponseEmpty')}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-3xl border border-brand-200 bg-brand-50/80 p-4 dark:border-brand-800/60 dark:bg-brand-500/10">
                  <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{activeSupport.summary}</p>
                  <p className="mt-2 text-sm leading-7 text-brand-700/90 dark:text-brand-100/90">{activeSupport.explanation}</p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {t('mentalWellnessFocusTitle')}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-300">{focusLine}</p>
                </div>

                <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-500/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">
                    {t('mentalWellnessNextTen')}
                  </p>
                  <div className="mt-3 space-y-2">
                    {activeSupport.steps.map(step => (
                      <p key={step} className="text-sm leading-7 text-emerald-800 dark:text-emerald-100">
                        {step}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-cyan-200 bg-cyan-50/80 p-4 dark:border-cyan-900/50 dark:bg-cyan-500/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                    {t('mentalWellnessAnchorTitle')}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-cyan-800 dark:text-cyan-100">
                    {t(`mentalWellnessGoalNudge.${selectedGoal}`)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Wind className="h-5 w-5 text-cyan-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('mentalWellnessQuickReset')}
              </h3>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-3xl border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mentalWellnessResetBreathTitle')}
                </p>
                <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {t('mentalWellnessResetBreathText')}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mentalWellnessResetGroundingTitle')}
                </p>
                <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {t('mentalWellnessResetGroundingText')}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="flex items-center gap-2">
                  <MoonStar className="h-4 w-4 text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('mentalWellnessResetNightTitle')}
                  </p>
                </div>
                <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {t('mentalWellnessResetNightText')}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default MentalWellnessPage
