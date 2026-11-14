import {test} from 'node:test';
import assert from 'node:assert/strict';
import {persistDailyReport,validateAttendanceValues,AttendanceSaveError} from '../src/services/dailyReportPersistence';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {DailyReport,DailyReportValue} from '../src/types';
const report={id:'local',class_id:'class',report_date:'2026-11-14',created_by:'teacher',status:'SUBMITTED',updated_at:'2026-11-14T00:00:00Z',absent_students:[]} as DailyReport;
const values=[{id:'v',report_id:'local',indicator_group_id:'all',total_count:30,present_count:30,absent_count:0}] as DailyReportValue[];
test('uses one RPC with loaded version and stable retry token, not separate writes',async()=>{
  let calls=0;
  const client={rpc:async(name:string,args:any)=>{
    calls++;assert.equal(name,'save_attendance_atomic');assert.equal(args.p_expected_updated_at,report.updated_at);
    assert.equal(args.p_request_id,'retry-token');assert.equal('id' in args.p_report,false);
    return {data:{report:{...report,id:'server'},values:[{...values[0],report_id:'server'}]}};
  }} as unknown as SupabaseClient;
  const result=await persistDailyReport(client,report,values,report.updated_at,'retry-token');
  assert.equal(calls,1);assert.equal(result.report.id,'server');assert.equal(result.values[0].report_id,'server');
});
test('missing migration and conflicts never fall back to non-atomic writes',async()=>{
  for(const [error,kind] of [[{code:'PGRST202',message:'missing'},'setup'],[{message:'REPORT_CONFLICT'},'conflict'],[{message:'REPORT_LOCKED'},'locked']] as const){
    const client={rpc:async()=>({error})} as unknown as SupabaseClient;
    await assert.rejects(persistDailyReport(client,report,values,null,'token'),(e:unknown)=>e instanceof AttendanceSaveError&&e.kind===kind);
  }
});
test('partial response is not acknowledged',async()=>{
  const client={rpc:async()=>({data:{report,values:[]}})} as unknown as SupabaseClient;
  await assert.rejects(persistDailyReport(client,report,values,null,'token'));
});
test('rejects invalid attendance',()=>{
  for(const v of [{total:-1,present:0,absent:0},{total:3,present:1,absent:1},{total:NaN,present:0,absent:0},{total:1.5,present:1,absent:.5}]) assert.throws(()=>validateAttendanceValues({all:v}));
  assert.throws(()=>validateAttendanceValues({}));validateAttendanceValues({all:{total:30,present:29,absent:1}});
});
