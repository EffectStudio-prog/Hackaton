import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, BrainCircuit, CheckCircle2, History, Languages, ShieldAlert } from 'lucide-react'

interface SymptomOption {
  key: string
  label: string
}

interface DiseasePrediction {
  disease_key: string
  disease: string
  probability: number
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
}

interface PredictionResponse {
  input_symptoms: string[]
  input_symptom_keys: string[]
  extracted_symptoms: string[]
  predictions: DiseasePrediction[]
  model: {
    name?: string
    metrics?: Record<string, number>
    uses_fallback?: boolean
  }
  disclaimer: string
}

interface HistoryEntry {
  id: string
  createdAt: number
  text: string
  symptomKeys: string[]
  result: PredictionResponse
}

const HISTORY_KEY = 'mydoctor-disease-prediction-history'

const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const confidenceStyles: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

const formatRequestError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof TypeError) {
    return `${fallbackMessage} Backend ishlamayapti yoki Vite proxy ulanmagan. FastAPI serverni ishga tushiring.`
  }
  return error instanceof Error ? error.message : fallbackMessage
}

const DiseasePredictorPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const [symptoms, setSymptoms] = useState<SymptomOption[]>([])
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [result, setResult] = useState<PredictionResponse | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }, [history])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const language = i18n.language?.split('-')[0] || 'en'
        const response = await fetch(`/predict/metadata?language=${language}`)
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.detail ?? 'Metadata request failed.')
        }
        setSymptoms(Array.isArray(data?.symptoms) ? data.symptoms : [])
      } catch (metadataError) {
        setError(formatRequestError(metadataError, t('predictionLoadError', { defaultValue: 'Could not load prediction metadata.' })))
      }
    }

    void loadMetadata()
  }, [i18n.language, t])

  const toggleSymptom = (symptomKey: string) => {
    setSelectedSymptoms(previous =>
      previous.includes(symptomKey)
        ? previous.filter(item => item !== symptomKey)
        : previous.concat(symptomKey)
    )
  }

  const handlePredict = async () => {
    if (selectedSymptoms.length === 0 && !freeText.trim()) {
      setError(t('predictionInputError', { defaultValue: 'Select symptoms or describe them in text first.' }))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: selectedSymptoms,
          text: freeText,
          language: i18n.language?.split('-')[0] || 'en',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.detail ?? t('predictionRunError', { defaultValue: 'Prediction request failed.' }))
      }
      const nextResult = data as PredictionResponse
      setResult(nextResult)
      setHistory(previous => [
        {
          id: `${Date.now()}`,
          createdAt: Date.now(),
          text: freeText,
          symptomKeys: selectedSymptoms,
          result: nextResult,
        },
        ...previous,
      ].slice(0, 10))
    } catch (predictionError) {
      setError(formatRequestError(predictionError, t('predictionRunError', { defaultValue: 'Prediction request failed.' })))
    } finally {
      setIsLoading(false)
    }
  }

  const metrics = useMemo(() => {
    if (!result?.model?.metrics) return []
    return Object.entries(result.model.metrics)
  }, [result?.model?.metrics])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="glass-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                {t('predictorEyebrow', { defaultValue: 'AI disease predictor' })}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {t('predictorTitle', { defaultValue: 'Symptom-based disease prediction' })}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t('predictorSubtitle', {
                  defaultValue:
                    'Choose symptoms manually or describe them in free text. The system extracts symptoms, predicts the top diseases, and explains the confidence.',
                })}
              </p>
            </div>
            <div className="rounded-2xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-200">
              <span className="inline-flex items-center gap-2">
                <Languages className="h-4 w-4" />
                {t('predictorLanguages', { defaultValue: 'English + Uzbek ready' })}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('structuredSymptoms', { defaultValue: 'Structured symptom input' })}
                </h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {symptoms.map(symptom => {
                  const selected = selectedSymptoms.includes(symptom.key)
                  return (
                    <button
                      key={symptom.key}
                      onClick={() => toggleSymptom(symptom.key)}
                      className={`rounded-2xl border px-3 py-3 text-left text-xs font-medium transition-colors ${
                        selected
                          ? 'border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-900/20 dark:text-brand-100'
                          : 'border-slate-200 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                      }`}
                    >
                      {symptom.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-brand-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('unstructuredSymptoms', { defaultValue: 'Unstructured text input' })}
                </h3>
              </div>
              <textarea
                value={freeText}
                onChange={event => setFreeText(event.target.value)}
                className="input-field mt-3 min-h-[220px] text-sm"
                placeholder={t('predictionTextPlaceholder', {
                  defaultValue: 'Example: I have fever, cough, and I cannot smell well since yesterday.',
                })}
              />
              <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                {t('predictionNlpHint', {
                  defaultValue:
                    'The backend uses keyword-based symptom extraction today, and it can later be upgraded to TF-IDF or transformer pipelines.',
                })}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={handlePredict} disabled={isLoading} className="btn-primary">
              {isLoading
                ? t('predictionRunning', { defaultValue: 'Predicting...' })
                : t('runPrediction', { defaultValue: 'Run prediction' })}
            </button>
            <button
              onClick={() => {
                setSelectedSymptoms([])
                setFreeText('')
                setResult(null)
                setError('')
              }}
              className="btn-ghost"
            >
              {t('clearPredictionForm', { defaultValue: 'Clear form' })}
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm leading-7 text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
            <span className="inline-flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              {result?.disclaimer || t('predictionDisclaimer', { defaultValue: 'This is not a medical diagnosis.' })}
            </span>
          </div>
        </section>

        <section className="space-y-4">
          <div className="glass-card p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('predictionResults', { defaultValue: 'Prediction results' })}
              </h3>
            </div>

            {!result ? (
              <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">
                {t('predictionEmptyState', {
                  defaultValue: 'Your top 3 predicted diseases with probabilities and explanations will appear here.',
                })}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {result.input_symptoms.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t('normalizedSymptoms', { defaultValue: 'Normalized symptoms' })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.input_symptoms.map(symptom => (
                        <span key={symptom} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {symptom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.predictions.map((prediction, index) => (
                  <div key={prediction.disease_key} className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                          {t('predictionRank', { rank: index + 1, defaultValue: `Top ${index + 1}` })}
                        </p>
                        <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                          {prediction.disease}
                        </h4>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {prediction.probability.toFixed(1)}%
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t(`confidence.${prediction.confidence}`, {
                            defaultValue: prediction.confidence,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${confidenceStyles[prediction.confidence] || confidenceStyles.low}`}
                        style={{ width: `${Math.min(prediction.probability, 100)}%` }}
                      />
                    </div>
                    <div className="mt-4 space-y-2">
                      {prediction.reasons.map(reason => (
                        <p key={reason} className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                          {reason}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}

                {metrics.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t('modelMetrics', { defaultValue: 'Model metrics' })}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {metrics.map(([metricName, metricValue]) => (
                        <div key={metricName} className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-800/70">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            {metricName.replace('_', ' ')}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                            {(metricValue * 100).toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="glass-card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-brand-500" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('predictionHistory', { defaultValue: 'Saved history' })}
                </h3>
              </div>
              {history.length > 0 && (
                <button onClick={() => setHistory([])} className="btn-ghost px-3 py-1.5 text-xs">
                  {t('clearPredictionHistory', { defaultValue: 'Clear history' })}
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {history.length === 0 ? (
                <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
                  {t('predictionHistoryEmpty', { defaultValue: 'Prediction requests you run here will be saved locally.' })}
                </p>
              ) : (
                history.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelectedSymptoms(entry.symptomKeys)
                      setFreeText(entry.text)
                      setResult(entry.result)
                    }}
                    className="w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-brand-700 dark:hover:bg-brand-900/10"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {entry.result.predictions[0]?.disease || t('predictionResults')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {entry.text || entry.result.input_symptoms.join(', ')}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default DiseasePredictorPage
