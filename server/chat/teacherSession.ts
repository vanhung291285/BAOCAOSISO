import {createHmac,timingSafeEqual} from 'node:crypto';
import {validUuid} from './permissions.js';
const mac=(payload:string,key:string)=>createHmac('sha256',key).update(`staff-chat-teacher-v1:${payload}`).digest('base64url');
export function teacherToken(identity:{accountId:string;profileId:string;classId:string},key:string,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({...identity,expires:Math.floor(now/1000)+3600})).toString('base64url');
 return `gvcn.${payload}.${mac(payload,key)}`;
}
export function verifyTeacherToken(token:string,key:string,now=Date.now()){
 try{
  const parts=token.split('.');if(parts.length!==3||parts[0]!=='gvcn'||parts[1].length>2000)return null;
  const expected=Buffer.from(mac(parts[1],key)),actual=Buffer.from(parts[2]);
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
  const p=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  if(!validUuid(p.accountId)||typeof p.profileId!=='string'||!p.profileId||typeof p.classId!=='string'||!p.classId||!Number.isFinite(p.expires)||p.expires<=now/1000)return null;
  return {accountId:p.accountId,profileId:p.profileId,classId:p.classId};
 }catch{return null;}
}
export function teacherMatchesClass(profile:any,cls:any){
 return Boolean(profile&&cls&&profile.active!==false&&cls.active!==false&&profile.role==='GVCN'&&(profile.assigned_class_id===cls.id||cls.homeroom_teacher_id===profile.id));
}
