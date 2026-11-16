import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/staff-chat';
import {teacherToken} from '../server/chat/teacherSession';
import {RECALLED_MESSAGE,RECALLED_LABEL,publicChatMessage} from '../src/services/chatMessageState';
import {messagePayload} from '../server/chat/permissions';
const teacher='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222',messageId='33333333-3333-4333-8333-333333333333';
test('recall replaces content, preserves identity and rejects forged recall markers',()=>{
 assert.deepEqual(publicChatMessage({id:messageId,body:RECALLED_MESSAGE}),{id:messageId,body:'',recalled:true});
 assert.equal(publicChatMessage({body:'Ordinary text'}).recalled,false);
 assert.throws(()=>messagePayload({thread:admin,text:RECALLED_MESSAGE,nonce:messageId},{id:teacher,is_admin:false}));
});
test('GVCN can recall only own messages; recalled history and inbox never return original text',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-key';
 const account={id:teacher,profile_id:'t1',role_label:'GVCN',is_admin:false,enabled:true};
 let stored={id:messageId,sender_id:teacher,recipient_id:admin,body:'Synthetic original',created_at:'2026-11-16T01:00:00Z'},updates=0;
 globalThis.fetch=async(input:any,init:any)=>{
  const url=new URL(String(input));
  if(url.pathname.includes('staff_chat_allow_request'))return Response.json(true);
  if(url.pathname.endsWith('/profiles'))return Response.json({id:'t1',role:'GVCN',active:true,assigned_class_id:'c1'});
  if(url.pathname.endsWith('/classes'))return Response.json({id:'c1',active:true,homeroom_teacher_id:'t1'});
  if(url.pathname.endsWith('/staff_chat_accounts'))return Response.json(account);
  if(url.pathname.includes('staff_chat_inbox'))return Response.json([{thread_id:admin,last_body:stored.body,unread:1}]);
  if(url.pathname.endsWith('/staff_chat_messages')){
   if(init?.method==='PATCH'){
    assert.equal(url.searchParams.get('sender_id'),`eq.${teacher}`);assert.equal(url.searchParams.get('id'),`eq.${messageId}`);
    assert.deepEqual(JSON.parse(init.body),{body:RECALLED_MESSAGE});
    if(stored.sender_id!==teacher)return Response.json(null);
    updates++;stored={...stored,body:RECALLED_MESSAGE};return Response.json(stored);
   }
   return Response.json([stored]);
  }
  if(url.pathname.includes('/realtime/v1/api/broadcast'))return Response.json({});
  throw new Error(`Unexpected synthetic route ${url.pathname}`);
 };
 const cookie=`staff_chat_session=${teacherToken({accountId:teacher,profileId:'t1',classId:'c1'},'synthetic-key')}`;
 const call=async(body:any)=>{const r:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:any){this.body=b;return b;}};await handler({method:'POST',headers:{host:'school.test',cookie},body:{...body,profileId:'t1'}},r);return r;};
 try{
  const recalled=await call({action:'recall',messageId,sender_id:admin});assert.equal(recalled.code,200);assert.equal(recalled.body.message.recalled,true);assert.equal(recalled.body.message.body,'');
  assert.equal((await call({action:'recall',messageId})).code,200); // retry is safe
  const history=await call({action:'history',thread:'school'});assert.equal(history.body.messages[0].body,'');assert.equal(history.body.messages[0].recalled,true);
  const inbox=await call({action:'inbox'});assert.equal(inbox.body.threads[0].last_body,RECALLED_LABEL);
  stored={...stored,sender_id:admin,body:'Another sender'};
  const denied=await call({action:'recall',messageId,is_admin:true});assert.equal(denied.code,404);assert.equal(stored.body,'Another sender');assert.equal(updates,2);
  assert.equal((await call({action:'recall',messageId:'bad-id'})).code,400);
 }finally{
  globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
