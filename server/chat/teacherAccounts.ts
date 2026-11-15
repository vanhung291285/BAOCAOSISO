import {randomUUID} from 'node:crypto';
import {teacherMatchesClass} from './teacherSession.js';
const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
export async function getTeacherIdentity(db:any,profileId:string,classId?:string){
 const profile=check(await db.from('profiles').select('id,full_name,role,active,assigned_class_id').eq('id',profileId).eq('role','GVCN').eq('active',true).maybeSingle());
 if(!profile)throw new Error('NOT_ASSIGNED_TEACHER');
 let cls;
 if(classId)cls=check(await db.from('classes').select('id,class_name,active,homeroom_teacher_id').eq('id',classId).eq('active',true).maybeSingle());
 else if(profile.assigned_class_id)cls=check(await db.from('classes').select('id,class_name,active,homeroom_teacher_id').eq('id',profile.assigned_class_id).eq('active',true).maybeSingle());
 else cls=check(await db.from('classes').select('id,class_name,active,homeroom_teacher_id').eq('homeroom_teacher_id',profile.id).eq('active',true).limit(1).maybeSingle());
 if(!teacherMatchesClass(profile,cls))throw new Error('NOT_ASSIGNED_TEACHER');
 return {profile,cls};
}
export async function ensureTeacherAccount(db:any,profile:any){
 const existing=check(await db.from('staff_chat_accounts').select('*').eq('profile_id',profile.id).maybeSingle());
 const accept=(a:any)=>{if(!a||a.is_admin||a.enabled===false||a.role_label!=='GVCN')throw new Error('TEACHER_CHAT_DISABLED');return a;};
 if(existing)return accept(existing);
 // Creates a mapping in Auth for the existing FK, with no password and no outgoing email.
 const created=check(await db.auth.admin.createUser({email:`chat-${randomUUID()}@chat.db.edu.vn`,email_confirm:true,app_metadata:{school_chat_teacher:true}})).user;
 if(!created)throw new Error('TEACHER_CHAT_CREATE_FAILED');
 const result=await db.from('staff_chat_accounts').insert({id:created.id,profile_id:profile.id,display_name:profile.full_name,role_label:'GVCN',is_admin:false,enabled:true}).select('*').single();
 if(result.error){await db.auth.admin.deleteUser(created.id);if(result.error.code==='23505')return accept(check(await db.from('staff_chat_accounts').select('*').eq('profile_id',profile.id).maybeSingle()));throw result.error;}
 return accept(result.data);
}
