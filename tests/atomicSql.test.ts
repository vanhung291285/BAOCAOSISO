import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('atomic SQL rolls back partial saves, detects conflicts and makes retries idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE school_years(id text primary key, is_locked boolean default false);
      CREATE TABLE profiles(id text primary key);
      CREATE TABLE classes(id text primary key, school_year_id text references school_years, active boolean default true);
      CREATE TABLE indicator_groups(id text primary key, code text, enabled boolean default true);
      CREATE TABLE daily_reports(id text primary key default gen_random_uuid()::text, class_id text references classes,
        report_date date, created_by text references profiles, status text default 'DRAFT', notes text,
        absent_students jsonb, reported_time text, created_at timestamptz default now(), updated_at timestamptz default now(),
        unique(class_id,report_date));
      CREATE TABLE daily_report_values(id text primary key default gen_random_uuid()::text,
        report_id text references daily_reports, indicator_group_id text references indicator_groups,
        total_count int, present_count int, absent_count int, updated_at timestamptz default now(),
        unique(report_id, indicator_group_id));
      INSERT INTO school_years VALUES ('year',false); INSERT INTO profiles VALUES ('teacher');
      INSERT INTO classes VALUES ('class','year',true); INSERT INTO indicator_groups VALUES ('all','ALL',true);`);
    const sql = readFileSync(new URL('../migrations/20261114_atomic_attendance.sql', import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(sql); // additive migration can be safely rerun
    const payload = { class_id:'class',report_date:'2026-11-14',created_by:'teacher',absent_students:[] };
    const vals = [{ indicator_group_id:'all', total_count:30, present_count:30, absent_count:0 }];
    const call = async (token:string, version:string|null, data=vals, report=payload) => {
      const result = await db.query<{result:any}>('SELECT save_attendance_atomic($1::jsonb,$2::jsonb,$3::timestamptz,$4) AS result',
        [JSON.stringify(report),JSON.stringify(data),version,token]);
      return result.rows[0].result;
    };
    const first = await call('first',null);
    assert.equal(first.report.status,'SUBMITTED');
    assert.equal(first.report.school_year_id,'year');
    const retry = await call('first',null);
    assert.equal(retry.report.updated_at,first.report.updated_at);
    await assert.rejects(call('other-device',null),/REPORT_CONFLICT/);
    await assert.rejects(call('bad',first.report.updated_at,[{...vals[0],present_count:29}]),/INVALID_ATTENDANCE/);
    // Force a failure AFTER updating the report; entire report change must roll back.
    await db.exec("ALTER TABLE daily_report_values ADD CONSTRAINT limited_present CHECK (present_count <= 30)");
    await assert.rejects(call('partial',first.report.updated_at,[{...vals[0],total_count:31,present_count:31}]));
    const after = await db.query<{updated_at:Date}>('SELECT updated_at FROM daily_reports');
    assert.equal(after.rows[0].updated_at.toISOString(),new Date(first.report.updated_at).toISOString());
    const second = await call('second',first.report.updated_at,[{...vals[0],present_count:29,absent_count:1}]);
    assert.equal(second.report.id,first.report.id);
    assert.equal(second.values[0].id,first.values[0].id);
    await assert.rejects(call('stale',first.report.updated_at),/REPORT_CONFLICT/);
    await db.exec("UPDATE daily_reports SET status='LOCKED'");
    await assert.rejects(call('locked',second.report.updated_at),/REPORT_LOCKED/);
    assert.equal((await db.query('SELECT * FROM daily_reports')).rows.length,1);
  } finally { await db.close(); }
});
