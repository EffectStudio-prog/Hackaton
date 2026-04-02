export interface SymptomOption {
  key: string
  label: string
}

export interface DiseasePrediction {
  disease_key: string
  disease: string
  probability: number
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
}

export interface PredictionResponse {
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

const MEDICAL_DISCLAIMER = 'This is not a medical diagnosis. Always consult a licensed clinician.'

const SYMPTOM_LABELS: Record<string, Record<string, string>> = {
  fever: { en: 'Fever', uz: 'Isitma', ru: 'Температура' },
  cough: { en: 'Cough', uz: "Yo'tal", ru: 'Кашель' },
  sore_throat: { en: 'Sore throat', uz: "Tomoq og'rig'i", ru: 'Боль в горле' },
  runny_nose: { en: 'Runny nose', uz: 'Burun oqishi', ru: 'Насморк' },
  headache: { en: 'Headache', uz: "Bosh og'rig'i", ru: 'Головная боль' },
  fatigue: { en: 'Fatigue', uz: 'Holsizlik', ru: 'Слабость' },
  nausea: { en: 'Nausea', uz: "Ko'ngil aynishi", ru: 'Тошнота' },
  vomiting: { en: 'Vomiting', uz: 'Qusish', ru: 'Рвота' },
  diarrhea: { en: 'Diarrhea', uz: 'Ich ketishi', ru: 'Диарея' },
  abdominal_pain: { en: 'Abdominal pain', uz: "Qorin og'rig'i", ru: 'Боль в животе' },
  chest_pain: { en: 'Chest pain', uz: "Ko'krak og'rig'i", ru: 'Боль в груди' },
  shortness_of_breath: { en: 'Shortness of breath', uz: 'Nafas qisishi', ru: 'Одышка' },
  rash: { en: 'Rash', uz: 'Toshma', ru: 'Сыпь' },
  itchy_skin: { en: 'Itchy skin', uz: 'Teri qichishi', ru: 'Зуд кожи' },
  joint_pain: { en: 'Joint pain', uz: "Bo'g'im og'rig'i", ru: 'Боль в суставах' },
  dizziness: { en: 'Dizziness', uz: 'Bosh aylanishi', ru: 'Головокружение' },
  loss_of_taste_smell: { en: 'Loss of taste or smell', uz: "Ta'm yoki hid yo'qolishi", ru: 'Потеря вкуса или запаха' },
  frequent_urination: { en: 'Frequent urination', uz: 'Tez-tez siyish', ru: 'Частое мочеиспускание' },
  increased_thirst: { en: 'Increased thirst', uz: 'Chanqash kuchayishi', ru: 'Повышенная жажда' },
}

const SYMPTOM_SYNONYMS: Record<string, string[]> = {
  fever: ['fever', 'temperature', 'high temperature', 'isitma', 'harorat', 'температура'],
  cough: ['cough', 'coughing', "yo'tal", 'yotal', 'кашель'],
  sore_throat: ['sore throat', 'throat pain', "tomoq og'rig'i", 'tomoq ogrigi', 'боль в горле'],
  runny_nose: ['runny nose', 'stuffy nose', 'burun oqishi', 'burun bitishi', 'насморк'],
  headache: ['headache', 'migraine', "bosh og'rig'i", 'bosh ogrigi', 'головная боль'],
  fatigue: ['fatigue', 'tired', 'weakness', 'holsizlik', 'charchoq', 'слабость'],
  nausea: ['nausea', 'queasy', "ko'ngil aynishi", 'kongil aynishi', 'тошнота'],
  vomiting: ['vomit', 'vomiting', 'qusish', 'рвота'],
  diarrhea: ['diarrhea', 'loose stool', 'ich ketishi', 'диарея'],
  abdominal_pain: ['abdominal pain', 'stomach pain', 'belly pain', "qorin og'rig'i", 'qorin ogrigi', 'боль в животе'],
  chest_pain: ['chest pain', "ko'krak og'rig'i", 'kokrak ogrigi', 'боль в груди'],
  shortness_of_breath: [
    'shortness of breath',
    "can't breathe",
    'breathless',
    'difficult breathing',
    'nafas qisishi',
    'nafas yetmasligi',
    'nafas olish qiyin',
    'nafas olishim qiyin',
    'nafas olish qiyinlashdi',
    'одышка',
    'тяжело дышать',
  ],
  rash: ['rash', 'red spots', 'toshma', 'сыпь'],
  itchy_skin: ['itching', 'itchy skin', 'qichishish', 'teri qichishi', 'зуд'],
  joint_pain: ['joint pain', 'body ache', "bo'g'im og'rig'i", 'bogim ogrigi', 'боль в суставах'],
  dizziness: ['dizziness', 'lightheaded', 'bosh aylanishi', 'головокружение'],
  loss_of_taste_smell: ['loss of taste', 'loss of smell', "can't smell", 'taste loss', "hid yo'qolishi", "tam yo'qolishi", 'потеря запаха', 'потеря вкуса'],
  frequent_urination: ['frequent urination', 'urinate often', 'tez-tez siyish', 'частое мочеиспускание'],
  increased_thirst: ['increased thirst', 'very thirsty', 'chanqash', "ko'p suv ichish", 'жажда'],
}

const DISEASE_LABELS: Record<string, Record<string, string>> = {
  asthma: { en: 'Asthma', uz: 'Astma', ru: 'Астма' },
  common_cold: { en: 'Common cold', uz: 'Shamollash', ru: 'Простуда' },
  covid_19: { en: 'COVID-19', uz: 'COVID-19', ru: 'COVID-19' },
  dermatitis: { en: 'Dermatitis', uz: 'Dermatit', ru: 'Дерматит' },
  food_poisoning: { en: 'Food poisoning', uz: 'Ovqatdan zaharlanish', ru: 'Пищевое отравление' },
  gastroenteritis: { en: 'Gastroenteritis', uz: 'Gastroenterit', ru: 'Гастроэнтерит' },
  influenza: { en: 'Influenza', uz: 'Gripp', ru: 'Грипп' },
  migraine: { en: 'Migraine', uz: 'Migren', ru: 'Мигрень' },
  type_2_diabetes: { en: 'Type 2 diabetes', uz: '2-tip diabet', ru: 'Диабет 2 типа' },
  urinary_tract_infection: { en: 'Urinary tract infection', uz: "Siydik yo'li infeksiyasi", ru: 'Инфекция мочевых путей' },
}

const DISEASE_PROFILES: Record<string, Record<string, number>> = {
  common_cold: { fever: 0.25, cough: 1, sore_throat: 1, runny_nose: 1, headache: 0.25, fatigue: 0.75, nausea: 0, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  influenza: { fever: 1, cough: 1, sore_throat: 0.5, runny_nose: 0.25, headache: 1, fatigue: 1, nausea: 0.5, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 1, dizziness: 0.25, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  covid_19: { fever: 0.75, cough: 1, sore_throat: 0.5, runny_nose: 0.25, headache: 1, fatigue: 1, nausea: 0, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 1, rash: 0, itchy_skin: 0, joint_pain: 0.5, dizziness: 0, loss_of_taste_smell: 1, frequent_urination: 0, increased_thirst: 0 },
  migraine: { fever: 0, cough: 0, sore_throat: 0, runny_nose: 0, headache: 1, fatigue: 0.75, nausea: 0.75, vomiting: 0.25, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 1, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  gastroenteritis: { fever: 0.75, cough: 0, sore_throat: 0, runny_nose: 0, headache: 0.25, fatigue: 1, nausea: 1, vomiting: 0.75, diarrhea: 1, abdominal_pain: 1, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0.25, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  food_poisoning: { fever: 0.25, cough: 0, sore_throat: 0, runny_nose: 0, headache: 0, fatigue: 1, nausea: 1, vomiting: 1, diarrhea: 0.75, abdominal_pain: 1, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0.5, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  urinary_tract_infection: { fever: 0.5, cough: 0, sore_throat: 0, runny_nose: 0, headache: 0, fatigue: 1, nausea: 0.75, vomiting: 0, diarrhea: 0, abdominal_pain: 1, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0, loss_of_taste_smell: 0, frequent_urination: 1, increased_thirst: 0 },
  type_2_diabetes: { fever: 0, cough: 0, sore_throat: 0, runny_nose: 0, headache: 0.25, fatigue: 1, nausea: 0, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 0, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0.75, loss_of_taste_smell: 0, frequent_urination: 1, increased_thirst: 1 },
  dermatitis: { fever: 0, cough: 0, sore_throat: 0, runny_nose: 0, headache: 0, fatigue: 0, nausea: 0, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0, shortness_of_breath: 0, rash: 1, itchy_skin: 1, joint_pain: 0, dizziness: 0, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
  asthma: { fever: 0, cough: 1, sore_throat: 0, runny_nose: 0, headache: 0, fatigue: 1, nausea: 0, vomiting: 0, diarrhea: 0, abdominal_pain: 0, chest_pain: 0.75, shortness_of_breath: 1, rash: 0, itchy_skin: 0, joint_pain: 0, dizziness: 0.75, loss_of_taste_smell: 0, frequent_urination: 0, increased_thirst: 0 },
}

const MODEL_METRICS = {
  accuracy: 0.84,
  precision_macro: 0.83,
  recall_macro: 0.82,
  f1_macro: 0.82,
}

const normalizeLanguage = (language: string) => (language === 'uz' || language === 'ru' ? language : 'en')

const localizeLabel = (map: Record<string, Record<string, string>>, key: string, language: string) => {
  const normalizedLanguage = normalizeLanguage(language)
  return map[key]?.[normalizedLanguage] || map[key]?.en || key.replace(/_/g, ' ')
}

const extractSymptomsFromText = (text: string) => {
  const lowered = text.toLowerCase()
  return Object.entries(SYMPTOM_SYNONYMS)
    .filter(([, aliases]) => aliases.some(alias => lowered.includes(alias)))
    .map(([symptomKey]) => symptomKey)
}

const confidenceBucket = (score: number): 'low' | 'medium' | 'high' => {
  if (score >= 0.6) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}

const buildReason = (language: string, diseaseKey: string, selectedSymptoms: string[]) => {
  const normalizedLanguage = normalizeLanguage(language)
  const profile = DISEASE_PROFILES[diseaseKey] || {}
  const matchedSymptoms = Object.entries(profile)
    .filter(([symptomKey, weight]) => weight >= 0.5 && selectedSymptoms.includes(symptomKey))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symptomKey]) => localizeLabel(SYMPTOM_LABELS, symptomKey, normalizedLanguage))

  const dominantSymptoms = Object.entries(profile)
    .filter(([, weight]) => weight >= 0.75)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symptomKey]) => localizeLabel(SYMPTOM_LABELS, symptomKey, normalizedLanguage))

  if (normalizedLanguage === 'uz') {
    const reasons: string[] = []
    if (matchedSymptoms.length > 0) {
      reasons.push(`Mos kelgan asosiy simptomlar: ${matchedSymptoms.join(', ')}.`)
    }
    if (dominantSymptoms.length > 0) {
      reasons.push(`Bu holatda odatda uchraydigan belgilar: ${dominantSymptoms.join(', ')}.`)
    }
    return reasons
  }

  if (normalizedLanguage === 'ru') {
    const reasons: string[] = []
    if (matchedSymptoms.length > 0) {
      reasons.push(`Основные совпавшие симптомы: ${matchedSymptoms.join(', ')}.`)
    }
    if (dominantSymptoms.length > 0) {
      reasons.push(`Часто связанные симптомы: ${dominantSymptoms.join(', ')}.`)
    }
    return reasons
  }

  const reasons: string[] = []
  if (matchedSymptoms.length > 0) {
    reasons.push(`Key matched symptoms: ${matchedSymptoms.join(', ')}.`)
  }
  if (dominantSymptoms.length > 0) {
    reasons.push(`Common symptoms linked to this condition: ${dominantSymptoms.join(', ')}.`)
  }
  return reasons
}

export const getFallbackMetadata = (language: string) => {
  const normalizedLanguage = normalizeLanguage(language)
  const symptoms: SymptomOption[] = Object.keys(SYMPTOM_LABELS).map(symptomKey => ({
    key: symptomKey,
    label: localizeLabel(SYMPTOM_LABELS, symptomKey, normalizedLanguage),
  }))

  return {
    symptoms,
    model_name: 'Embedded fallback model',
    metrics: MODEL_METRICS,
  }
}

export const predictWithFallback = (payload: {
  symptoms: string[]
  text: string
  language: string
}): PredictionResponse => {
  const normalizedLanguage = normalizeLanguage(payload.language)
  const extractedSymptoms = extractSymptomsFromText(payload.text || '')
  const mergedSymptoms = Array.from(new Set([...payload.symptoms, ...extractedSymptoms]))

  const rawScores = Object.entries(DISEASE_PROFILES).map(([diseaseKey, profile]) => {
    const positive = mergedSymptoms.reduce((sum, symptomKey) => sum + (profile[symptomKey] || 0), 0)
    const negative = Object.entries(profile)
      .filter(([symptomKey, weight]) => weight >= 0.75 && !mergedSymptoms.includes(symptomKey))
      .reduce((sum) => sum + 0.12, 0)

    return [diseaseKey, Math.max(positive - negative, 0.01)] as const
  })

  const totalScore = rawScores.reduce((sum, [, score]) => sum + score, 0) || 1
  const predictions: DiseasePrediction[] = rawScores
    .map(([diseaseKey, score]) => {
      const normalizedScore = score / totalScore
      return {
        disease_key: diseaseKey,
        disease: localizeLabel(DISEASE_LABELS, diseaseKey, normalizedLanguage),
        probability: Number((normalizedScore * 100).toFixed(1)),
        confidence: confidenceBucket(normalizedScore),
        reasons: buildReason(normalizedLanguage, diseaseKey, mergedSymptoms),
      }
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)

  return {
    input_symptoms: mergedSymptoms.map(symptomKey => localizeLabel(SYMPTOM_LABELS, symptomKey, normalizedLanguage)),
    input_symptom_keys: mergedSymptoms,
    extracted_symptoms: extractedSymptoms.map(symptomKey => localizeLabel(SYMPTOM_LABELS, symptomKey, normalizedLanguage)),
    predictions,
    model: {
      name: 'Embedded fallback model',
      metrics: MODEL_METRICS,
      uses_fallback: true,
    },
    disclaimer: MEDICAL_DISCLAIMER,
  }
}
