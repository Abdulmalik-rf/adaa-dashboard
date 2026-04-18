export type SpecialistMode =
  | 'auto'
  | 'content_strategist'
  | 'viral_growth'
  | 'premium_brand'
  | 'conversion_expert'
  | 'account_manager'
  | 'operations_manager'
  | 'financial_analyst'

export interface DashboardContext {
  currentPage: string
  platform?: string
  clientId?: string
  clientName?: string
  contentDraft?: {
    title?: string
    hook?: string
    caption?: string
    hashtags?: string
    cta?: string
    firstComment?: string
  }
  taskStats?: {
    overdue: number
    pending: number
    total: number
  }
  language: 'ar' | 'en'
  actionPayload?: {
    timestamp: number
    type: 'apply_draft'
    data: { hook?: string, caption?: string, hashtags?: string, cta?: string, title?: string, first_comment?: string }
  }
}

// Auto-resolve the best specialist mode for a given page
export function resolveMode(page: string, explicit: SpecialistMode): SpecialistMode {
  if (explicit !== 'auto') return explicit
  if (page.includes('social') || page.includes('content') || page.includes('scheduler/new')) return 'content_strategist'
  if (page.includes('scheduler')) return 'content_strategist'
  if (page.includes('tasks') || page.includes('my-tasks')) return 'operations_manager'
  if (page.includes('clients')) return 'account_manager'
  if (page.includes('contracts') || page.includes('reminders')) return 'account_manager'
  if (page.includes('finance') || page.includes('invoices')) return 'financial_analyst'
  if (page.includes('campaigns')) return 'viral_growth'
  return 'content_strategist'
}

export const MODE_META: Record<SpecialistMode, { label: string; labelAr: string; icon: string; color: string }> = {
  auto:               { label: 'Auto',              labelAr: 'تلقائي',          icon: '⚡', color: 'text-purple-400' },
  content_strategist: { label: 'Content Expert',    labelAr: 'خبير المحتوى',    icon: '✍️', color: 'text-blue-400' },
  viral_growth:       { label: 'Viral Growth',      labelAr: 'خبير الانتشار',   icon: '🚀', color: 'text-pink-400' },
  premium_brand:      { label: 'Premium Brand',     labelAr: 'الهوية الراقية',  icon: '💎', color: 'text-amber-400' },
  conversion_expert:  { label: 'Conversion',        labelAr: 'خبير التحويل',    icon: '🎯', color: 'text-green-400' },
  account_manager:    { label: 'Account Manager',   labelAr: 'مدير الحسابات',   icon: '🤝', color: 'text-cyan-400' },
  operations_manager: { label: 'Operations',        labelAr: 'مدير العمليات',   icon: '⚙️', color: 'text-orange-400' },
  financial_analyst:  { label: 'Finance Analyst',   labelAr: 'المحلل المالي',   icon: '📊', color: 'text-emerald-400' },
}
