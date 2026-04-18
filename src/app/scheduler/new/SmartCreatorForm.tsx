"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Save, AlertTriangle, RefreshCw, Send, Image as ImageIcon, Calendar as CalIcon, Clock, Home, Search, PlusSquare, PlaySquare, User, Heart, MessageCircle, Share2 } from "lucide-react"
import { createContentItem } from "@/app/actions/content"

export default function SmartCreatorForm({ clients, teamMembers, t }: { clients: any[], teamMembers: any[], t: any }) {
  const [platform, setPlatform] = useState('instagram')
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState(teamMembers[0]?.id || '')
  const [topic, setTopic] = useState('')
  const [contentType, setContentType] = useState('post')
  
  // Smart Content States
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [publishDate, setPublishDate] = useState('')
  const [publishTime, setPublishTime] = useState('')
  
  // AI Suggestions
  const [suggestions, setSuggestions] = useState<any>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  const generateSuggestions = async () => {
    if (!clientId || !topic) {
       alert('Please select a client and enter a topic first!')
       return
    }
    const clientInfo = clients.find(c => c.id === clientId)
    setIsGenerating(true)
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          industry: clientInfo?.business_type || 'General Business',
          topic
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuggestions(data.suggestions)
        // Auto-fill fields with best options
        setCaption(data.suggestions.captions[0])
        setHashtags(data.suggestions.hashtags)
        setPublishTime(data.suggestions.bestTime)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsGenerating(false)
    }
  }

  // Live Validation
  useEffect(() => {
    const warnings = []
    if (caption.length > 0 && caption.length < 20) warnings.push('Caption is very short. Consider elaborating.')
    if (platform === 'instagram' && hashtags.split('#').length < 4) warnings.push('Too few hashtags for Instagram. Aim for 5-10.')
    if (platform === 'tiktok' && captionsContainsQuestion(caption) === false) warnings.push('TikTok captions perform better with a hook/question.')
    if (platform === 'google_ads' && !caption.toLowerCase().includes('click') && !caption.toLowerCase().includes('get')) warnings.push('Google Ads copy needs a strong Call to Action (CTA).')
    setValidationWarnings(warnings)
  }, [caption, hashtags, platform])

  const captionsContainsQuestion = (cap: string) => cap.includes('?')

  return (
    <div className="grid lg:grid-cols-12 gap-8">
      {/* Left Column: Creator Form */}
      <div className="lg:col-span-7 space-y-6">
        <form action={(formData) => createContentItem(formData, platform)} className="space-y-6">
          <Card className="border-indigo-100 shadow-sm">
            <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 pb-4 border-b border-indigo-50">
               <div className="flex justify-between items-center">
                 <CardTitle className="text-lg">1. Campaign Details</CardTitle>
                 <select 
                   value={platform} 
                   onChange={(e) => setPlatform(e.target.value)}
                   className="text-sm font-semibold p-2 border border-gray-200 rounded-md bg-white dark:bg-gray-900 shadow-sm"
                 >
                   <option value="instagram">Instagram</option>
                   <option value="tiktok">TikTok</option>
                   <option value="snapchat">Snapchat</option>
                   <option value="google_ads">Google Ads</option>
                 </select>
               </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-semibold text-gray-500 uppercase">Client</label>
                   <select 
                     name="client_id"
                     value={clientId}
                     onChange={(e) => setClientId(e.target.value)}
                     className="w-full mt-1 p-2 border rounded-md dark:bg-gray-900"
                   >
                     {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-gray-500 uppercase">Assignee (Creator)</label>
                   <select 
                     name="assignee_id"
                     value={assigneeId}
                     onChange={(e) => setAssigneeId(e.target.value)}
                     className="w-full mt-1 p-2 border rounded-md dark:bg-gray-900"
                   >
                     {teamMembers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                   </select>
                 </div>
               </div>
               
               <div>
                 <label className="text-xs font-semibold text-gray-500 uppercase">Content Topic / Angle</label>
                 <input 
                   name="title"
                   value={topic}
                   onChange={e => setTopic(e.target.value)}
                   placeholder="e.g. 3 Tips for Winter Skincare"
                   className="w-full mt-1 p-2 border rounded-md dark:bg-gray-900" 
                   required
                 />
                 <input type="hidden" name="content_type" value={contentType} />
               </div>

               <Button 
                 type="button" 
                 onClick={generateSuggestions} 
                 disabled={isGenerating || !topic}
                 className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
               >
                 {isGenerating ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                 AI Strategist: Generate Smart Strategy
               </Button>
            </CardContent>
          </Card>

          {suggestions && (
            <Card className="border-green-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 relative">
              {validationWarnings.length > 0 && (
                <div className="absolute -top-3 right-4 bg-orange-100 border border-orange-200 text-orange-800 text-xs px-3 py-1 rounded-full flex gap-1 items-center shadow-sm z-10">
                  <AlertTriangle className="h-3 w-3" /> Fix warnings below
                </div>
              )}
              <CardHeader className="bg-green-50/50 dark:bg-green-950/20 pb-4 border-b border-green-50">
                 <CardTitle className="text-lg">2. Optimize Content</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                 
                 {/* Hook / Idea */}
                 <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md border border-blue-100 dark:border-blue-800">
                   <p className="text-xs font-bold text-blue-600 dark:text-blue-400 capitalize mb-1">Recommended Visual Hook</p>
                   <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{suggestions.hook}</p>
                   <p className="text-xs text-gray-500 mt-1 italic">Cover Idea: {suggestions.coverIdea}</p>
                 </div>

                 {/* Caption Editor */}
                 <div>
                   <label className="text-xs font-semibold text-gray-500 uppercase flex justify-between">
                     Caption
                     <span className="text-indigo-600 font-normal cursor-pointer hover:underline text-[10px]" onClick={() => setCaption(suggestions.captions[1] || caption)}>Try Alternate V2</span>
                   </label>
                   <textarea 
                     name="caption"
                     value={caption}
                     onChange={(e) => setCaption(e.target.value)}
                     className="w-full mt-1 p-3 min-h-[100px] border rounded-md dark:bg-gray-900 text-sm focus:ring-2 ring-indigo-500 outline-none"
                     required
                   />
                 </div>

                 {/* Hashtags Editor */}
                 <div className="relative group">
                   <label className="text-xs font-semibold text-gray-500 uppercase flex justify-between items-center">
                     Optimization Tags
                     <button 
                       type="button" 
                       onClick={() => {
                         navigator.clipboard.writeText(hashtags);
                         alert('Hashtags copied!');
                       }}
                       className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold"
                     >
                       COPY TAGS
                     </button>
                   </label>
                   <textarea 
                     name="hashtags"
                     value={hashtags}
                     onChange={(e) => setHashtags(e.target.value)}
                     className="w-full mt-1 p-2 border rounded-md dark:bg-gray-900 text-sm text-blue-600 dark:text-blue-400 font-medium"
                   />
                 </div>

                 {/* Approval System (Manager/Admin View) */}
                 <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 space-y-3">
                    <label className="text-xs font-bold text-gray-400 uppercase">Workflow & Approval</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Approval Status</label>
                        <select className="w-full p-2 text-xs border rounded-md dark:bg-gray-950">
                          <option value="pending">Pending Review</option>
                          <option value="approved">Approved & Clear</option>
                          <option value="needs_edits">Needs Edits</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Strategic Score</label>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(s => (
                            <div key={s} className={`h-2 flex-1 rounded-full ${validationWarnings.length === 0 ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Manager Feedback / Revision Notes</label>
                        <textarea placeholder="Add internal notes for the creator..." className="w-full p-2 text-xs border rounded-md dark:bg-gray-950 min-h-[60px]" />
                    </div>
                 </div>

                 {/* Scheduling ... (Existing Code) */}
                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><CalIcon className="h-3 w-3"/> Publish Date</label>
                      <input type="date" name="publish_date" value={publishDate} onChange={e=>setPublishDate(e.target.value)} className="w-full p-2 border rounded-md dark:bg-gray-900 text-sm" required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> Publish Time</span>
                        <span className="text-[10px] text-green-600 font-normal">AI Rec: {suggestions.bestTime}</span>
                      </label>
                      <input type="time" name="publish_time" value={publishTime} onChange={e=>setPublishTime(e.target.value)} className="w-full p-2 border rounded-md dark:bg-gray-900 text-sm" required />
                    </div>
                 </div>

                 {/* Live Warnings */}
                 {validationWarnings.length > 0 && (
                   <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-md border border-red-100 flex flex-col gap-1">
                     {validationWarnings.map((w, i) => (
                       <span key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> {w}</span>
                     ))}
                   </div>
                 )}

                 <div className="pt-4 flex gap-3">
                   <Button type="button" variant="outline" className="flex-1" onClick={() => alert('Sent to Review successfully')}>
                     <Save className="mr-2 h-4 w-4" /> Save as Draft
                   </Button>
                   <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white" disabled={validationWarnings.length > 0}>
                     <Send className="mr-2 h-4 w-4" /> Schedule Content
                   </Button>
                 </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>

      {/* Right Column: Live Phone Preview */}
      <div className="lg:col-span-5 hidden lg:block border-l pl-8 dark:border-gray-800 sticky top-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-6 flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Live Preview
        </h3>
        <div className="w-[300px] h-[600px] bg-black rounded-[40px] border-[8px] border-gray-900 mx-auto overflow-hidden relative shadow-2xl">
          {/* Mock Video BG */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-purple-900 opacity-60"></div>
          
          <div className="absolute top-12 left-4 right-4 flex justify-between items-center z-10 text-white">
             <span className="font-bold drop-shadow-md">{clients.find(c=>c.id===clientId)?.company_name || 'Brand'}</span>
             <Badge className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border-0 font-bold">Follow</Badge>
          </div>

          {!suggestions ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-8 text-center">
              <Sparkles className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">Click "Generate Smart Strategy" to preview your content here.</p>
            </div>
          ) : (
            <>
              {/* Fake UI Overlays */}
              <div className="absolute right-3 bottom-32 flex flex-col gap-4 text-white drop-shadow-lg">
                <div className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30"><Heart className="h-6 w-6"/></div>
                <div className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30"><MessageCircle className="h-6 w-6"/></div>
                <div className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30"><Share2 className="h-6 w-6"/></div>
              </div>
              
              <div className="absolute bottom-8 left-4 right-16 z-10 text-white drop-shadow-md">
                 <p className="text-sm font-semibold mb-1">
                   {platform === 'tiktok' ? <span className="bg-red-500 px-1 rounded text-[10px] mr-1 uppercase">Promoted</span> : ''}
                   {topic}
                 </p>
                 <div className="text-sm whitespace-pre-wrap max-h-32 overflow-y-auto pr-2 no-scrollbar">
                   {caption}
                   <br/><br/>
                   <span className="text-blue-300 font-medium">{hashtags}</span>
                 </div>
              </div>
            </>
          )}

          {/* Fake Bottom Nav */}
          <div className="absolute bottom-0 inset-x-0 h-10 bg-black/80 backdrop-blur-md flex justify-around items-center text-white/60">
             <Home className="h-5 w-5"/>
             <Search className="h-5 w-5"/>
             <PlusSquare className="h-5 w-5 text-white"/>
             <PlaySquare className="h-5 w-5"/>
             <User className="h-5 w-5"/>
          </div>
        </div>
      </div>
    </div>
  )
}

