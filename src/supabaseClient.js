import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bwdcsawutdpxhmjubmrj.supabase.co';
const supabaseKey = 'sb_publishable_LjxkXJh4yYyHGPfq8h1y0g_hVSGDQjf';

export const supabase = createClient(supabaseUrl, supabaseKey);
