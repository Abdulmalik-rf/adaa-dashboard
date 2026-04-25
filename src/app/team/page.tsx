import { supabaseClient } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Settings, Trash2, Mail, Phone, Shield, Users } from "lucide-react"
import { getDictionary } from "@/lib/i18n"
import { AddTeamMemberModal } from "./AddTeamMemberModal"
import { deleteTeamMember } from "@/app/actions/team"
import { TeamWorkload } from "./TeamWorkload"

export const revalidate = 0

export default async function TeamPage() {
  const t = await getDictionary()

  const [
    { data: teamMembers },
    { data: tasks }
  ] = await Promise.all([
    (supabaseClient as any).from('team_members').select('*').order('created_at', { ascending: true }),
    (supabaseClient as any).from('tasks').select('*')
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white dark:bg-gray-950 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div>
           <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{t.teamManagement}</h1>
           <p className="text-gray-500 text-sm mt-1">Manage your agency's staff and permissions</p>
        </div>
        <AddTeamMemberModal t={t} />
      </div>

      <TeamWorkload members={teamMembers || []} tasks={tasks || []} />

      <div className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50 dark:bg-gray-900/50">
            <TableRow>
              <TableHead className="py-4">Member</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Role & Position</TableHead>
              <TableHead>Salary / mo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers?.map((member: any) => (
              <TableRow key={member.id} className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/50">
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                       {member.full_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">{member.full_name}</div>
                      <div className="text-xs text-gray-500">{member.job_title}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="text-xs flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <Mail className="h-3 w-3" /> {member.email}
                    </div>
                    {member.phone && (
                      <div className="text-xs flex items-center gap-1.5 text-gray-500">
                        <Phone className="h-3 w-3" /> {member.phone}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                   <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit text-[10px] uppercase font-bold tracking-wider">
                         <Shield className="h-2 w-2 mr-1" /> {member.role}
                      </Badge>
                   </div>
                </TableCell>
                <TableCell>
                  {member.salary != null ? (
                    <div>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(member.salary).toLocaleString('en-US')} <span className="text-[10px] font-medium opacity-60">{member.salary_currency || 'SAR'}</span>
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">not set</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={member.status === 'active' ? 'success' : 'secondary'} className="rounded-full px-3">
                    {member.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <form action={deleteTeamMember.bind(null, member.id)}>
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                       </Button>
                    </form>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                       <Settings className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!teamMembers || teamMembers.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-gray-200" />
                    <p>No team members found.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
