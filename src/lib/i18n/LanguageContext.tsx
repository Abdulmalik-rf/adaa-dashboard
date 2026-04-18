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
    const stored = localStorage.getItem('agency_lang') as Language
    if (stored && (stored === 'en' || stored === 'ar')) {
      setLanguage(stored)
    } else {
      // Default to Arabic if timezone is ME or user browser prefers Arabic
      const browserLang = navigator.language
      if (browserLang.startsWith('ar')) {
        setLanguage('ar')
      }
    }
  }, [])

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('agency_lang', lang)
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
