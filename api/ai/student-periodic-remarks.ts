import { structuredHandler } from '../../server/ai/structured';
export default structuredHandler(b=>typeof b.className==='string'&&Array.isArray(b.studentsData)&&b.studentsData.length>0&&b.studentsData.length<=60,{
 summaryClassRemarks:'Nhận xét dựa trên dữ liệu, không suy diễn rèn luyện',remarks:[{studentId:'id gốc',studentName:'Tên gốc',category:'GOOD',categoryLabel:'Nhận xét chuyên cần cần giáo viên kiểm tra',remarkText:'Nhận xét có căn cứ; thiếu tổng số buổi thì không tính tỷ lệ',conductSuggestion:'Chưa đánh giá',strengths:'Chỉ điểm được ghi nhận hoặc Chưa có dữ liệu',notesForParent:'Gợi ý phối hợp, không quy kết'}]
},(d,b)=>{
 const ids=new Set(b.studentsData.map((s:any)=>s.id));
 if(d.remarks.length!==ids.size||new Set(d.remarks.map((r:any)=>r.studentId)).size!==ids.size||d.remarks.some((r:any)=>!ids.has(r.studentId)||!['EXCELLENT','GOOD','NEEDS_IMPROVEMENT','SPECIAL_ATTENTION'].includes(r.category)))throw new Error('INVALID_STUDENTS');
 return {...d,className:b.className,periodType:b.periodType,remarks:d.remarks.map((r:any)=>({...r,studentName:b.studentsData.find((s:any)=>s.id===r.studentId).full_name,conductSuggestion:'Chưa đánh giá'}))};
});
