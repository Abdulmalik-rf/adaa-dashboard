export type Client = {
  id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  company_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  business_type: string | null;
  status: 'lead' | 'active' | 'paused' | 'completed';
  start_date: string | null;
  notes: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  google_business_url: string | null;
  online_presence_notes: string | null;
};

export type ClientService = {
  id: string;
  client_id: string;
  service_name: string;
  created_at: string;
};

export type SocialAccount = {
  id: string;
  client_id: string;
  platform: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  status: 'active' | 'inactive' | 'needs_attention';
  created_at: string;
  updated_at: string;
};

export type Contract = {
  id: string;
  client_id: string;
  title: string;
  contract_type: string;
  start_date: string;
  end_date: string;
  renewal_date: string | null;
  status: 'unsigned' | 'active' | 'expired' | 'ending_soon' | 'renewed';
  value: number | null;
  notes: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Reminder = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  type: string;
  due_date: string;
  due_time: string | null;
  priority: 'low' | 'medium' | 'high';
  is_recurring: boolean;
  status: 'pending' | 'completed';
  created_at: string;
  updated_at: string;
};

export type ContentItem = {
  id: string;
  client_id: string;
  platform: string;
  content_type: string;
  title: string;
  caption: string | null;
  media_url: string | null;
  publish_date: string;
  publish_time: string | null;
  status: 'idea' | 'pending' | 'approved' | 'scheduled' | 'published';
  campaign_name: string | null;
  notes: string | null;
  assigned_person_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientFile = {
  id: string;
  client_id: string;
  name: string;
  category: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
};

export type AdCampaign = {
  id: string;
  client_id: string;
  account_link: string | null;
  name: string;
  budget: number | null;
  objective: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'planned' | 'active' | 'paused' | 'completed';
  notes: string | null;
  performance_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationLog = {
  id: string;
  client_id: string;
  date: string;
  type: string;
  summary: string | null;
  notes: string | null;
  person_id: string | null;
  created_at: string;
};
