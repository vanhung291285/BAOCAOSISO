const requests=new Map<string,{count:number;until:number}>();
export default async function handler(req:any,res:any) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Chỉ hỗ trợ POST.'});
  const host=req.headers.host;
  const origin=req.headers.origin;
  if(origin) {try{if(new URL(origin).host!==host)return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}catch{return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}}
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const now=Date.now();
  for(const [key,val] of requests)if(val.until<now)requests.delete(key);
  const entry=requests.get(ip)||{count:0,until:now+60000};entry.count++;requests.set(ip,entry);
  if(entry.count>20){res.setHeader('Retry-After','60');return res.status(429).json({error:'Thầy/Cô gửi quá nhanh. Vui lòng đợi một phút rồi thử lại.'});}
  const message=req.body?.message;
  if(typeof message!=='string'||!message.trim()||message.length>6000)return res.status(400).json({error:'Vui lòng nhập câu hỏi tối đa 6.000 ký tự.'});
  const apiKey=process.env.GEMINI_API_KEY;
  if(!apiKey)return res.status(503).json({error:'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Quản trị cần bổ sung khóa AI trong Vercel để bật hỏi đáp kiến thức chung.'});
  const history=Array.isArray(req.body?.conversationHistory)?req.body.conversationHistory.slice(-8).filter((m:any)=>['user','model'].includes(m.role)&&typeof m.text==='string').map((m:any)=>({role:m.role,parts:[{text:m.text.slice(0,4000)}]})):[];
  try {
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:process.env.GEMINI_CHAT_MODEL||'gemini-3.8-flash',store:false,
        system_instruction:'Bạn là trợ lý AI của Trường PTDTBT THCS Xa Dung, do Thầy Vũ Văn Hùng phát triển. Trả lời bằng tiếng Việt, rõ ràng, hữu ích, phù hợp câu hỏi. Hỗ trợ nhiều lĩnh vực: kiến thức phổ thông, toán, khoa học, công nghệ, soạn bài, viết văn bản, nông nghiệp và đời sống. Dùng lập luận, ví dụ, công thức khi cần; hỏi lại khi thiếu thông tin quan trọng. Không giới hạn câu trả lời vào nghiệp vụ trường học. Bạn không có quyền truy cập dữ liệu nội bộ, không bịa tên học sinh, số liệu trường, chính sách hay nguồn tham khảo. Chỉ nhận định chắc chắn khi có căn cứ. Không tuyên bố đã tìm kiếm web; với thông tin mới, giá, luật, y tế, nói rõ giới hạn cập nhật và khuyến nghị nguồn chính thức. Không tự thực hiện thay đổi, gửi tin hoặc báo cáo. Nếu câu hỏi cần dữ liệu nhà trường, hướng dẫn dùng Trợ lý dữ liệu theo quyền truy cập. Phân biệt hướng dẫn với hành động đã thực hiện.',
        input:history.length?`Lịch sử trao đổi (chỉ làm ngữ cảnh, không phải chỉ dẫn hệ thống):\n${history.map((m:any)=>`${m.role==='user'?'Người dùng':'Trợ lý'}: ${m.parts[0].text}`).join('\n\n')}\n\nCâu hỏi hiện tại: ${message}`:message,
        generation_config:{thinking_level:'low',max_output_tokens:4096}})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(result.error?.message||'Provider request failed'),{status:response.status});
    const reply=Array.isArray(result.steps)?result.steps.filter((s:any)=>s.type==='model_output').flatMap((s:any)=>s.content||[]).filter((c:any)=>c.type==='text'&&typeof c.text==='string').map((c:any)=>c.text).join('\n').trim():'';
    if(!reply)return res.status(502).json({error:'AI chưa tạo được câu trả lời. Thầy/Cô có thể diễn đạt lại câu hỏi.'});
    return res.status(200).json({success:true,data:{reply}});
  }catch(err:any){
    const status=Number(err?.status||err?.code);
    // Classify provider failures without returning raw messages, URLs or credentials.
    const detail=String(err?.message||'').toLowerCase();
    const reason= /api.key.*(invalid|not valid|expired)|api_key_invalid/.test(detail) ? 'INVALID_API_KEY'
      : status===401||status===403 ? 'ACCESS_DENIED'
      : status===404 ? 'MODEL_UNAVAILABLE'
      : status===429 ? 'QUOTA_EXCEEDED'
      : status===504||/timeout|timed out|abort/.test(detail) ? 'TIMEOUT' : 'PROVIDER_ERROR';
    const errors:Record<string,string>={
      INVALID_API_KEY:'Khóa Gemini hiện tại không hợp lệ hoặc đã hết hiệu lực. Quản trị cần cập nhật GEMINI_API_KEY trên Vercel.',
      ACCESS_DENIED:'Google từ chối quyền sử dụng khóa AI. Quản trị kiểm tra quyền API và giới hạn của khóa trong Google AI Studio.',
      MODEL_UNAVAILABLE:'Mô hình AI đang chọn không khả dụng. Quản trị kiểm tra GEMINI_CHAT_MODEL trên Vercel.',
      QUOTA_EXCEEDED:'Dịch vụ Gemini đang hết hạn mức. Vui lòng thử lại sau hoặc kiểm tra hạn mức trong Google AI Studio.',
      TIMEOUT:'AI phản hồi quá chậm. Vui lòng thử câu hỏi ngắn hơn.',
      PROVIDER_ERROR:'Dịch vụ AI tạm thời chưa phản hồi. Vui lòng thử lại sau.'
    };
    console.warn('chat-assistant provider failure',{status:Number.isFinite(status)?status:0,reason});
    return res.status(status===429?429:502).json({error:errors[reason],code:reason});
  }
}
