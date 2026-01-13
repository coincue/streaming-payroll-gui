import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import { applyInitialTheme } from './lib/theme'
import ThemeToggle from './components/ThemeToggle'

applyInitialTheme()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeToggle />
    <App />
  </React.StrictMode>
)
