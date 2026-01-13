import { useEffect, useState } from 'react'
import type { Theme } from '../lib/theme'
import { applyTheme, getStoredTheme, getSystemTheme, setStoredTheme } from '../lib/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())

  useEffect(() => {
    applyTheme(theme)
    setStoredTheme(theme)
  }, [theme])

  const next = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      aria-label="Toggle theme"
      title={`Switch to ${next} mode`}
      className="theme-toggle btn"
      onClick={() => setTheme(next)}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
