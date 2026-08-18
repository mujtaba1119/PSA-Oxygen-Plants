import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

const SUPABASE_URL = 'https://ayjrzrgrepjwtowjccsb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5anJ6cmdyZXBqd3Rvd2pjY3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTk4NDksImV4cCI6MjEwMTY5NTg0OX0.IWHrYex21hrXgCnsc1IW0mnfl3Arf5sMVcPvL1CAl6M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const API_BASE = 'https://oxytrack.pk';
