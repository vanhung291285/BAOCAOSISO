// A reserved stored value lets existing databases support recall without a schema change.
export const RECALLED_MESSAGE = '\u2063Tin nhắn đã được thu hồi\u2063';
export const RECALLED_LABEL = 'Tin nhắn đã được thu hồi';
export function publicChatMessage<T extends {body:string}>(message:T){
 const recalled=message.body===RECALLED_MESSAGE;
 return {...message,body:recalled?'':message.body,recalled};
}
