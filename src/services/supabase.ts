import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConnectionStatus {
  connected: boolean;
  url: string;
  maskedKey: string;
  latencyMs?: number;
  message: string;
  tablesStatus?: Record<string, boolean>;
}

// Get Supabase credentials from localStorage (both key formats supported) or import.meta.env
export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const localUrl =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('sso_supabase_url') ||
        localStorage.getItem('app_custom_supabase_url'))) ||
    '';
  const localKey =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('sso_supabase_anon_key') ||
        localStorage.getItem('app_custom_supabase_key'))) ||
    '';

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: (localUrl || envUrl).trim(),
    anonKey: (localKey || envKey).trim(),
  };
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  if (typeof window === 'undefined') return;

  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

  if (cleanUrl && cleanKey) {
    localStorage.setItem('sso_supabase_url', cleanUrl);
    localStorage.setItem('sso_supabase_anon_key', cleanKey);
    localStorage.setItem('app_custom_supabase_url', cleanUrl);
    localStorage.setItem('app_custom_supabase_key', cleanKey);
  } else {
    localStorage.removeItem('sso_supabase_url');
    localStorage.removeItem('sso_supabase_anon_key');
    localStorage.removeItem('app_custom_supabase_url');
    localStorage.removeItem('app_custom_supabase_key');
  }

  // Invalidate cached client to recreate on next call
  cachedClient = null;
  lastUrl = '';
  lastKey = '';
}

let cachedClient: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey) {
    return null;
  }

  if (cachedClient && lastUrl === url && lastKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastUrl = url;
    lastKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function isSupabaseConnected(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  return Boolean(url && anonKey && url.startsWith('http'));
}

/**
 * Actively test connection to Supabase and verify which tables are accessible
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const { url, anonKey } = getSupabaseCredentials();
  const maskedKey = anonKey ? `${anonKey.substring(0, 10)}...${anonKey.substring(anonKey.length - 6)}` : '';

  if (!url || !anonKey) {
    return {
      connected: false,
      url,
      maskedKey,
      message: 'Chưa cấu hình URL hoặc API Key của Supabase.',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      url,
      maskedKey,
      message: 'Không thể khởi tạo kết nối Supabase Client.',
    };
  }

  const startTime = Date.now();
  const tablesStatus: Record<string, boolean> = {};

  const requiredTables = [
    'school_settings',
    'school_years',
    'campuses',
    'profiles',
    'classes',
    'indicator_groups',
    'daily_reports',
    'daily_report_values',
    'system_logs',
  ];

  try {
    // Test basic query to school_settings
    const { error } = await client.from('school_settings').select('id').limit(1);
    const latencyMs = Date.now() - startTime;

    if (error) {
      // If table does not exist
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          connected: true, // URL & key are valid, but tables not yet created
          url,
          maskedKey,
          latencyMs,
          message: 'Kết nối Supabase thành công, nhưng các bảng dữ liệu chưa được khởi tạo. Vui lòng chạy kịch bản SQL schema trong Supabase SQL Editor.',
          tablesStatus: { school_settings: false },
        };
      }

      return {
        connected: false,
        url,
        maskedKey,
        latencyMs,
        message: `Lỗi kết nối Supabase (${error.code || 'ERR'}): ${error.message}`,
      };
    }

    tablesStatus.school_settings = true;

    // Check presence of other tables
    await Promise.all(
      requiredTables.slice(1).map(async (tableName) => {
        try {
          const { error: tErr } = await client.from(tableName).select('id').limit(1);
          tablesStatus[tableName] = !tErr;
        } catch {
          tablesStatus[tableName] = false;
        }
      })
    );

    const missingTables = requiredTables.filter((t) => !tablesStatus[t]);

    if (missingTables.length > 0) {
      return {
        connected: true,
        url,
        maskedKey,
        latencyMs,
        message: `Đã kết nối Supabase (${latencyMs}ms). Cần bổ sung bảng: ${missingTables.join(', ')}. Hãy chạy kịch bản SQL Schema.`,
        tablesStatus,
      };
    }

    return {
      connected: true,
      url,
      maskedKey,
      latencyMs,
      message: `Kết nối Supabase hoàn hảo (${latencyMs}ms)! Toàn bộ ${requiredTables.length} bảng dữ liệu đã sẵn sàng.`,
      tablesStatus,
    };
  } catch (err: any) {
    return {
      connected: false,
      url,
      maskedKey,
      message: `Không thể kết nối tới Supabase: ${err?.message || err}`,
    };
  }
}
