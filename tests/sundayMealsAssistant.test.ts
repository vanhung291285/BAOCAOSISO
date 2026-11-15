import test from 'node:test';
import assert from 'node:assert/strict';
import {plannedMeals} from '../src/services/mealPlanning';
import {buildOperationsSnapshot,answerOperationsQuestion} from '../src/services/operationsInsights';
import {isSchoolDataQuestion} from '../src/services/assistantRouting';
import type {ClassItem,BoardingDailyReport,SchoolOffDay} from '../src/types';
import chatHandler from '../api/ai/chat-assistant';
const classes=[{id:'a',active:true,campus_id:'a',class_name:'6A1'},{id:'b',active:true,campus_id:'b',class_name:'6A2'}] as ClassItem[];
const report=(date:string,class_id='a',extra={})=>({class_id,date,status:'SUBMITTED',total_boarding_students:20,breakfast_count:18,lunch_count:20,dinner_count:19,updated_at:'2026-11-15T00:00:00Z',...extra}) as BoardingDailyReport;
test('Sunday never creates meals, even with a stale submitted report',()=>{
 const p=plannedMeals('2026-11-15',classes,[report('2026-11-15')],{},[]);
 assert.equal(p.breakfast+p.lunch+p.dinner,0);assert.equal(p.open,0);assert.match(p.notes,/Ngày nghỉ/);
 const s=buildOperationsSnapshot('2026-11-15',classes,[],[],[]);
 assert.equal(s.totals.missing,0);assert.equal(s.totals.classes,0);assert.equal(s.totals.rate,null);
 assert.match(answerOperationsQuestion('Lớp nào chưa báo?',s),/GVCN không phải báo cáo/);
});
test('no registrations is unknown, never a roster-based prediction',()=>{
 const p=plannedMeals('2026-11-16',classes,[],{},[]);
 assert.equal(p.lunch,0);assert.equal(p.submitted,0);assert.equal(p.open,2);assert.match(p.notes,/Chưa đủ đăng ký/);
});
test('meals respect submitted state, date, scope, configured Friday and campus holidays',()=>{
 const off=[{date:'2026-11-20',name:'Nghỉ riêng',applies_to:'b'}] as SchoolOffDay[];
 const p=plannedMeals('2026-11-20',classes,[report('2026-11-20'),report('2026-11-20','b'),report('2026-11-20','outside'),report('2026-11-19')],{friday_dinner:false},off);
 assert.equal(p.breakfast,18);assert.equal(p.lunch,20);assert.equal(p.dinner,0);assert.equal(p.open,1);
 assert.equal(plannedMeals('2026-11-16',classes,[report('2026-11-16','a',{status:'DRAFT'})],{},[]).lunch,0);
 assert.equal(plannedMeals('2026-11-16',classes,[report('2026-11-16','a',{lunch_count:500})],{},[]).lunch,0);
});
test('knowledge questions use model; private operational and password questions stay local',()=>{
 for(const q of ['Lớp nào chưa báo?','Hôm nay học sinh nào vắng?','Mật khẩu mở sổ chấm cơm?','Sĩ số lớp 6A1'])assert.equal(isSchoolDataQuestion(q),true,q);
 for(const q of ['Giải phương trình 2x + 3 = 7','Giải thích quang hợp','Soạn hoạt động khởi động tiết Toán','Viết một bài thơ về mùa xuân'])assert.equal(isSchoolDataQuestion(q),false,q);
});
test('AI endpoint reports missing configuration instead of fabricating a model response',async()=>{
 const before=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 const response:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:unknown){this.body=b;return this;}};
 try{await chatHandler({method:'POST',headers:{host:'localhost'},body:{message:'Giải thích quang hợp'}},response);assert.equal(response.code,503);assert.match(response.body.error,/GEMINI_API_KEY/);}finally{if(before!==undefined)process.env.GEMINI_API_KEY=before;}
});
test('GenerateContent returns final text and excludes thought parts',async()=>{
 const before=process.env.GEMINI_API_KEY,originalFetch=globalThis.fetch;
 process.env.GEMINI_API_KEY='test-placeholder';
 let sent:any;
 globalThis.fetch=async(_url:any,options:any)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'internal'},{text:'Tỉ lệ thức là đẳng thức của hai tỉ số.'}]}}]}),{status:200,headers:{'Content-Type':'application/json'}});};
 const response:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:unknown){this.body=b;return this;}};
 try{await chatHandler({method:'POST',headers:{host:'localhost','x-forwarded-for':'test-interaction'},body:{message:'Tỉ lệ thức là gì?'}},response);assert.equal(response.code,200);assert.match(response.body.data.reply,/đẳng thức/);assert.doesNotMatch(response.body.data.reply,/internal/);assert.equal(sent.generationConfig.maxOutputTokens,4096);}finally{globalThis.fetch=originalFetch;if(before===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;}
});
test('provider credential errors are classified without exposing provider response details',async()=>{
 const before=process.env.GEMINI_API_KEY,originalFetch=globalThis.fetch;
 process.env.GEMINI_API_KEY='test-placeholder';
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'API key not valid. sensitive-provider-debug'}}),{status:400});
 const response:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:unknown){this.body=b;return this;}};
 try{await chatHandler({method:'POST',headers:{host:'localhost','x-forwarded-for':'test-provider-error'},body:{message:'Xin chào'}},response);assert.equal(response.body.code,'INVALID_API_KEY');assert.doesNotMatch(JSON.stringify(response.body),/sensitive-provider-debug|test-placeholder/);}finally{globalThis.fetch=originalFetch;if(before===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;}
});
test('connection probe checks model metadata separately from generation and never returns credentials',async()=>{
 const before=process.env.GEMINI_API_KEY,originalFetch=globalThis.fetch;
 process.env.GEMINI_API_KEY='test-placeholder';
 globalThis.fetch=async(url:any)=>{assert.match(String(url),/\/v1beta\/models\/gemini-3.1-flash-lite$/);return new Response(JSON.stringify({name:'models/gemini-3.1-flash-lite'}),{status:200});};
 const response:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:unknown){this.body=b;return this;}};
 try{await chatHandler({method:'POST',headers:{host:'localhost','x-forwarded-for':'test-probe'},body:{message:'Kiểm tra kết nối',action:'check_connection'}},response);assert.equal(response.body.keyAccepted,true);assert.equal(response.body.modelAvailable,true);assert.equal(response.body.providerHttpStatus,200);assert.doesNotMatch(JSON.stringify(response.body),/test-placeholder/);}finally{globalThis.fetch=originalFetch;if(before===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;}
});
