import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { OpenClawAssistant } from '@/components/layout/OpenClawAssistant'
import { OpenClawProvider } from '@/lib/openclaw/context'
import { LanguageOpenClawBridge } from '@/components/layout/LanguageOpenClawBridge'
import { createSupabaseServerClient, getCurrentUser } from '@/lib/supabase/server'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'AgencyOS – CRM & Operations Platform',
  description: 'Production-grade agency CRM and operations management dashboard',
}

export const revalidate = 0

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') || ''
  const isAuthRoute =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/auth/')

  let notifications: any[] = []
  let currentUser: any = null

  if (!isAuthRoute) {
    currentUser = await getCurrentUser()
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    notifications = data || []
  }

  return (
    <html lang="en" dir="ltr" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} h-full antialiased`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <LanguageProvider>
          {isAuthRoute ? (
            <>{children}</>
          ) : (
            <OpenClawProvider>
              <LanguageOpenClawBridge />
              <div className="flex h-full min-h-screen bg-[hsl(var(--background))]">
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                  <Header notifications={notifications} currentUser={currentUser} />
                  <main className="flex-1 overflow-y-auto p-4 sm:p-6 page-fade-in text-[hsl(var(--foreground))]">
                    {children}
                  </main>
                </div>
              </div>
              <OpenClawAssistant />
            </OpenClawProvider>
          )}
        </LanguageProvider>
      </body>
    </html>
  )
}
