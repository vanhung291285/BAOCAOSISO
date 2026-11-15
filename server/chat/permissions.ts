export const validUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function messagePayload(body:any,account:{id:string;is_admin:boolean}) {
 if(typeof body?.text!=='string'||!body.text.trim()||body.text.trim().length>2000||!validUuid(body.nonce))throw new Error('INVALID_MESSAGE');
 if(body.thread==='school'){if(!account.is_admin)throw new Error('BROADCAST_FORBIDDEN');}
 else if(!validUuid(body.thread)||body.thread===account.id)throw new Error('INVALID_RECIPIENT');
 return {sender_id:account.id,recipient_id:body.thread==='school'?null:body.thread,body:body.text.trim(),client_nonce:body.nonce};
}
