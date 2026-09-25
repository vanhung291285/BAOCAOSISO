import { createClient } from '@supabase/supabase-js';

// Use environment variables if available, otherwise use the provided credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jzycmjynzkhevuxyjngv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6eWNtanluemtoZXZ1eHlqbmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTUzODksImV4cCI6MjA4Nzc3MTM4OX0.k9bRVlYvcCKqhDGZspPajyT128e1CfQCcL2Swr76Ayw';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Resilient fetch wrapper with automatic retry on transient network issues (Failed to fetch)
const resilientFetch: typeof fetch = async (input, init) => {
  let attempts = 0;
  const maxAttempts = 3;

  while (true) {
    try {
      return await fetch(input, init);
    } catch (err: any) {
      attempts++;
      const isNetworkErr = 
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network');

      if (attempts >= maxAttempts || !isNetworkErr) {
        throw err;
      }
      // Wait before retrying (400ms, 800ms)
      await new Promise((resolve) => setTimeout(resolve, attempts * 400));
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: resilientFetch
  }
});

