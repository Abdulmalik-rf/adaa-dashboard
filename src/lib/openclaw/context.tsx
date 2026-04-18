'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { SpecialistMode, DashboardContext, resolveMode, MODE_META } from './types'

export type { SpecialistMode, DashboardContext }
export { resolveMode, MODE_META }

interface OpenClawContextType {
  context: DashboardContext
  updateContext: (partial: Partial<DashboardContext>) => void
  dispatchAction: (type: 'apply_draft', data: any) => void
  mode: SpecialistMode
  setMode: (m: SpecialistMode) => void
}

const OpenClawCtx = createContext<OpenClawContextType>({
  context: { currentPage: 'dashboard', language: 'en' },
  updateContext: () => {},
  dispatchAction: () => {},
  mode: 'auto',
  setMode: () => {},
})

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<DashboardContext>({ currentPage: 'dashboard', language: 'en' })
  const [mode, setMode] = useState<SpecialistMode>('auto')

  const updateContext = useCallback((partial: Partial<DashboardContext>) => {
    setContext(prev => ({ ...prev, ...partial }))
  }, [])

  const dispatchAction = useCallback((type: 'apply_draft', data: any) => {
    setContext(prev => ({ ...prev, actionPayload: { type, data, timestamp: Date.now() } }))
  }, [])

  return (
    <OpenClawCtx.Provider value={{ context, updateContext, dispatchAction, mode, setMode }}>
      {children}
    </OpenClawCtx.Provider>
  )
}

export const useOpenClaw = () => useContext(OpenClawCtx)
