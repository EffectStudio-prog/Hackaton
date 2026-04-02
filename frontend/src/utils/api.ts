const getRuntimeApiBaseUrl = () => {
  const envValue = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
  if (envValue) return envValue

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host.endsWith('.vercel.app')) {
      return '/_/backend'
    }
  }

  return ''
}

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const runtimeApiBaseUrl = getRuntimeApiBaseUrl()
  return runtimeApiBaseUrl ? `${runtimeApiBaseUrl}${normalizedPath}` : normalizedPath
}

export const apiFetch: typeof fetch = (input, init) => {
  if (typeof input === 'string') {
    return fetch(buildApiUrl(input), init)
  }

  if (input instanceof URL) {
    return fetch(input, init)
  }

  return fetch(input, init)
}
