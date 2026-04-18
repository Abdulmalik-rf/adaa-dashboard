import { supabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const revalidate = 0

export default async function ContentCalendarPage() {
  const { data: items } = await (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Content Calendar</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(items as any[])?.map((item: any) => (
          <Card key={item.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <Badge variant={item.schedule_status === 'published' ? 'success' : item.schedule_status === 'scheduled' ? 'default' : 'secondary'}>{item.schedule_status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <Badge variant="outline" className="text-[10px]">{item.platform}</Badge>
                <span>{item.publish_date} {item.publish_time}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!items || (items as any[]).length === 0) && <p className="text-sm text-gray-500">No content items scheduled.</p>}
      </div>
    </div>
  )
}
