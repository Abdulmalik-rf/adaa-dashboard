'use client'

/**
 * LanguageOpenClawBridge
 * Keeps OpenClawContext.language in sync with the LanguageProvider.
 * Must be placed inside both LanguageProvider and OpenClawProvider.
 */

import { useEffect } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useOpenClaw } from '@/lib/openclaw/context'

export function LanguageOpenClawBridge() {
  const { language } = useLanguage()
  const { updateContext } = useOpenClaw()

  useEffect(() => {
    updateContext({ language: language as 'ar' | 'en' })
  }, [language, updateContext])

  return null
}
