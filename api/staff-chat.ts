import {chatTopics,notifyChatChange} from '../server/chat/realtime.js';
import {teacherToken,verifyTeacherToken} from '../server/chat/teacherSession.js';
import {getTeacherIdentity,ensureTeacherAccount} from '../server/chat/teacherAccounts.js';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import {readSessionToken,sessionCookie,chatCookieName} from '../server/chat/session.js';
import { messagePayload, validUuid } from '../server/chat/permissions.js';
export default async function handler(req:any,res:any) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Chỉ hỗ trợ POST.'});
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}catch{return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}
 const body=req.body||{};
 const secure=!/^localhost(?::|$)|^127\.0\.0\.1(?::|$)/.test(String(req.headers.host||''));
 if(body.action==='logout'){res.setHeader('Set-Cookie',[sessionCookie('',0,secure),...(typeof body.profileId==='string'?[sessionCookie('',0,secure,body.profileId)]:[])]);return res.status(200).json({ok:true});}
 if(JSON.stringify(body).length>12000)return res.status(400).json({error:'Yêu cầu quá lớn.'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Chat chưa được cấu hình trên máy chủ.'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 try{
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const allowed=check(await db.rpc('staff_chat_allow_request',{p_key:createHash('sha256').update(`${body.action==='login'?'login':'api'}:${ip}`).digest('hex'),p_limit:body.action==='login'?60:3000,p_window:60}));
  if(!allowed)return res.status(429).json({error:'Thao tác quá nhanh. Vui lòng đợi một phút.'});
  if(body.action==='status'){
   const ready=check(await db.from('staff_chat_accounts').select('id').eq('is_admin',true).eq('enabled',true).limit(1));
   return res.status(200).json({ready:ready.length>0});
  }
  if(body.action==='teacher-session'){
   if(typeof body.profileId!=='string'||!body.profileId||body.profileId.length>128||typeof body.classId!=='string'||!body.classId||body.classId.length>128)return res.status(400).json({error:'Chưa xác định được lớp và GVCN.'});
   const {profile,cls}=await getTeacherIdentity(db,body.profileId,body.classId);
   const account=await ensureTeacherAccount(db,profile);
   res.setHeader('Set-Cookie',sessionCookie(teacherToken({accountId:account.id,profileId:profile.id,classId:cls.id},key),3600,secure,profile.id));
   return res.status(200).json({account,realtime:chatTopics(account.id,key),identityMode:'CLASS_SELECTION'});
  }
  if(body.action==='login'){
   const loginAllowed=check(await db.rpc('staff_chat_allow_request',{p_key:createHash('sha256').update(`account-login:${String(body.profileId).slice(0,128)}`).digest('hex'),p_limit:6,p_window:60}));
   if(!loginAllowed)return res.status(429).json({error:'Tài khoản thử đăng nhập quá nhiều lần. Vui lòng đợi một phút.'});
   if(typeof body.profileId!=='string'||body.profileId.length>128||typeof body.password!=='string'||body.password.length>128)return res.status(400).json({error:'Thông tin đăng nhập không hợp lệ.'});
   const account=check(await db.from('staff_chat_accounts').select('*').eq('profile_id',body.profileId).eq('enabled',true).maybeSingle());
   if(!account)return res.status(401).json({error:'Tài khoản chưa được cấp quyền chat hoặc mật khẩu không đúng.'});
   const user=check(await db.auth.admin.getUserById(account.id))?.user;
   if(!user?.email)throw new Error('CHAT_ACCOUNT_INCOMPLETE');
   const auth=await db.auth.signInWithPassword({email:user.email,password:body.password});
   if(auth.error||!auth.data.session)return res.status(401).json({error:'Tài khoản chưa được cấp quyền chat hoặc mật khẩu không đúng.'});
   res.setHeader('Set-Cookie',sessionCookie(auth.data.session.access_token,Math.min(auth.data.session.expires_in||3600,3600),secure,account.profile_id));
   return res.status(200).json({account,realtime:chatTopics(account.id,key)});
  }
  const token=readSessionToken(req.headers,typeof body.profileId==='string'?body.profileId:undefined);
  if(!token||token.length>6000)return res.status(401).json({error:'Vui lòng đăng nhập tài khoản ở trang chính.'});
  let account:any;
  if(token.startsWith('gvcn.')){
   const teacher=verifyTeacherToken(token,key);
   if(!teacher)return res.status(401).json({error:'Phiên GVCN hết hạn. Đang kết nối lại.'});
   await getTeacherIdentity(db,teacher.profileId,teacher.classId);
   account=check(await db.from('staff_chat_accounts').select('*').eq('id',teacher.accountId).eq('enabled',true).maybeSingle());
   if(!account||account.is_admin||account.role_label!=='GVCN'||account.profile_id!==teacher.profileId)return res.status(403).json({error:'Tài khoản GVCN không được cấp quyền này.'});
  }else{
   const verified=await db.auth.getUser(token);
   if(verified.error||!verified.data.user)return res.status(401).json({error:'Phiên tài khoản hết hạn. Vui lòng đăng nhập lại ở trang chính.'});
   account=check(await db.from('staff_chat_accounts').select('*').eq('id',verified.data.user.id).eq('enabled',true).maybeSingle());
   if(!account)return res.status(403).json({error:'Tài khoản chat chưa được cấp quyền hoặc đã bị tạm khóa.'});
  }
  if(body.profileId!==account.profile_id)return res.status(409).json({error:'Phiên đăng nhập không khớp tài khoản đang chọn. Vui lòng đăng nhập lại.'});
  // Upgrade an existing single-account cookie without disturbing other signed-in tabs.
  if(!String(req.headers.cookie||'').split(';').some((c:string)=>c.trim().startsWith(`${chatCookieName(account.profile_id)}=`)))res.setHeader('Set-Cookie',sessionCookie(token,3600,secure,account.profile_id));
  const accountAllowed=check(await db.rpc('staff_chat_allow_request',{p_key:`api:${account.id}`,p_limit:180,p_window:60}));
  if(!accountAllowed)return res.status(429).json({error:'Tài khoản thao tác quá nhanh. Vui lòng đợi một phút.'});
  if(body.action==='session'){
   if(body.profileId!==account.profile_id)return res.status(409).json({error:'Vui lòng đăng nhập đúng tài khoản để sử dụng tin nhắn.'});
   return res.status(200).json({account,realtime:chatTopics(account.id,key)});
  }
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
     await notifyChatChange(db,key,previous);
     return res.status(200).json({message:previous});
    }
    const message=check(inserted);
    await notifyChatChange(db,key,message);
    return res.status(200).json({message});
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
  if(body.action==='enable-teacher'){
   if(!account.is_admin)return res.status(403).json({error:'Chỉ quản trị được kích hoạt người nhận.'});
   if(typeof body.targetProfileId!=='string'||body.targetProfileId.length>128)return res.status(400).json({error:'Tài khoản không hợp lệ.'});
   const {profile}=await getTeacherIdentity(db,body.targetProfileId);
   const target=await ensureTeacherAccount(db,profile);
   return res.status(200).json({ok:true,account:target});
  }
  if(body.action==='provision'){
   if(!account.is_admin)return res.status(403).json({error:'Chỉ quản trị chat được cấp tài khoản.'});
   if(typeof body.targetProfileId!=='string'||typeof body.password!=='string'||body.password.length<10||body.password.length>128)return res.status(400).json({error:'Mật khẩu tài khoản cần từ 10 đến 128 ký tự.'});
   const profile=check(await db.from('profiles').select('id,full_name,role').eq('id',body.targetProfileId).eq('active',true).maybeSingle());
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
  if(['NOT_ASSIGNED_TEACHER','TEACHER_CHAT_DISABLED'].includes(e?.message))return res.status(403).json({error:e.message==='NOT_ASSIGNED_TEACHER'?'Lớp chưa có hồ sơ GVCN đang hoạt động. Quản trị kiểm tra phân công lớp.':'Tài khoản chat GVCN đã bị tạm khóa hoặc không hợp lệ.'});
  const missing=['42P01','42883','PGRST202','PGRST205'].includes(e?.code);
  return res.status(503).json({error:missing?'Chat chưa được khởi tạo trong Supabase. Quản trị cần chạy bản SQL thiết lập chat.':'Không kết nối được máy chủ chat. Vui lòng thử lại; tin chưa được xác nhận gửi.'});
 }
}
