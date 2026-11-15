export const CHAT_COOKIE='staff_chat_session';
export function sessionCookie(token:string,maxAge:number,secure=true){
 return `${CHAT_COOKIE}=${encodeURIComponent(token)}; Path=/api/staff-chat; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}${secure?'; Secure':''}`;
}
export function readSessionToken(headers:Record<string,any>):string{
 const bearer=String(headers.authorization||'').match(/^Bearer ([^\s]+)$/)?.[1];
 if(bearer)return bearer;
 const cookie=String(headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${CHAT_COOKIE}=`));
 try{return cookie?decodeURIComponent(cookie.slice(CHAT_COOKIE.length+1)):'';}catch{return '';}
}
