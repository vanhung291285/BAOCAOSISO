import {createHmac} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';

// Topics are opaque capabilities. Broadcast carries no identities or message contents.
export function chatTopics(accountId:string,key:string){
 const topic=(scope:string)=>`staff-chat-${createHmac('sha256',key).update(`staff-chat-events-v1:${scope}`).digest('hex')}`;
 return {personal:topic(`account:${accountId}`),school:topic('school')};
}
export async function notifyChatChange(db:SupabaseClient,key:string,message:{sender_id:string;recipient_id:string|null}){
 const topics=message.recipient_id===null?[chatTopics(message.sender_id,key).school]:
  [...new Set([chatTopics(message.sender_id,key).personal,chatTopics(message.recipient_id,key).personal])];
 await Promise.all(topics.map(async topic=>{
  const channel=db.channel(topic);
  try{await channel.httpSend('changed',{changed:true},{timeout:1500});}
  catch{/* Persistence succeeded; periodic refresh recovers a missed signal. */}
  finally{await db.removeChannel(channel).catch(()=>{});}
 }));
}
