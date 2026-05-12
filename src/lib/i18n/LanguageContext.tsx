'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { dictionaries, Language, Translator } from './dictionaries'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translator
  dir: 'ltr' | 'rtl'
}

const defaultLang: Language = 'en'

const LanguageContext = createContext<LanguageContextType>({
  language: defaultLang,
  setLanguage: () => {},
  t: dictionaries[defaultLang],
  dir: 'ltr',
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(defaultLang)

  useEffect(() => {
    // Prefer the cookie (so server-rendered pages stay in sync with client),
    // fall back to localStorage for legacy, then browser detection.
    const cookieLang = readCookie('locale') as Language | null
    const stored = (cookieLang || (localStorage.getItem('agency_lang') as Language)) as Language | null
    if (stored && (stored === 'en' || stored === 'ar')) {
      setLanguage(stored)
    } else {
      const browserLang = navigator.language
      if (browserLang.startsWith('ar')) {
        setLanguage('ar')
        writeCookie('locale', 'ar')
        localStorage.setItem('agency_lang', 'ar')
      }
    }
  }, [])

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('agency_lang', lang)
    // Write the cookie too so getDictionary() on the server picks up the
    // same language for SSR pages (server actions, /team, etc.)
    writeCookie('locale', lang)
    // Force a refresh so server-rendered content re-renders in the new
    // language. Without this, the user has to navigate or hard-refresh
    // before SSR pages catch up with the cookie change.
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  const dir = language === 'ar' ? 'rtl' : 'ltr'
  const t = dictionaries[language]

  // Apply direction to body immediately
  useEffect(() => {
    document.documentElement.dir = dir
    document.documentElement.lang = language
  }, [dir, language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

// Cookie helpers — kept simple, no JS dep
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  // 1-year cookie, path=/ so all routes see it
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; SameSite=Lax`
}
