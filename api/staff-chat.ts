import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { messagePayload, validUuid } from '../server/chat/permissions.js';
export default async function handler(req:any,res:any) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Chỉ hỗ trợ POST.'});
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}catch{return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}
 const body=req.body||{};
 if(JSON.stringify(body).length>12000)return res.status(400).json({error:'Yêu cầu quá lớn.'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Chat chưa được cấu hình trên máy chủ.'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 try{
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const allowed=check(await db.rpc('staff_chat_allow_request',{p_key:createHash('sha256').update(`${body.action==='login'?'login':'api'}:${ip}`).digest('hex'),p_limit:body.action==='login'?8:100,p_window:60}));
  if(!allowed)return res.status(429).json({error:'Thao tác quá nhanh. Vui lòng đợi một phút.'});
  if(body.action==='status'){
   const ready=check(await db.from('staff_chat_accounts').select('id').eq('is_admin',true).eq('enabled',true).limit(1));
   return res.status(200).json({ready:ready.length>0});
  }
  if(body.action==='login'){
   if(typeof body.profileId!=='string'||body.profileId.length>128||typeof body.password!=='string'||body.password.length>128)return res.status(400).json({error:'Thông tin đăng nhập không hợp lệ.'});
   const account=check(await db.from('staff_chat_accounts').select('*').eq('profile_id',body.profileId).eq('enabled',true).maybeSingle());
   if(!account)return res.status(401).json({error:'Tài khoản chưa được cấp quyền chat hoặc mật khẩu không đúng.'});
   const user=check(await db.auth.admin.getUserById(account.id))?.user;
   if(!user?.email)throw new Error('CHAT_ACCOUNT_INCOMPLETE');
   const auth=await db.auth.signInWithPassword({email:user.email,password:body.password});
   if(auth.error||!auth.data.session)return res.status(401).json({error:'Tài khoản chưa được cấp quyền chat hoặc mật khẩu không đúng.'});
   return res.status(200).json({account,token:auth.data.session.access_token,expiresAt:auth.data.session.expires_at});
  }
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token||token.length>6000)return res.status(401).json({error:'Vui lòng đăng nhập phần chat.'});
  const verified=await db.auth.getUser(token);
  if(verified.error||!verified.data.user)return res.status(401).json({error:'Phiên chat hết hạn. Vui lòng đăng nhập lại.'});
  const account=check(await db.from('staff_chat_accounts').select('*').eq('id',verified.data.user.id).eq('enabled',true).maybeSingle());
  if(!account)return res.status(403).json({error:'Tài khoản chat chưa được cấp quyền hoặc đã bị tạm khóa.'});
  if(body.action==='inbox'){
   const contacts=check(await db.from('staff_chat_accounts').select('id,profile_id,display_name,role_label').eq('enabled',true).neq('id',account.id).order('display_name'));
   const threads=check(await db.rpc('staff_chat_inbox',{p_account:account.id}));
   return res.status(200).json({account,contacts,threads});
  }
  if(['history','read','send'].includes(body.action)){
   if(body.thread!=='school'&&(!validUuid(body.thread)||body.thread===account.id))return res.status(400).json({error:'Người nhận không hợp lệ.'});
   if(body.thread!=='school'){
    const target=check(await db.from('staff_chat_accounts').select('id').eq('id',body.thread).eq('enabled',true).maybeSingle());
    if(!target)return res.status(404).json({error:'Tài khoản người nhận chưa được kích hoạt.'});
   }
   if(body.action==='send'){
    let payload;try{payload=messagePayload(body,account);}catch(e:any){return res.status(e.message==='BROADCAST_FORBIDDEN'?403:400).json({error:e.message==='BROADCAST_FORBIDDEN'?'Chỉ quản trị được gửi thông báo toàn trường.':'Nhập tin nhắn từ 1 đến 2.000 ký tự.'});}
    const rate=check(await db.rpc('staff_chat_allow_request',{p_key:`send:${account.id}`,p_limit:30,p_window:60}));if(!rate)return res.status(429).json({error:'Vui lòng đợi một phút trước khi gửi tiếp.'});
    // A stable nonce makes a retry after a network interruption safe.
    const inserted=await db.from('staff_chat_messages').insert(payload).select('id,sender_id,recipient_id,body,created_at').single();
    if(inserted.error?.code==='23505'){
     const previous=check(await db.from('staff_chat_messages').select('id,sender_id,recipient_id,body,created_at').eq('sender_id',account.id).eq('client_nonce',payload.client_nonce).single());
     if(previous.recipient_id!==payload.recipient_id||previous.body!==payload.body)return res.status(409).json({error:'Mã gửi đã dùng cho nội dung khác. Vui lòng đóng và mở lại cuộc trò chuyện.'});
     return res.status(200).json({message:previous});
    }
    return res.status(200).json({message:check(inserted)});
   }
   if(body.action==='read'){
    // Bound by the newest message the client actually displayed; do not mark unseen incoming messages.
    if(typeof body.seenAt!=='string'||!Number.isFinite(Date.parse(body.seenAt))||Date.parse(body.seenAt)>Date.now()+5000)return res.status(400).json({error:'Mốc đọc không hợp lệ.'});
    check(await db.rpc('staff_chat_mark_read',{p_account:account.id,p_thread:body.thread,p_seen:body.seenAt}));return res.status(200).json({ok:true});
   }
   let q=db.from('staff_chat_messages').select('id,sender_id,recipient_id,body,created_at');
   q=body.thread==='school'?q.is('recipient_id',null):q.or(`and(sender_id.eq.${account.id},recipient_id.eq.${body.thread}),and(sender_id.eq.${body.thread},recipient_id.eq.${account.id})`);
   const messages=check(await q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100));
   return res.status(200).json({messages:messages.reverse()});
  }
  if(body.action==='accounts'){
   if(!account.is_admin)return res.status(403).json({error:'Chỉ quản trị chat được quản lý tài khoản.'});
   const profiles=check(await db.from('profiles').select('id,full_name,role,assigned_class_id').eq('active',true).order('full_name'));
   const accounts=check(await db.from('staff_chat_accounts').select('id,profile_id,display_name,role_label,enabled,is_admin'));
   return res.status(200).json({profiles,accounts});
  }
  if(body.action==='provision'){
   if(!account.is_admin)return res.status(403).json({error:'Chỉ quản trị chat được cấp tài khoản.'});
   if(typeof body.profileId!=='string'||typeof body.password!=='string'||body.password.length<10||body.password.length>128)return res.status(400).json({error:'Mật khẩu chat cần từ 10 đến 128 ký tự.'});
   const profile=check(await db.from('profiles').select('id,full_name,role').eq('id',body.profileId).eq('active',true).maybeSingle());
   if(!profile)return res.status(404).json({error:'Không tìm thấy tài khoản đang hoạt động.'});
   const existing=check(await db.from('staff_chat_accounts').select('*').eq('profile_id',profile.id).maybeSingle());
   if(existing){check(await db.auth.admin.updateUserById(existing.id,{password:body.password}));return res.status(200).json({ok:true});}
   const created=check(await db.auth.admin.createUser({email:`chat-${randomUUID()}@chat.db.edu.vn`,password:body.password,email_confirm:true})).user;
   if(!created)throw new Error('CREATE_ACCOUNT_FAILED');
   const mapped=await db.from('staff_chat_accounts').insert({id:created.id,profile_id:profile.id,display_name:profile.full_name,role_label:profile.role,is_admin:false});
   if(mapped.error){await db.auth.admin.deleteUser(created.id);throw mapped.error;}
   return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Thao tác không hợp lệ.'});
 }catch(e:any){
  const missing=['42P01','42883','PGRST202','PGRST205'].includes(e?.code);
  return res.status(503).json({error:missing?'Chat chưa được khởi tạo trong Supabase. Quản trị cần chạy bản SQL thiết lập chat.':'Không kết nối được máy chủ chat. Vui lòng thử lại; tin chưa được xác nhận gửi.'});
 }
}
