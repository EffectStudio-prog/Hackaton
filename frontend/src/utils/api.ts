const normalizedApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${normalizedPath}` : normalizedPath
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
