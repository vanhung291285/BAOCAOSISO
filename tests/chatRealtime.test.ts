import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTopics,notifyChatChange} from '../server/chat/realtime';

test('notification topics are stable, isolated by account, and rotate with server key',()=>{
 const a=chatTopics('teacher-a','synthetic-key'),b=chatTopics('teacher-b','synthetic-key');
 assert.deepEqual(a,chatTopics('teacher-a','synthetic-key'));
 assert.notEqual(a.personal,b.personal);assert.equal(a.school,b.school);
 assert.notEqual(a.personal,chatTopics('teacher-a','rotated-key').personal);
 assert(!a.personal.includes('teacher-a'));assert.notEqual(a.personal,a.school);
});
test('direct delivery signals both endpoints without exposing text or identity',async()=>{
 const sent:any[]=[],removed:string[]=[];
 const db:any={channel(topic:string){return {topic,async httpSend(event:string,payload:any,options:any){sent.push({topic,event,payload,options});return {success:true};}};},async removeChannel(c:any){removed.push(c.topic);}};
 await notifyChatChange(db,'synthetic-key',{sender_id:'admin',recipient_id:'teacher',body:'private text'} as any);
 assert.deepEqual(sent.map(x=>x.topic).sort(),[chatTopics('admin','synthetic-key').personal,chatTopics('teacher','synthetic-key').personal].sort());
 for(const item of sent){assert.equal(item.event,'changed');assert.deepEqual(item.payload,{changed:true});assert.equal(item.options.timeout,1500);}
 assert.equal(removed.length,2);
 sent.length=0;
 await notifyChatChange(db,'synthetic-key',{sender_id:'admin',recipient_id:null});
 assert.equal(sent.length,1);assert.equal(sent[0].topic,chatTopics('admin','synthetic-key').school);
});
test('realtime outage never changes the outcome of an already saved message',async()=>{
 let removed=0;
 const db:any={channel(){return {async httpSend(){throw new Error('Realtime unavailable');}};},async removeChannel(){removed++;}};
 await assert.doesNotReject(()=>notifyChatChange(db,'synthetic-key',{sender_id:'a',recipient_id:'b'}));
 assert.equal(removed,2);
});
