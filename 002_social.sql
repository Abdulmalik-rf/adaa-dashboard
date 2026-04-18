-- Content Items Expansion
ALTER TABLE public.content_items 
ADD COLUMN platform TEXT CHECK (platform IN ('instagram', 'tiktok', 'snapchat', 'google_ads')),
ADD COLUMN content_type TEXT CHECK (content_type IN ('reel', 'post', 'story', 'ad')),
ADD COLUMN caption TEXT,
ADD COLUMN publish_date DATE,
ADD COLUMN publish_time TIME,
ADD COLUMN schedule_status TEXT DEFAULT 'idea' CHECK (schedule_status IN ('idea', 'pending', 'approved', 'scheduled', 'published')),
ADD COLUMN assignee_id UUID REFERENCES public.team_members(id),
ADD COLUMN task_status TEXT DEFAULT 'not_started' CHECK (task_status IN ('not_started', 'in_progress', 'completed')),
ADD COLUMN completed_at TIMESTAMPTZ,
ADD COLUMN campaign_name TEXT;

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID, -- target user (can be admin or employee)
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT, -- 'task_assigned', 'task_completed', 'task_overdue', 'schedule_reminder'
    related_id UUID, -- Can be task_id, content_id, etc.
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
