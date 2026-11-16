export interface ChatAccount {id:string;profile_id:string;display_name:string;role_label:string;is_admin?:boolean;enabled?:boolean}
export interface ChatMessage {id:string;sender_id:string;recipient_id:string|null;body:string;recalled?:boolean;created_at:string}
export interface ChatThread {thread_id:string;last_body:string;last_at:string;unread:number}
export class ChatError extends Error {constructor(message:string,public status:number){super(message);}}
export async function chatRequest<T=any>(body:Record<string,unknown>,token?:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/staff-chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:signal||AbortSignal.timeout(25000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new ChatError(data?.error||'Chưa kết nối được máy chủ chat. Vui lòng thử lại.',response.status);
 return data;
}
