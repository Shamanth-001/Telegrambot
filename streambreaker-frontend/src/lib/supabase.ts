import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vfurcocnnloowqcwlbza.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Fl_dI_HcGpwlAoPEYA2u7A_oXrfjDfO';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
