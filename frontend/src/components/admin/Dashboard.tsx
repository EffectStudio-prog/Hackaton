import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  CalendarRange,
  Download,
  Search,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react'

import BarChartCard, { BarDatum } from './BarChartCard'
import PieChartCard, { PieDatum } from './PieChartCard'
import StatsCard from './StatsCard'
import Table, { RecentSearchRow } from './Table'
import { loadPremiumConfig, savePremiumConfig } from '../../utils/premiumConfig'

type SymptomCategory = 'Fever' | 'Headache' | 'Stomach Pain' | 'Cold/Flu' | 'Other'
type DateRange = '7d' | '30d' | '90d'
type DashboardLanguage = 'en' | 'ru' | 'uz'

interface StoredMessage {
  id: string
  role: 'user' | 'ai' | 'typing'
  content: string
  createdAt?: number
  isPremium?: boolean
  summary?: string
  specialty?: string
  doctors?: { specialty?: string }[]
}

interface StoredConversation {
  id: string
  title?: string
  preview?: string
  updatedAt?: number
  messages?: StoredMessage[]
  ownerUserId?: number | null
  ownerUsername?: string
  ownerEmail?: string
}

interface StoredUser {
  id: number
  username: string
  email: string
  is_premium: boolean
}

interface SearchEntry {
  id: string
  userId: string
  username: string
  email: string
  symptom: string
  category: SymptomCategory
  aiSuggestion: string
  doctorType: string
  createdAt: number
  doctorsCount: number
  isPremium: boolean
}

const CHAT_HISTORY_KEY = 'mydoctor-chat-history'
const LOCAL_USER_KEY = 'mydoctor-local-users'
const CATEGORY_ORDER: SymptomCategory[] = ['Fever', 'Headache', 'Stomach Pain', 'Cold/Flu', 'Other']
const CATEGORY_COLORS: Record<SymptomCategory, string> = {
  Fever: '#38bdf8',
  Headache: '#34d399',
  'Stomach Pain': '#f59e0b',
  'Cold/Flu': '#fb7185',
  Other: '#a78bfa',
}

const skeletonCard = 'animate-pulse rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg dark:border-slate-700/70 dark:bg-slate-900/70 sm:p-5'

const copy = {
  en: {
    badge: 'Admin Intelligence',
    title: 'Triage Guidance Dashboard',
    subtitle: 'Analyze symptom demand, rule-based guidance trends, and referral behavior from one calm, scan-friendly admin workspace.',
    back: 'Back to app',
    last7Days: 'Last 7 days',
    last30Days: 'Last 30 days',
    last90Days: 'Last 90 days',
    allCategories: 'All categories',
    exportCsv: 'Export CSV',
    totalSearches: 'Total Searches',
    activeUsers: 'Active Users',
    mostCommonSymptom: 'Most Common Symptom',
    doctorReferrals: 'Doctor Referrals',
    premiumUsers: 'Premium Users',
    totalSearchesChange: 'Based on local sessions',
    activeUsersChange: 'Local active users',
    mostCommonSymptomChange: 'Most common by category',
    doctorReferralsChange: 'Based on AI referrals',
    premiumUsersChange: 'Premium searches:',
    pieTitle: 'Symptom Category Distribution',
    pieSubtitle: 'Interactive breakdown of the most common patient concerns handled by the triage assistant.',
    totalLabel: 'total',
    activeLabel: 'Active',
    searchesLabel: 'searches',
    barTitle: 'Daily Searches',
    recentSearchesTitle: 'Recent Searches',
    recentSearchesSubtitle: 'Latest symptom lookups, triage guidance, and doctor referral intent.',
    results: 'results',
    recentUserId: 'User ID',
    recentSymptom: 'Symptom entered',
    recentSuggestion: 'Triage guidance',
    recentDoctorType: 'Doctor type',
    recentDate: 'Date',
    topSymptoms: 'Top Symptoms',
    insightLabel: 'Trend Insight',
    insightTitle: 'Data builds as patients ask for help.',
    insightText: 'Once users start asking questions, the dashboard updates in real time from local sessions.',
    doctorGeneral: 'General Practitioner',
    doctorNeurologist: 'Neurologist',
    doctorDermatologist: 'Dermatologist',
    search7: 'Search activity trend for the last 7 days.',
    search30: 'Search activity trend for the last 30 days.',
    search90: 'Search activity trend for the last 90 days.',
    csvSymptom: 'Symptom',
    csvCategory: 'Category',
    csvSuggestion: 'Triage Guidance',
    csvDoctorType: 'Doctor Type',
    searchUsers: 'Search by username',
    searchUsersPlaceholder: 'Search username...',
    userProfileTitle: 'User profile search',
    userProfileSubtitle: 'Find a user and inspect what symptoms they usually type and which doctor is recommended most often.',
    noUserFound: 'No user matched this username yet.',
    profileUsername: 'Username',
    profileEmail: 'Email',
    profileSearchCount: 'Total searches',
    profileTopSymptoms: 'Most common symptoms',
    profileTopDoctor: 'Most referred doctor',
    profilePremium: 'Premium',
    profileRegular: 'Regular',
    premiumPricingTitle: 'Premium pricing',
    premiumPricingSubtitle: 'Update the Premium monthly and yearly prices from admin.',
    premiumMonthlyPlaceholder: 'Monthly price',
    premiumYearlyPlaceholder: 'Yearly price',
    premiumPricingSave: 'Save premium pricing',
    premiumPricingInvalid: 'Enter valid premium prices first.',
    premiumPricingSaved: 'Premium pricing updated.',
  },
  ru: {
    badge: '\u0410\u0434\u043c\u0438\u043d \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430',
    title: '\u041f\u0430\u043d\u0435\u043b\u044c \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0438 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u043e\u0432',
    subtitle: '\u0410\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u0443\u0439\u0442\u0435 \u0441\u043f\u0440\u043e\u0441 \u043f\u043e \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u0430\u043c, \u0442\u0440\u0435\u043d\u0434\u044b triage-\u043f\u0440\u0430\u0432\u0438\u043b \u0438 \u043f\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0439 \u043a \u0432\u0440\u0430\u0447\u0430\u043c \u0432 \u043e\u0434\u043d\u043e\u043c \u0443\u0434\u043e\u0431\u043d\u043e\u043c \u0440\u0430\u0431\u043e\u0447\u0435\u043c \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u0435.',
    back: '\u041d\u0430\u0437\u0430\u0434 \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435',
    last7Days: '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 7 \u0434\u043d\u0435\u0439',
    last30Days: '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 30 \u0434\u043d\u0435\u0439',
    last90Days: '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 90 \u0434\u043d\u0435\u0439',
    allCategories: '\u0412\u0441\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438',
    exportCsv: '\u042d\u043a\u0441\u043f\u043e\u0440\u0442 CSV',
    totalSearches: '\u0412\u0441\u0435\u0433\u043e \u043f\u043e\u0438\u0441\u043a\u043e\u0432',
    activeUsers: '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438',
    mostCommonSymptom: '\u0421\u0430\u043c\u044b\u0439 \u0447\u0430\u0441\u0442\u044b\u0439 \u0441\u0438\u043c\u043f\u0442\u043e\u043c',
    doctorReferrals: '\u041d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043a \u0432\u0440\u0430\u0447\u0430\u043c',
    premiumUsers: '\u041f\u0440\u0435\u043c\u0438\u0443\u043c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438',
    totalSearchesChange: '\u041f\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u043c \u0441\u0435\u0441\u0441\u0438\u044f\u043c',
    activeUsersChange: '\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438',
    mostCommonSymptomChange: '\u0421\u0430\u043c\u044b\u0439 \u0447\u0430\u0441\u0442\u044b\u0439 \u043f\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438',
    doctorReferralsChange: '\u041f\u043e AI-\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f\u043c',
    premiumUsersChange: '\u041f\u0440\u0435\u043c\u0438\u0443\u043c \u043f\u043e\u0438\u0441\u043a\u0438:',
    pieTitle: '\u0420\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0439 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u043e\u0432',
    pieSubtitle: '\u0418\u043d\u0442\u0435\u0440\u0430\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u0440\u0430\u0437\u0431\u0438\u0432\u043a\u0430 \u0441\u0430\u043c\u044b\u0445 \u0447\u0430\u0441\u0442\u044b\u0445 \u0437\u0430\u043f\u0440\u043e\u0441\u043e\u0432 \u043f\u0430\u0446\u0438\u0435\u043d\u0442\u043e\u0432, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043e\u0431\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u0435\u0442 triage-\u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a.',
    totalLabel: '\u0432\u0441\u0435\u0433\u043e',
    activeLabel: '\u0410\u043a\u0442\u0438\u0432\u043d\u043e',
    searchesLabel: '\u043f\u043e\u0438\u0441\u043a\u043e\u0432',
    barTitle: '\u041f\u043e\u0438\u0441\u043a\u0438 \u043f\u043e \u0434\u043d\u044f\u043c',
    recentSearchesTitle: '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u043f\u043e\u0438\u0441\u043a\u0438',
    recentSearchesSubtitle: '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u044b, triage-\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438 \u0438 \u043d\u0430\u043c\u0435\u0440\u0435\u043d\u0438\u044f \u043f\u043e \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044e \u043a \u0432\u0440\u0430\u0447\u0443.',
    results: '\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432',
    recentUserId: 'ID \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f',
    recentSymptom: '\u0412\u0432\u0435\u0434\u0451\u043d\u043d\u044b\u0439 \u0441\u0438\u043c\u043f\u0442\u043e\u043c',
    recentSuggestion: 'Triage-\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f',
    recentDoctorType: '\u0422\u0438\u043f \u0432\u0440\u0430\u0447\u0430',
    recentDate: '\u0414\u0430\u0442\u0430',
    topSymptoms: '\u0422\u043e\u043f \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u043e\u0432',
    insightLabel: '\u0422\u0440\u0435\u043d\u0434',
    insightTitle: '\u0414\u0430\u043d\u043d\u044b\u0435 \u043d\u0430\u043a\u0430\u043f\u043b\u0438\u0432\u0430\u044e\u0442\u0441\u044f \u043f\u043e \u043c\u0435\u0440\u0435 \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0439.',
    insightText: '\u041a\u0430\u043a \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0430\u0447\u0438\u043d\u0430\u044e\u0442 \u0437\u0430\u0434\u0430\u0432\u0430\u0442\u044c \u0432\u043e\u043f\u0440\u043e\u0441\u044b, \u043f\u0430\u043d\u0435\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438 \u043d\u0430 \u043e\u0441\u043d\u043e\u0432\u0435 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0445 \u0441\u0435\u0441\u0441\u0438\u0439.',
    doctorGeneral: '\u0412\u0440\u0430\u0447 \u043e\u0431\u0449\u0435\u0439 \u043f\u0440\u0430\u043a\u0442\u0438\u043a\u0438',
    doctorNeurologist: '\u041d\u0435\u0432\u0440\u043e\u043b\u043e\u0433',
    doctorDermatologist: '\u0414\u0435\u0440\u043c\u0430\u0442\u043e\u043b\u043e\u0433',
    search7: '\u0422\u0440\u0435\u043d\u0434 \u043f\u043e\u0438\u0441\u043a\u043e\u0432\u043e\u0439 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u0437\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 7 \u0434\u043d\u0435\u0439.',
    search30: '\u0422\u0440\u0435\u043d\u0434 \u043f\u043e\u0438\u0441\u043a\u043e\u0432\u043e\u0439 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u0437\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 30 \u0434\u043d\u0435\u0439.',
    search90: '\u0422\u0440\u0435\u043d\u0434 \u043f\u043e\u0438\u0441\u043a\u043e\u0432\u043e\u0439 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u0437\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 90 \u0434\u043d\u0435\u0439.',
    csvSymptom: '\u0421\u0438\u043c\u043f\u0442\u043e\u043c',
    csvCategory: '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f',
    csvSuggestion: 'Triage-\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f',
    csvDoctorType: '\u0422\u0438\u043f \u0432\u0440\u0430\u0447\u0430',
    searchUsers: '\u041f\u043e\u0438\u0441\u043a \u043f\u043e username',
    searchUsersPlaceholder: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 username...',
    userProfileTitle: '\u041f\u043e\u0438\u0441\u043a \u043f\u0440\u043e\u0444\u0438\u043b\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f',
    userProfileSubtitle: '\u041d\u0430\u0439\u0434\u0438\u0442\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0438 \u043f\u043e\u0441\u043c\u043e\u0442\u0440\u0438\u0442\u0435, \u043a\u0430\u043a\u0438\u0435 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u044b \u043e\u043d \u043f\u0438\u0448\u0435\u0442 \u0447\u0430\u0449\u0435 \u0432\u0441\u0435\u0433\u043e \u0438 \u043a\u0430\u043a\u043e\u0439 \u0432\u0440\u0430\u0447 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u0442\u0441\u044f \u0435\u043c\u0443 \u0447\u0430\u0449\u0435.',
    noUserFound: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0441 \u0442\u0430\u043a\u0438\u043c username \u043f\u043e\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.',
    profileUsername: 'Username',
    profileEmail: 'Email',
    profileSearchCount: '\u0412\u0441\u0435\u0433\u043e \u043f\u043e\u0438\u0441\u043a\u043e\u0432',
    profileTopSymptoms: '\u0421\u0430\u043c\u044b\u0435 \u0447\u0430\u0441\u0442\u044b\u0435 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u044b',
    profileTopDoctor: '\u0421\u0430\u043c\u044b\u0439 \u0447\u0430\u0441\u0442\u044b\u0439 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u043c\u044b\u0439 \u0432\u0440\u0430\u0447',
    profilePremium: '\u041f\u0440\u0435\u043c\u0438\u0443\u043c',
    profileRegular: '\u041e\u0431\u044b\u0447\u043d\u044b\u0439',
    premiumPricingTitle: '\u0426\u0435\u043d\u0430 Premium',
    premiumPricingSubtitle: '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0439\u0442\u0435 \u043c\u0435\u0441\u044f\u0447\u043d\u0443\u044e \u0438 \u0433\u043e\u0434\u043e\u0432\u0443\u044e \u0446\u0435\u043d\u0443 Premium \u0438\u0437 admin \u043f\u0430\u043d\u0435\u043b\u0438.',
    premiumMonthlyPlaceholder: '\u0426\u0435\u043d\u0430 \u0437\u0430 \u043c\u0435\u0441\u044f\u0446',
    premiumYearlyPlaceholder: '\u0426\u0435\u043d\u0430 \u0437\u0430 \u0433\u043e\u0434',
    premiumPricingSave: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0446\u0435\u043d\u0443 Premium',
    premiumPricingInvalid: '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0446\u0435\u043d\u044b Premium.',
    premiumPricingSaved: '\u0426\u0435\u043d\u0430 Premium \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430.',
  },
  uz: {
    badge: 'Admin analitika',
    title: 'Triage kuzatuv paneli',
    subtitle: "Simptomlar talabi, triage qoidalari trendlari va shifokor yo'naltirish xatti-harakatlarini bitta qulay admin oynasida tahlil qiling.",
    back: 'Ilovaga qaytish',
    last7Days: 'Oxirgi 7 kun',
    last30Days: 'Oxirgi 30 kun',
    last90Days: 'Oxirgi 90 kun',
    allCategories: 'Barcha kategoriyalar',
    exportCsv: 'CSV eksport',
    totalSearches: 'Jami qidiruvlar',
    activeUsers: 'Faol foydalanuvchilar',
    mostCommonSymptom: "Eng ko'p simptom",
    doctorReferrals: "Shifokor yo'naltirishlari",
    premiumUsers: 'Premium foydalanuvchilar',
    totalSearchesChange: "Mahalliy sessiyalar bo'yicha",
    activeUsersChange: 'Mahalliy faol foydalanuvchilar',
    mostCommonSymptomChange: "Eng ko'p kategoriya",
    doctorReferralsChange: 'AI tavsiyalariga asoslangan',
    premiumUsersChange: 'Premium qidiruvlar:',
    pieTitle: 'Simptom kategoriyalari taqsimoti',
    pieSubtitle: "Triage yordamchisi ko'rib chiqayotgan eng ko'p uchraydigan murojaatlar bo'yicha interaktiv taqsimot.",
    totalLabel: 'jami',
    activeLabel: 'Faol',
    searchesLabel: 'qidiruv',
    barTitle: 'Kunlik qidiruvlar',
    recentSearchesTitle: "So'nggi qidiruvlar",
    recentSearchesSubtitle: "So'nggi simptomlar, triage tavsiyalari va shifokor tavsiyasi yo'nalishlari.",
    results: 'natija',
    recentUserId: 'Foydalanuvchi ID',
    recentSymptom: 'Kiritilgan simptom',
    recentSuggestion: 'Triage tavsiyasi',
    recentDoctorType: 'Shifokor turi',
    recentDate: 'Sana',
    topSymptoms: 'Top simptomlar',
    insightLabel: 'Trend insight',
    insightTitle: "Ma'lumotlar savollar ko'payishi bilan yig'iladi.",
    insightText: 'Foydalanuvchilar savol bersa, panel mahalliy sessiyalar asosida yangilanadi.',
    doctorGeneral: 'Umumiy amaliyot shifokori',
    doctorNeurologist: 'Nevrolog',
    doctorDermatologist: 'Dermatolog',
    search7: 'Oxirgi 7 kun uchun qidiruv faolligi trendi.',
    search30: 'Oxirgi 30 kun uchun qidiruv faolligi trendi.',
    search90: 'Oxirgi 90 kun uchun qidiruv faolligi trendi.',
    csvSymptom: 'Simptom',
    csvCategory: 'Kategoriya',
    csvSuggestion: 'Triage tavsiyasi',
    csvDoctorType: 'Shifokor turi',
    searchUsers: "Username bo'yicha qidirish",
    searchUsersPlaceholder: 'Username kiriting...',
    userProfileTitle: 'Foydalanuvchi profili qidiruvi',
    userProfileSubtitle: "Userni toping va u asosan qaysi simptomlarni yozayotgani hamda qaysi doctor ko'proq tavsiya qilinayotganini ko'ring.",
    noUserFound: "Bu username bo'yicha hozircha foydalanuvchi topilmadi.",
    profileUsername: 'Username',
    profileEmail: 'Email',
    profileSearchCount: 'Jami qidiruvlar',
    profileTopSymptoms: "Eng ko'p yozilgan simptomlar",
    profileTopDoctor: "Eng ko'p tavsiya qilingan doctor",
    profilePremium: 'Premium',
    profileRegular: 'Oddiy',
    premiumPricingTitle: 'Premium narxi',
    premiumPricingSubtitle: 'Premium oylik va yillik narxini admin paneldan yangilang.',
    premiumMonthlyPlaceholder: 'Oylik narx',
    premiumYearlyPlaceholder: 'Yillik narx',
    premiumPricingSave: 'Premium narxini saqlash',
    premiumPricingInvalid: "Avval to'g'ri Premium narxlarini kiriting.",
    premiumPricingSaved: 'Premium narxi yangilandi.',
  },
} as const

interface DashboardProps {
  onBack?: () => void
}

const loadLocalHistory = (): StoredConversation[] => {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const loadStoredUsers = (): StoredUser[] => {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const hashToUserId = (value: string) => {
  const numeric = value
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    .toString()
  return `USR-${numeric.slice(-4).padStart(4, '0')}`
}

const Dashboard: React.FC<DashboardProps> = ({ onBack }) => {
  const { i18n } = useTranslation()
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [category, setCategory] = useState<SymptomCategory | 'All'>('All')
  const [isLoading, setIsLoading] = useState(true)
  const [usernameQuery, setUsernameQuery] = useState('')
  const [premiumForm, setPremiumForm] = useState(() => ({
    monthlyPrice: loadPremiumConfig().monthlyPrice.toFixed(2),
    yearlyPrice: loadPremiumConfig().yearlyPrice.toFixed(2),
  }))
  const [premiumMessage, setPremiumMessage] = useState('')

  const language = ((i18n.resolvedLanguage || i18n.language || 'en').split('-')[0] as DashboardLanguage)
  const text = copy[language] ?? copy.en

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 900)
    return () => window.clearTimeout(timer)
  }, [])

  const translateCategory = (value: SymptomCategory | 'All') => {
    if (value === 'All') {
      return text.allCategories
    }

    const labels: Record<SymptomCategory, string> = {
      Fever: language === 'ru' ? '\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430' : language === 'uz' ? 'Isitma' : 'Fever',
      Headache: language === 'ru' ? '\u0413\u043e\u043b\u043e\u0432\u043d\u0430\u044f \u0431\u043e\u043b\u044c' : language === 'uz' ? "Bosh og'rig'i" : 'Headache',
      'Stomach Pain': language === 'ru' ? '\u0411\u043e\u043b\u044c \u0432 \u0436\u0438\u0432\u043e\u0442\u0435' : language === 'uz' ? "Qorin og'rig'i" : 'Stomach Pain',
      'Cold/Flu': language === 'ru' ? '\u041f\u0440\u043e\u0441\u0442\u0443\u0434\u0430/\u0433\u0440\u0438\u043f\u043f' : language === 'uz' ? 'Shamollash/gripp' : 'Cold/Flu',
      Other: language === 'ru' ? '\u0414\u0440\u0443\u0433\u043e\u0435' : language === 'uz' ? 'Boshqa' : 'Other',
    }

    return labels[value]
  }

  const classifySymptom = (input: string): SymptomCategory => {
    const textValue = input.toLowerCase()
    const has = (patterns: RegExp[]) => patterns.some(pattern => pattern.test(textValue))

    if (has([/fever/, /temperature/, /high\s+temp/, /feverish/, /harorat/, /isitma/, /\u043b\u0438\u0445\u043e\u0440\u0430\u0434/, /\u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440/])) {
      return 'Fever'
    }
    if (has([/headache/, /migraine/, /\u0433\u043e\u043b\u043e\u0432\u043d/, /bosh\s*og/, /migren/])) {
      return 'Headache'
    }
    if (has([/stomach/, /abdomen/, /abdominal/, /belly/, /nausea/, /vomit/, /qorin/, /oshqozon/, /\u0436\u0438\u0432\u043e\u0442/, /\u0442\u043e\u0448\u043d\u043e\u0442/])) {
      return 'Stomach Pain'
    }
    if (has([/cold/, /flu/, /cough/, /sore\s+throat/, /congestion/, /chills/, /shamollash/, /gripp/, /\u043f\u0440\u043e\u0441\u0442\u0443\u0434/, /\u0433\u0440\u0438\u043f\u043f/, /\u043a\u0430\u0448\u0435\u043b\u044c/, /\u043d\u0430\u0441\u043c\u043e\u0440\u043a/])) {
      return 'Cold/Flu'
    }
    return 'Other'
  }

  const translateDoctorType = (doctorType: string) => {
    const labels: Record<string, string> = {
      'General Practitioner': text.doctorGeneral,
      Neurologist: text.doctorNeurologist,
      Dermatologist: text.doctorDermatologist,
    }

    return labels[doctorType] ?? doctorType
  }

  const {
    categoryStats,
    totalSearches,
    mostCommonSymptom,
    topSymptoms,
    dailySearches,
    allEntries,
    filteredEntries,
    doctorReferralCount,
    activeUsers,
    premiumUserCount,
    premiumSearchesCount,
    registeredUsers,
  } = useMemo(() => {
    const history = loadLocalHistory()
    const users = loadStoredUsers()
    const now = new Date()
    const rangeDays = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    const rangeStart = new Date(now)
    rangeStart.setDate(rangeStart.getDate() - rangeDays + 1)
    rangeStart.setHours(0, 0, 0, 0)

    const entriesRaw: SearchEntry[] = []
    history.forEach(conversation => {
      const baseTime = conversation.updatedAt ?? Date.now()
      const userId = conversation.ownerUserId ? `USR-${String(conversation.ownerUserId).padStart(4, '0')}` : hashToUserId(conversation.id || String(baseTime))
      const fallbackUsername = conversation.ownerUsername || users.find(user => user.id === conversation.ownerUserId)?.username || `guest-${userId.toLowerCase()}`
      const fallbackEmail = conversation.ownerEmail || users.find(user => user.id === conversation.ownerUserId)?.email || ''
      const messages = conversation.messages ?? []

      messages.forEach((message, index) => {
        if (message.role !== 'user') return
        const nextAi = messages.slice(index + 1).find(entry => entry.role === 'ai')
        const createdAt = message.createdAt ?? conversation.updatedAt ?? Date.now()
        entriesRaw.push({
          id: `${conversation.id}-${message.id}`,
          userId,
          username: fallbackUsername,
          email: fallbackEmail,
          symptom: message.content,
          category: classifySymptom(message.content),
          aiSuggestion: nextAi?.summary || nextAi?.content || '',
          doctorType: nextAi?.specialty || nextAi?.doctors?.[0]?.specialty || '',
          createdAt,
          doctorsCount: nextAi?.doctors?.length ?? 0,
          isPremium: Boolean(message.isPremium),
        })
      })
    })

    const inRange = entriesRaw.filter(entry => entry.createdAt >= rangeStart.getTime())
    const filteredByCategory = category === 'All'
      ? inRange
      : inRange.filter(entry => entry.category === category)

    const countsByCategory = CATEGORY_ORDER.reduce((acc, cat) => {
      acc[cat] = filteredByCategory.filter(entry => entry.category === cat).length
      return acc
    }, {} as Record<SymptomCategory, number>)

    const stats: PieDatum[] = CATEGORY_ORDER.map(cat => ({
      name: translateCategory(cat),
      value: countsByCategory[cat] ?? 0,
      color: CATEGORY_COLORS[cat],
    }))

    const topCategory = CATEGORY_ORDER
      .map(cat => ({ cat, count: countsByCategory[cat] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0]?.cat ?? 'Other'

    const topList = CATEGORY_ORDER
      .map(cat => ({ name: translateCategory(cat), value: countsByCategory[cat] ?? 0 }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)

    const barDays = Math.min(rangeDays, 90)
    const barStart = new Date(now)
    barStart.setDate(barStart.getDate() - barDays + 1)
    barStart.setHours(0, 0, 0, 0)

    const dayLabels = {
      en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    } satisfies Record<DashboardLanguage, string[]>

    const bars: BarDatum[] = Array.from({ length: barDays }, (_, index) => {
      const date = new Date(barStart)
      date.setDate(barStart.getDate() + index)
      const label = barDays <= 7
        ? dayLabels[language]?.[date.getDay() === 0 ? 6 : date.getDay() - 1] ?? date.toLocaleDateString()
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

      return { day: label, searches: 0 }
    })

    filteredByCategory.forEach(entry => {
      const entryDate = new Date(entry.createdAt)
      entryDate.setHours(0, 0, 0, 0)
      const diff = Math.floor((entryDate.getTime() - barStart.getTime()) / 86400000)
      if (diff >= 0 && diff < bars.length) {
        bars[diff].searches += 1
      }
    })

    const activeUserCount = new Set(filteredByCategory.map(entry => entry.userId)).size
    const referrals = filteredByCategory.reduce((sum, entry) => sum + (entry.doctorsCount > 0 ? 1 : 0), 0)
    const premiumSearches = filteredByCategory.filter(entry => entry.isPremium).length
    const premiumUsers = new Set(filteredByCategory.filter(entry => entry.isPremium).map(entry => entry.userId)).size

    return {
      categoryStats: stats,
      totalSearches: filteredByCategory.length,
      mostCommonSymptom: translateCategory(topCategory),
      topSymptoms: topList,
      allEntries: entriesRaw,
      dailySearches: bars,
      filteredEntries: filteredByCategory,
      doctorReferralCount: referrals,
      activeUsers: activeUserCount,
      premiumUserCount: premiumUsers,
      premiumSearchesCount: premiumSearches,
      registeredUsers: users,
    }
  }, [category, dateRange, language])

  const matchedUserProfile = useMemo(() => {
    const normalizedQuery = usernameQuery.trim().toLowerCase()
    if (!normalizedQuery) return null

    const matchedUser = registeredUsers.find(user => user.username.toLowerCase().includes(normalizedQuery))
    const matchedEntries = allEntries.filter(entry => entry.username.toLowerCase().includes(normalizedQuery))
    if (!matchedUser && matchedEntries.length === 0) {
      return null
    }

    const username = matchedUser?.username || matchedEntries[0]?.username || normalizedQuery
    const email = matchedUser?.email || matchedEntries[0]?.email || '-'
    const symptomCounts = matchedEntries.reduce((acc, entry) => {
      const key = entry.symptom.trim() || entry.category
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const doctorCounts = matchedEntries.reduce((acc, entry) => {
      const key = entry.doctorType || text.doctorGeneral
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topSymptomsForUser = Object.entries(symptomCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([symptom, count]) => `${symptom} (${count})`)

    const topDoctor = Object.entries(doctorCounts)
      .sort((left, right) => right[1] - left[1])[0]?.[0] || '-'

    return {
      username,
      email,
      searchCount: matchedEntries.length,
      topSymptoms: topSymptomsForUser,
      topDoctor: translateDoctorType(topDoctor),
      isPremium: matchedUser?.is_premium ?? false,
    }
  }, [allEntries, registeredUsers, text.doctorGeneral, usernameQuery])

  const handleSavePremiumPricing = () => {
    const monthlyPrice = Number(premiumForm.monthlyPrice)
    const yearlyPrice = Number(premiumForm.yearlyPrice)

    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || !Number.isFinite(yearlyPrice) || yearlyPrice <= 0) {
      setPremiumMessage(text.premiumPricingInvalid)
      return
    }

    savePremiumConfig({ monthlyPrice, yearlyPrice })
    setPremiumMessage(text.premiumPricingSaved)
  }

  const exportCsv = () => {
    const headers = [
      text.recentUserId,
      text.csvSymptom,
      text.csvCategory,
      text.csvSuggestion,
      text.csvDoctorType,
      text.recentDate,
    ]
    const rows = filteredEntries.map(item => [
      item.userId,
      item.symptom,
      translateCategory(item.category),
      item.aiSuggestion,
      translateDoctorType(item.doctorType),
      new Date(item.createdAt).toISOString().slice(0, 10),
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mydoctor-admin-dashboard-${dateRange}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const recentSearchRows = useMemo<RecentSearchRow[]>(() => {
    return filteredEntries
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8)
      .map(entry => ({
        id: entry.id,
        userId: `${entry.username} (${entry.userId})`,
        symptom: entry.symptom,
        category: translateCategory(entry.category),
        aiSuggestion: entry.aiSuggestion || '-',
        doctorType: translateDoctorType(entry.doctorType) || '-',
        date: new Date(entry.createdAt).toISOString().slice(0, 10),
      }))
  }, [filteredEntries, language])

  const searchSubtitle =
    dateRange === '7d' ? text.search7 : dateRange === '30d' ? text.search30 : text.search90

  return (
    <div className="flex-1 overflow-y-auto px-2 py-4 sm:px-0 sm:py-6 lg:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-4 shadow-2xl shadow-slate-200/60 dark:border-slate-700/70 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:shadow-none sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-20 h-56 w-56 rounded-full bg-sky-200/50 blur-3xl dark:bg-sky-500/15" />
          <div className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                <BrainCircuit className="w-3.5 h-3.5" />
                {text.badge}
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">
                {text.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {text.subtitle}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:max-w-[38rem] xl:justify-end">
              {onBack && (
                <button
                  onClick={onBack}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-200 sm:w-auto sm:flex-1 xl:flex-none"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {text.back}
                </button>
              )}

              <div className="flex w-full flex-col gap-3 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/50 sm:w-auto sm:flex-row sm:flex-wrap">
                <label className="relative w-full sm:flex-1 xl:min-w-[170px] xl:flex-none">
                  <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={dateRange}
                    onChange={event => setDateRange(event.target.value as DateRange)}
                    className="select-field w-full pl-10 pr-10"
                  >
                    <option value="7d">{text.last7Days}</option>
                    <option value="30d">{text.last30Days}</option>
                    <option value="90d">{text.last90Days}</option>
                  </select>
                </label>

                <label className="relative w-full sm:flex-1 xl:min-w-[200px] xl:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={category}
                    onChange={event => setCategory(event.target.value as SymptomCategory | 'All')}
                    className="select-field w-full pl-10 pr-10"
                  >
                    <option value="All">{text.allCategories}</option>
                    <option value="Fever">{translateCategory('Fever')}</option>
                    <option value="Headache">{translateCategory('Headache')}</option>
                    <option value="Stomach Pain">{translateCategory('Stomach Pain')}</option>
                    <option value="Cold/Flu">{translateCategory('Cold/Flu')}</option>
                    <option value="Other">{translateCategory('Other')}</option>
                  </select>
                </label>
              </div>

              <button
                onClick={exportCsv}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 sm:w-auto sm:flex-1 xl:flex-none"
              >
                <Download className="w-4 h-4" />
                {text.exportCsv}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {isLoading ? (
              <>
                <div className={skeletonCard}><div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800" /></div>
                <div className={skeletonCard}><div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800" /></div>
                <div className={skeletonCard}><div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800" /></div>
                <div className={skeletonCard}><div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800" /></div>
                <div className={skeletonCard}><div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800" /></div>
              </>
            ) : (
              <>
                <StatsCard title={text.totalSearches} value={String(totalSearches)} change={text.totalSearchesChange} icon={Search} tone="blue" />
                <StatsCard title={text.activeUsers} value={String(activeUsers)} change={text.activeUsersChange} icon={Users} tone="emerald" />
                <StatsCard title={text.mostCommonSymptom} value={mostCommonSymptom} change={text.mostCommonSymptomChange} icon={Sparkles} tone="amber" />
                <StatsCard title={text.doctorReferrals} value={String(doctorReferralCount)} change={text.doctorReferralsChange} icon={Stethoscope} tone="rose" />
                <StatsCard title={text.premiumUsers} value={String(premiumUserCount)} change={`${text.premiumUsersChange} ${premiumSearchesCount}`} icon={Sparkles} tone="blue" />
              </>
            )}
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            {isLoading ? (
              <>
                <div className={skeletonCard}><div className="h-[420px] rounded-3xl bg-slate-200/80 dark:bg-slate-800" /></div>
                <div className={skeletonCard}><div className="h-[420px] rounded-3xl bg-slate-200/80 dark:bg-slate-800" /></div>
              </>
            ) : (
              <>
                <PieChartCard
                  title={text.pieTitle}
                  subtitle={text.pieSubtitle}
                  data={categoryStats}
                  totalLabel={text.totalLabel}
                  activeLabel={text.activeLabel}
                  searchesLabel={text.searchesLabel}
                />
                <BarChartCard
                  title={text.barTitle}
                  subtitle={searchSubtitle}
                  data={dailySearches}
                  searchesLabel={text.searchesLabel}
                />
              </>
            )}
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{text.recentSearchesTitle}</p>
                  <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    {text.recentSearchesSubtitle}
                  </p>
                </div>
                <div className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {filteredEntries.length} {text.results}
                </div>
              </div>

              <div className="mt-5">
                {isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map(index => (
                      <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
                    ))}
                  </div>
                ) : (
                  <Table
                    rows={recentSearchRows}
                    labels={{
                      userId: text.recentUserId,
                      symptomEntered: text.recentSymptom,
                      aiSuggestion: text.recentSuggestion,
                      doctorType: text.recentDoctorType,
                      date: text.recentDate,
                    }}
                  />
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{text.userProfileTitle}</p>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {text.userProfileSubtitle}
                </p>

                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={usernameQuery}
                    onChange={event => setUsernameQuery(event.target.value)}
                    placeholder={text.searchUsersPlaceholder}
                    className="input-field w-full pl-10 pr-4 py-3 text-sm"
                  />
                </label>

                {!usernameQuery.trim() ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    {text.searchUsers}
                  </p>
                ) : !matchedUserProfile ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    {text.noUserFound}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/70">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{text.profileUsername}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{matchedUserProfile.username}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/70">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{text.profileEmail}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{matchedUserProfile.email}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/70">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{text.profileSearchCount}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{matchedUserProfile.searchCount}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/70">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{text.profileTopSymptoms}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {matchedUserProfile.topSymptoms.join(', ') || '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/70">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{text.profileTopDoctor}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{matchedUserProfile.topDoctor}</p>
                    </div>
                    <div className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                      {matchedUserProfile.isPremium ? text.profilePremium : text.profileRegular}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{text.premiumPricingTitle}</p>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {text.premiumPricingSubtitle}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <input
                    value={premiumForm.monthlyPrice}
                    onChange={event => setPremiumForm(previous => ({ ...previous, monthlyPrice: event.target.value }))}
                    className="input-field text-sm"
                    placeholder={text.premiumMonthlyPlaceholder}
                    inputMode="decimal"
                  />
                  <input
                    value={premiumForm.yearlyPrice}
                    onChange={event => setPremiumForm(previous => ({ ...previous, yearlyPrice: event.target.value }))}
                    className="input-field text-sm"
                    placeholder={text.premiumYearlyPlaceholder}
                    inputMode="decimal"
                  />
                </div>
                <button onClick={handleSavePremiumPricing} className="btn-primary mt-4 w-full">
                  {text.premiumPricingSave}
                </button>
                {premiumMessage && (
                  <p className="mt-3 text-xs leading-5 text-emerald-600 dark:text-emerald-300">
                    {premiumMessage}
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <Activity className="w-3.5 h-3.5" />
                  {text.topSymptoms}
                </div>
                <div className="mt-4 space-y-3">
                  {topSymptoms.map((item, index) => (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/70"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                            #{index + 1}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                        </div>
                        <span className="text-lg font-black text-slate-900 dark:text-white">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/60 bg-gradient-to-br from-sky-600 to-brand-700 p-5 text-white shadow-2xl shadow-sky-300/30 dark:border-slate-700/70">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">{text.insightLabel}</p>
                <p className="mt-3 text-xl font-black leading-tight">
                  {text.insightTitle}
                </p>
                <p className="mt-3 text-sm leading-7 text-white/80">
                  {text.insightText}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
