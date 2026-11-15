import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {messagePayload} from '../server/chat/permissions';
import handler from '../api/staff-chat';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',nonce='44444444-4444-4444-8444-444444444444';
test('message sender comes from verified account; only chat admins can broadcast',()=>{
 assert.deepEqual(messagePayload({thread:b,text:' Hello ',nonce,sender_id:c,is_admin:true},{id:a,is_admin:false}),{sender_id:a,recipient_id:b,body:'Hello',client_nonce:nonce});
 assert.throws(()=>messagePayload({thread:'school',text:'Test',nonce},{id:a,is_admin:false}),/FORBIDDEN/);
 assert.equal(messagePayload({thread:'school',text:'Test',nonce},{id:a,is_admin:true}).recipient_id,null);
 for(const data of [{thread:a,text:'Test',nonce},{thread:'invalid',text:'Test',nonce},{thread:b,text:' ',nonce},{thread:b,text:'x'.repeat(2001),nonce},{thread:b,text:'Test',nonce:'bad'}])assert.throws(()=>messagePayload(data,{id:a,is_admin:false}));
});
test('chat SQL isolates private threads, counts unread, prevents duplicate sends and denies browser access',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);');
  const sql=readFileSync(new URL('../migrations/20261115_staff_chat.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  for(const [id,name]of [[a,'A'],[b,'B'],[c,'C']]){await db.query('INSERT INTO auth.users VALUES($1)',[id]);await db.query('INSERT INTO staff_chat_accounts(id,profile_id,display_name,role_label) VALUES($1,$2,$2,\'GVCN\')',[id,name]);}
  await db.query("INSERT INTO staff_chat_messages(sender_id,recipient_id,body,client_nonce,created_at) VALUES($1,$2,'A to B',$4,'2026-11-14T01:00:00Z'),($3,$2,'C private to B',gen_random_uuid(),'2026-11-14T02:00:00Z'),($2,NULL,'Announcement',gen_random_uuid(),'2026-11-14T03:00:00Z')",[a,b,c,nonce]);
  let inbox=await db.query<any>('SELECT * FROM staff_chat_inbox($1)',[a]);assert.equal(inbox.rows.length,2);assert.equal(inbox.rows.find(x=>x.thread_id==='school').unread,1);assert(!JSON.stringify(inbox.rows).includes('C private'));
  await assert.rejects(db.query("INSERT INTO staff_chat_messages(sender_id,recipient_id,body,client_nonce)VALUES($1,$2,'retry',$3)",[a,b,nonce]),/unique/);
  await db.query("SELECT staff_chat_mark_read($1,'school','2026-11-14T03:00:00Z')",[a]);await db.query("SELECT staff_chat_mark_read($1,'school','2026-11-14T01:00:00Z')",[a]);inbox=await db.query<any>('SELECT * FROM staff_chat_inbox($1)',[a]);assert.equal(inbox.rows.find(x=>x.thread_id==='school').unread,0);
  for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query('SELECT * FROM staff_chat_messages'),/permission denied/);await assert.rejects(db.query('SELECT * FROM staff_chat_inbox($1)',[a]),/permission denied/);await db.exec('RESET ROLE');}
  assert.equal((await db.query<any>("SELECT staff_chat_allow_request('test',1,60) ok")).rows[0].ok,true);assert.equal((await db.query<any>("SELECT staff_chat_allow_request('test',1,60) ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('API rejects a foreign origin before attempting database access',async()=>{const response:any={code:0,setHeader(){},status(n:number){this.code=n;return this;},json(body:any){return body;}};await handler({method:'POST',headers:{host:'school.test',origin:'https://attacker.test'},body:{}},response);assert.equal(response.code,403);});
