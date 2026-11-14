import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyReport, DailyReportValue } from '../types';

export function validateAttendanceValues(values: Record<string, { total: number; present: number; absent: number }>) {
  if (!Object.keys(values).length) throw new Error('Chưa có chỉ tiêu để lưu báo cáo.');
  for (const value of Object.values(values)) {
    if (![value.total, value.present, value.absent].every(n => Number.isSafeInteger(n) && n >= 0)) {
      throw new Error('Sĩ số phải là số nguyên không âm.');
    }
    if (value.present + value.absent !== value.total) {
      throw new Error('Số có mặt cộng số vắng phải bằng tổng sĩ số.');
    }
  }
}

export class AttendanceSaveError extends Error {
  constructor(public kind: 'conflict' | 'locked' | 'setup' | 'network' | 'invalid', message: string) {
    super(message); this.name = 'AttendanceSaveError';
  }
}

// One RPC transaction: no fallback to separate writes if migration is missing.
export async function persistDailyReport(client: SupabaseClient, report: DailyReport, values: DailyReportValue[], expectedUpdatedAt: string | null = null, requestId: string = crypto.randomUUID()) {
  const { data, error } = await client.rpc('save_attendance_atomic', {
    p_report: { class_id: report.class_id, report_date: report.report_date, created_by: report.created_by,
      notes: report.notes ?? '', absent_students: report.absent_students ?? [] },
    p_values: values.map(v => ({ indicator_group_id: v.indicator_group_id, total_count: v.total_count,
      present_count: v.present_count, absent_count: v.absent_count })),
    p_expected_updated_at: expectedUpdatedAt, p_request_id: requestId,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('REPORT_CONFLICT')) throw new AttendanceSaveError('conflict', 'Báo cáo đã thay đổi trên thiết bị khác. Bản nhập được giữ lại; hãy tải bản mới và đối chiếu trước khi gửi.');
    if (msg.includes('REPORT_LOCKED')) throw new AttendanceSaveError('locked', 'Báo cáo hoặc năm học đã khóa. Liên hệ quản trị để kiểm tra.');
    if (error.code === 'PGRST202' || msg.includes('Could not find the function')) throw new AttendanceSaveError('setup', 'Cần cập nhật cơ sở dữ liệu: quản trị chạy migrations/20261114_atomic_attendance.sql trước khi lưu.');
    if (msg.includes('INVALID_ATTENDANCE')) throw new AttendanceSaveError('invalid', msg.replace('INVALID_ATTENDANCE: ', ''));
    throw new AttendanceSaveError('network', 'Máy chủ chưa xác nhận lưu. Giữ bản nháp và thử gửi lại; không gửi lại bằng biểu mẫu khác.');
  }
  if (!data?.report?.id || !Array.isArray(data.values) || data.values.length !== values.length) {
    throw new AttendanceSaveError('network', 'Phản hồi lưu chưa đầy đủ. Giữ bản nháp để kiểm tra lại.');
  }
  return { report: data.report as DailyReport, values: data.values as DailyReportValue[] };
}
