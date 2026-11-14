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

// PostgreSQL owns primary keys and creation timestamps. Omitting them from the
// upsert keeps existing references stable even when two devices create a report.
// These two requests are not a transaction; never acknowledge a partial save.
export async function persistDailyReport(client: SupabaseClient, report: DailyReport, values: DailyReportValue[]) {
  const { id: _id, created_at: _createdAt, ...payload } = report;
  const { data: savedReport, error: reportError } = await client.from('daily_reports')
    .upsert(payload, { onConflict: 'class_id,report_date' }).select('*').single();
  if (reportError) throw reportError;
  if (!savedReport?.id) throw new Error('Máy chủ chưa trả về mã báo cáo đã lưu.');
  const cloudValues = values.map(({ id: _valueId, created_at: _valueCreatedAt, ...value }) => ({
    ...value, report_id: savedReport.id,
  }));
  const { data: savedValues, error: valueError } = await client.from('daily_report_values')
    .upsert(cloudValues, { onConflict: 'report_id,indicator_group_id' }).select('*');
  if (valueError) throw valueError;
  if (!savedValues || savedValues.length !== values.length) {
    throw new Error('Máy chủ chưa xác nhận đủ các chỉ tiêu.');
  }
  return { report: savedReport as DailyReport, values: savedValues as DailyReportValue[] };
}
