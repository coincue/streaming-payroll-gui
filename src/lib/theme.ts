const STORAGE_KEY = 'theme'

export type Theme = 'light' | 'dark'

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return null
}

export function setStoredTheme(theme: Theme) {
  try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
}

export function applyTheme(theme: Theme) {
  const el = document.documentElement
  el.setAttribute('data-theme', theme)
}

export function applyInitialTheme() {
  const stored = getStoredTheme()
  const theme = stored ?? getSystemTheme()
  applyTheme(theme)
}
