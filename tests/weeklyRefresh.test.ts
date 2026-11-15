import test from 'node:test';
import assert from 'node:assert/strict';
import {StorageService,getCached,setCached,invalidateCache} from '../src/services/storage';

test('attendance and meal updates invalidate weekly totals without clearing unrelated caches',()=>{
 for(const table of ['daily_reports','daily_report_values','boarding_reports']){
  setCached('weekly_aggregate_w11_2026-09-07_all_all',{old:true});
  setCached('school_settings',{keep:true});
  invalidateCache(table);
  assert.equal(getCached('weekly_aggregate_w11_2026-09-07_all_all'),null);
  assert.deepEqual(getCached('school_settings'),{keep:true});
 }
 invalidateCache();
});

test('week 11 refresh shows Monday 9D8 submission after an empty week was cached',async()=>{
 const names=['getSchoolSettings','getClasses','getCampuses','getProfiles','getIndicatorGroups','getBoardingReports','getStudents'] as const;
 const originals=Object.fromEntries(names.map(n=>[n,StorageService[n]]));
 const oldStorage=globalThis.localStorage;
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 Object.assign(StorageService,{
  getSchoolSettings:async()=>({week1_start_date:'2026-09-07'}),
  getClasses:async()=>[{id:'c_9d8',class_name:'9D8',grade:9,campus_id:'suoi-lu',active:true,student_count:36}],
  getCampuses:async()=>[{id:'suoi-lu',name:'Suối Lư'}],getProfiles:async()=>[],
  getIndicatorGroups:async()=>[{id:'ig_all',code:'ALL',name:'Toàn lớp'}],
  getBoardingReports:async()=>[],getStudents:async()=>[],
 });
 try{
  invalidateCache();
  const initial=await StorageService.getWeeklyAggregate(11,'2026-09-07');
  assert.equal(initial.startDate,'2026-11-16');assert.equal(initial.classesSummary[0].totalSessionsReported,0);
  values.set('sso_daily_reports_v1',JSON.stringify([{id:'submitted-report',class_id:'c_9d8',report_date:'2026-11-16',status:'SUBMITTED',submitted_at:'2026-11-16T00:00:00Z'}]));
  values.set('sso_daily_report_values_v1',JSON.stringify([{report_id:'submitted-report',indicator_group_id:'ig_all',total_count:36,present_count:34,absent_count:2}]));
  const refreshed=await StorageService.getWeeklyAggregate(11,'2026-09-07',undefined,undefined,true);
  assert.equal(refreshed.classesSummary[0].days[0].isReported,true);
  assert.equal(refreshed.classesSummary[0].days[0].present,34);
  assert.equal(refreshed.schoolTotals.dayTotals[0].reportedCount,1);
  assert.equal(refreshed.schoolTotals.totalWeeklyAbsent,2);
  assert.equal(refreshed.classesSummary[0].days[1].isReported,false);
 }finally{
  Object.assign(StorageService,originals);invalidateCache();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:oldStorage});
 }
});
