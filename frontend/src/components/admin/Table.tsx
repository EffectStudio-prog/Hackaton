import React from 'react'

export interface RecentSearchRow {
  id: string
  userId: string
  symptom: string
  category: string
  aiSuggestion: string
  doctorType: string
  date: string
}

interface TableProps {
  rows: RecentSearchRow[]
  labels: {
    userId: string
    symptomEntered: string
    aiSuggestion: string
    doctorType: string
    date: string
  }
}

const Table: React.FC<TableProps> = ({ rows, labels }) => {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none">
      <div className="space-y-3 p-3 lg:hidden">
        {rows.map(row => (
          <article
            key={row.id}
            className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {labels.userId}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{row.userId}</p>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{row.date}</span>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                {labels.symptomEntered}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{row.symptom}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.category}</p>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                {labels.aiSuggestion}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{row.aiSuggestion}</p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {labels.doctorType}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                  {row.doctorType}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {labels.date}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.date}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full">
          <thead className="bg-slate-50/90 dark:bg-slate-800/90">
            <tr className="text-left">
              {[labels.userId, labels.symptomEntered, labels.aiSuggestion, labels.doctorType, labels.date].map(header => (
                <th
                  key={header}
                  className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                className="border-t border-slate-200/80 transition-colors hover:bg-slate-50/80 dark:border-slate-700/80 dark:hover:bg-slate-800/60"
              >
                <td className="px-5 py-4 text-sm font-semibold text-slate-900 dark:text-white">{row.userId}</td>
                <td className="px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{row.symptom}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.category}</p>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{row.aiSuggestion}</td>
                <td className="px-5 py-4">
                <span className="max-w-[160px] truncate whitespace-nowrap rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                  {row.doctorType}
                </span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Table
