'use client'

/**
 * OpenClawPageBridge
 * 
 * Drop this into any page component to automatically push that pages context
 * into the OpenClaw global context. The assistant then uses this to auto-switch
 * specialist mode and provide page-aware, context-rich responses.
 * 
 * Usage:
 *   <OpenClawPageBridge page="clients" clientName="Acme Corp" />
 */

import { useEffect } from 'react'
import { useOpenClaw, DashboardContext } from '@/lib/openclaw/context'

interface BridgeProps {
  page: string
  platform?: string
  clientId?: string
  clientName?: string
  contentDraft?: DashboardContext['contentDraft']
  taskStats?: DashboardContext['taskStats']
}

export function OpenClawPageBridge({ page, platform, clientId, clientName, contentDraft, taskStats }: BridgeProps) {
  const { updateContext } = useOpenClaw()

  useEffect(() => {
    updateContext({
      currentPage: page,
      ...(platform    ? { platform }    : {}),
      ...(clientId    ? { clientId }    : {}),
      ...(clientName  ? { clientName }  : {}),
      ...(contentDraft ? { contentDraft } : {}),
      ...(taskStats   ? { taskStats }   : {}),
    })
  }, [page, platform, clientId, clientName, contentDraft, taskStats, updateContext])

  return null
}
