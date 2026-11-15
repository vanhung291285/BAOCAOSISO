import test from 'node:test';
import assert from 'node:assert/strict';
import dropout from '../api/ai/dropout-prediction';
import individual from '../api/ai/individual-assessment';
import report from '../api/ai/class-report-summary';
import remarks from '../api/ai/student-periodic-remarks';
import { postAI } from '../src/services/aiTeacherAssistantService';
const res=()=>({code:0,body:null as any,status(n:number){this.code=n;return this;},json(b:any){this.body=b;return this;}});
const pairs:any[]=[[dropout,{schoolName:'Test',stats:{},highRiskStudents:[],recentAbsentRecords:[]}],[individual,{student:{full_name:'Synthetic'},absenceHistory:{recentAbsences:[]},riskScore:0}],[report,{className:'Test',periodType:'WEEK',attendanceStats:{},absentDetails:[]}],[remarks,{className:'Test',studentsData:[{id:'test',full_name:'Synthetic'}]}]];
test('all report routes reject invalid data and missing server key without fabricated success',async()=>{
 const old=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 try{for(const [handler,body]of pairs){let r=res();await handler({method:'POST',headers:{},body:{}},r);assert.equal(r.code,400);r=res();await handler({method:'POST',headers:{},body},r);assert.equal(r.code,503);assert.equal(r.body.success,false);assert.equal(r.body.data,undefined);}}finally{if(old!==undefined)process.env.GEMINI_API_KEY=old;}
});
test('malformed provider JSON cannot become a report',async()=>{
 const old=process.env.GEMINI_API_KEY,fetchBefore=globalThis.fetch;process.env.GEMINI_API_KEY='test';globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{}'}]}}]}));
 try{const r=res();await dropout({method:'POST',headers:{},body:pairs[0][1]},r);assert.equal(r.code,502);assert.equal(r.body.success,false);}finally{globalThis.fetch=fetchBefore;if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('client propagates provider error instead of inventing a report',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:false,error:'Google Gemini tạm thời quá tải'}),{status:503});try{await assert.rejects(()=>postAI('/api/ai/class-report-summary',{}),/quá tải/);}finally{globalThis.fetch=old;}});
