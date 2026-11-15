import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherToken,verifyTeacherToken,teacherMatchesClass} from '../server/chat/teacherSession';
import handler from '../api/staff-chat';
const id='11111111-1111-4111-8111-111111111111';
test('teacher selection token binds account, profile and class; rejects tampering and expiration',()=>{
 const identity={accountId:id,profileId:'teacher-6A1',classId:'class-6A1'};
 const token=teacherToken(identity,'test-signing-key',1000000);
 assert.deepEqual(verifyTeacherToken(token,'test-signing-key',1000000),identity);
 assert.equal(verifyTeacherToken(token,'other-key',1000000),null);
 assert.equal(verifyTeacherToken(token,'test-signing-key',5000000),null);
 const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({...identity,profileId:'admin',expires:99999999999})).toString('base64url');
 assert.equal(verifyTeacherToken(parts.join('.'),'test-signing-key',1000000),null);
});
test('only active GVCN assigned to the selected class qualify for passwordless messaging',()=>{
 const profile={id:'t1',role:'GVCN',active:true,assigned_class_id:'c1'},cls={id:'c1',active:true};
 assert.equal(teacherMatchesClass(profile,cls),true);
 for(const p of [{...profile,role:'ADMIN'},{...profile,role:'BGH'},{...profile,active:false},{...profile,assigned_class_id:'c2'}])assert.equal(teacherMatchesClass(p,cls),false);
 assert.equal(teacherMatchesClass(profile,{...cls,active:false}),false);
});
test('passwordless teacher session ignores client admin claims and cannot broadcast or manage accounts',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-signing-key';
 const account={id,profile_id:'t1',display_name:'Synthetic teacher',role_label:'GVCN',is_admin:false,enabled:true};
 let authCalled=false;
 globalThis.fetch=async(input:any)=>{const url=String(input);if(url.includes('staff_chat_allow_request'))return Response.json(true);if(url.includes('/rest/v1/profiles'))return Response.json({id:'t1',full_name:'Synthetic teacher',role:'GVCN',active:true,assigned_class_id:'c1'});if(url.includes('/rest/v1/classes'))return Response.json({id:'c1',class_name:'6A1',active:true,homeroom_teacher_id:'t1'});if(url.includes('staff_chat_accounts'))return Response.json(account);authCalled=true;throw new Error('Unexpected auth mutation');};
 const response=()=>({code:0,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.code=n;return this;},json(b:any){this.body=b;return b;}});
 try{
  const first=response();await handler({method:'POST',headers:{host:'school.test'},body:{action:'teacher-session',profileId:'t1',classId:'c1',is_admin:true}},first);
  assert.equal(first.code,200);assert.equal(first.body.account.is_admin,false);assert.equal(first.body.identityMode,'CLASS_SELECTION');assert.match(first.headers['Set-Cookie'],/HttpOnly/);assert.equal(first.body.token,undefined);
  const cookie=first.headers['Set-Cookie'].split(';')[0];
  for(const body of [{action:'send',thread:'school',text:'Test',nonce:'22222222-2222-4222-8222-222222222222'},{action:'accounts'},{action:'enable-teacher',targetProfileId:'other'},{action:'provision',targetProfileId:'other',password:'not-used-test'}]){const r=response();await handler({method:'POST',headers:{host:'school.test',cookie},body:{...body,profileId:'t1',is_admin:true}},r);assert.equal(r.code,403);}
  assert.equal(authCalled,false);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
