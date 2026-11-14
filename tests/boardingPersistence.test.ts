import {test} from 'node:test';
import assert from 'node:assert/strict';
import {persistBoardingReports} from '../src/services/boardingPersistence';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {BoardingDailyReport} from '../src/types';
const r={id:'local',class_id:'a',date:'2026-11-14',total_boarding_students:20,breakfast_count:19,lunch_count:19,dinner_count:0,absent_count:1,total_meals:38} as BoardingDailyReport;
test('boarding waits for cloud confirmation and keeps stable primary keys',async()=>{
 const client={from:()=>({upsert:(rows:any[])=>{assert.equal('id' in rows[0],false);return {select:async()=>({data:[{...r,id:'cloud'}]})};}})} as unknown as SupabaseClient;
 assert.equal((await persistBoardingReports(client,[r]))[0].id,'cloud');
 await assert.rejects(persistBoardingReports(null,[r]));
});
test('boarding rejects invalid totals and cloud failures',async()=>{
 const client={from:()=>({upsert:()=>({select:async()=>({error:{message:'offline'}})})})} as unknown as SupabaseClient;
 await assert.rejects(persistBoardingReports(client,[r]),/offline/);
 await assert.rejects(persistBoardingReports(client,[{...r,lunch_count:22}]),/không hợp lệ/);
});
