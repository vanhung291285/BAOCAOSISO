import test from 'node:test';
import assert from 'node:assert/strict';
import {readSessionToken,sessionCookie} from '../server/chat/session';
import handler from '../api/staff-chat';
test('shared session is HttpOnly, secure and bounded, and malformed cookies fail closed',()=>{
 const value=sessionCookie('test.jwt',3600);
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api/staff-chat','Max-Age=3600'])assert(value.includes(flag));
 assert.equal(readSessionToken({cookie:'other=value; staff_chat_session=test.jwt'}),'test.jwt');
 assert.equal(readSessionToken({cookie:'staff_chat_session=%E0%A4%A'}),'');
 assert.equal(readSessionToken({authorization:'Bearer previous.token'}),'previous.token');
 assert(sessionCookie('',0).includes('Max-Age=0'));
});
test('logout expires the shared cookie without relying on database availability',async()=>{
 const headers:Record<string,string>={};const res:any={code:0,setHeader(k:string,v:string){headers[k]=v;},status(n:number){this.code=n;return this;},json(b:any){return b;}};
 await handler({method:'POST',headers:{host:'school.test'},body:{action:'logout'}},res);
 assert.equal(res.code,200);assert.match(headers['Set-Cookie'],/Max-Age=0/);assert.match(headers['Set-Cookie'],/HttpOnly/);
});
test('server session cannot be relabeled as another profile by the browser',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 const id='11111111-1111-4111-8111-111111111111';let inboxQueried=false;
 globalThis.fetch=async(input:any)=>{const url=String(input);if(url.includes('staff_chat_allow_request'))return Response.json(true);if(url.includes('/auth/v1/user'))return Response.json({id,email:'synthetic@test.invalid'});if(url.includes('staff_chat_accounts'))return Response.json({id,profile_id:'verified-profile',display_name:'Synthetic',is_admin:false,enabled:true});inboxQueried=true;throw new Error('Unexpected private read');};
 const response:any={code:0,body:null,setHeader(){},status(n:number){this.code=n;return this;},json(b:any){this.body=b;return b;}};
 try{await handler({method:'POST',headers:{host:'school.test',cookie:'staff_chat_session=test.jwt'},body:{action:'inbox',profileId:'spoofed-admin',is_admin:true}},response);assert.equal(response.code,409);assert.equal(inboxQueried,false);}
 finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
