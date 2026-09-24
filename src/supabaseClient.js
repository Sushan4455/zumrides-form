import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === "undefined" || supabaseUrl.trim?.() === "") {
    supabaseUrl = 'https://placeholder.supabase.co';
}
if (!supabaseKey || supabaseKey === "undefined" || supabaseKey.trim?.() === "") {
    supabaseKey = 'placeholder';
}

export const supabase = createClient(supabaseUrl, supabaseKey);
