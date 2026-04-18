"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

export async function toggleLanguage(currentLang: string) {
  const newLang = currentLang === 'en' ? 'ar' : 'en'
  const cookieStore = await cookies()
  cookieStore.set('locale', newLang, { path: '/' })
  revalidatePath('/', 'layout')
}
