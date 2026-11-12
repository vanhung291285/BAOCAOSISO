import { createClient } from '@supabase/supabase-js';

// The management password is a separate server-verified credential.
// Never trust an isAdmin flag submitted by the browser.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Chưa cấu hình kết nối Supabase phía máy chủ.' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { action, password, newPassword, managementPassword } = req.body || {};
  try {
    if (action === 'verify') {
      if (typeof password !== 'string' || password.length > 128 || !password) return res.status(400).json({ error: 'Mật khẩu không hợp lệ.' });
      const { data, error } = await db.rpc('boarding_sheet_verify_password', { p_password: password });
      if (error) throw error;
      const verified = Array.isArray(data) ? data[0]?.valid : data?.valid;
      return res.status(verified ? 200 : 401).json(verified ? { ok: true } : { error: 'Mật khẩu không đúng hoặc chưa được thiết lập.' });
    }
    if (action === 'set') {
      if (typeof managementPassword !== 'string' || !managementPassword || managementPassword.length > 128 ||
          typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128)
        return res.status(400).json({ error: 'Mật khẩu mới phải từ 8 đến 128 ký tự.' });
      const { data, error } = await db.rpc('boarding_sheet_admin_set_password', {
        p_management_password: managementPassword, p_new_password: newPassword,
      });
      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'Mật khẩu quản lý không đúng.' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Thao tác không hợp lệ.' });
  } catch (error) {
    console.error('boarding-sheet-access:', error);
    return res.status(503).json({ error: 'Không thể kết nối cấu hình mật khẩu. Kiểm tra SQL và Supabase.' });
  }
}
