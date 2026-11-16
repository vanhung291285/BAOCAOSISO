import {createHmac} from 'node:crypto';

// Topics are opaque capabilities. Broadcast carries no identities or message contents.
export function chatTopics(accountId:string,key:string){
 const topic=(scope:string)=>`staff-chat-${createHmac('sha256',key).update(`staff-chat-events-v1:${scope}`).digest('hex')}`;
 return {personal:topic(`account:${accountId}`),school:topic('school')};
}
export async function notifyChatChange(url:string,key:string,message:{sender_id:string;recipient_id:string|null},send:typeof fetch=fetch){
 const topics=message.recipient_id===null?[chatTopics(message.sender_id,key).school]:
  [...new Set([chatTopics(message.sender_id,key).personal,chatTopics(message.recipient_id,key).personal])];
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),1500);
 try{
  // REST publication needs no WebSocket connection or channel cleanup in a serverless request.
  await send(`${url.replace(/\/$/,'')}/realtime/v1/api/broadcast`,{
   method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({messages:topics.map(topic=>({topic,event:'changed',payload:{changed:true},private:false}))}),signal:controller.signal,
  });
 }catch{/* Persistence succeeded; periodic refresh recovers a missed signal. */}
 finally{clearTimeout(timeout);}
}
