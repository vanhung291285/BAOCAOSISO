import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistDailyReport, validateAttendanceValues } from '../src/services/dailyReportPersistence';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyReport, DailyReportValue } from '../src/types';

const report = { id: 'local-id', created_at: 'old', class_id: 'c_6A1', report_date: '2026-11-14', status: 'SUBMITTED', absent_students: [{ full_name: 'Học sinh thử' }] } as DailyReport;
const values = [{ id: 'local-value', created_at: 'old', report_id: 'local-id', indicator_group_id: 'ALL', total_count: 30, present_count: 29, absent_count: 1 }] as DailyReportValue[];
function fakeClient(reportResult: any, valueResult: any) {
  const writes: { table: string; payload: any; options: any }[] = [];
  const client = { from(table: string) { return { upsert(payload: any, options: any) {
    writes.push({ table, payload, options });
    return { select() { return table === 'daily_reports' ? { single: async () => reportResult } : Promise.resolve(valueResult); } };
  } }; } } as unknown as SupabaseClient;
  return { client, writes };
}
test('uses server report ID for indicators and preserves existing primary keys', async () => {
  const fake = fakeClient({ data: { ...report, id: 'server-id' } }, { data: [{ ...values[0], id: 'server-value', report_id: 'server-id' }] });
  const saved = await persistDailyReport(fake.client, report, values);
  assert.equal(fake.writes.length, 2);
  for (const write of fake.writes) {
    for (const row of Array.isArray(write.payload) ? write.payload : [write.payload]) {
      assert.equal('id' in row, false);
      assert.equal('created_at' in row, false);
    }
  }
  assert.deepEqual(fake.writes[0].payload.absent_students, report.absent_students);
  assert.equal(fake.writes[1].payload[0].report_id, 'server-id');
  assert.equal(saved.values[0].id, 'server-value');
  assert.equal(report.id, 'local-id');
});
test('report failure stops before indicators and is never retried with fields stripped', async () => {
  const error = new Error('schema error');
  const fake = fakeClient({ error }, {});
  await assert.rejects(persistDailyReport(fake.client, report, values), error);
  assert.equal(fake.writes.length, 1);
});
test('partial or rejected indicator writes do not report success', async () => {
  for (const result of [{ error: new Error('offline') }, { data: [] }]) {
    const fake = fakeClient({ data: { ...report, id: 'server-id' } }, result);
    await assert.rejects(persistDailyReport(fake.client, report, values));
  }
});
test('rejects invalid attendance instead of rounding or silently clamping', () => {
  for (const value of [{ total: -1, present: 0, absent: 0 }, { total: 3, present: 1, absent: 1 }, { total: NaN, present: 0, absent: 0 }, { total: 1.5, present: 1, absent: .5 }]) {
    assert.throws(() => validateAttendanceValues({ ALL: value }));
  }
  assert.throws(() => validateAttendanceValues({}));
  validateAttendanceValues({ ALL: { total: 30, present: 29, absent: 1 }, SUB: { total: 0, present: 0, absent: 0 } });
});
