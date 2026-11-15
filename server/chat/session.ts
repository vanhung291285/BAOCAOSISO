import {createHash} from 'node:crypto';
export const CHAT_COOKIE='staff_chat_session';
export function chatCookieName(profileId?:string){return profileId?`${CHAT_COOKIE}_${createHash('sha256').update(profileId).digest('hex').slice(0,24)}`:CHAT_COOKIE;}
export function sessionCookie(token:string,maxAge:number,secure=true,profileId?:string){
 return `${chatCookieName(profileId)}=${encodeURIComponent(token)}; Path=/api/staff-chat; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure?'; Secure':''}`;
}
export function readSessionToken(headers:Record<string,any>,profileId?:string):string{
 const bearer=String(headers.authorization||'').match(/^Bearer ([^\s]+)$/)?.[1];
 if(bearer)return bearer;
 const values=String(headers.cookie||'').split(';').map(s=>s.trim());
 const name=chatCookieName(profileId);
 const cookie=values.find(s=>s.startsWith(`${name}=`))||values.find(s=>s.startsWith(`${CHAT_COOKIE}=`));
 try{return cookie?decodeURIComponent(cookie.slice(cookie.indexOf('=')+1)):'';}catch{return '';}
}
