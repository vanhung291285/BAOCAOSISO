import type { ClassItem, DailyReport, DailyReportValue, IndicatorGroup, BoardingDailyReport } from '../types';
export interface ClassInsight {
  classItem:ClassItem; report?:DailyReport; state:'missing'|'incomplete'|'valid';
  total:number; present:number; absent:number; issues:string[];
}
export interface OperationsSnapshot {
  date:string; checkedAt:string; rows:ClassInsight[];
  totals:{classes:number;reported:number;missing:number;incomplete:number;total:number;present:number;absent:number;rate:number|null};
}
const validValue=(v:DailyReportValue)=>[v.total_count,v.present_count,v.absent_count].every(n=>Number.isSafeInteger(n)&&n>=0)
  && v.total_count>0 && v.present_count+v.absent_count===v.total_count;
export function buildOperationsSnapshot(date:string, classes:ClassItem[], reports:DailyReport[], values:DailyReportValue[], indicators:IndicatorGroup[], boarding:BoardingDailyReport[] = [], checkedAt=new Date().toISOString()):OperationsSnapshot {
  const allIds=new Set(indicators.filter(i=>i.code==='ALL').map(i=>i.id));
  const boardingIds=new Set(indicators.filter(i=>i.code==='BOARDING_HALF').map(i=>i.id));
  const rows=classes.filter(c=>c.active).map(classItem=>{
    const candidates=reports.filter(r=>r.class_id===classItem.id && r.report_date.split('T')[0]===date)
      .sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
    const report=candidates[0]; const issues:string[]=[];
    const entries=report ? values.filter(v=>v.report_id===report.id) : [];
    const all=entries.filter(v=>allIds.has(v.indicator_group_id));
    const main=all[0];
    const valid=!!report && ['SUBMITTED','LOCKED'].includes(report.status) && all.length===1 && validValue(main);
    if(candidates.length>1) issues.push('Có nhiều báo cáo cùng lớp/ngày; cần quản trị đối chiếu.');
    if(report && !valid) issues.push('Báo cáo chưa hoàn chỉnh hoặc chỉ tiêu tổng không hợp lệ.');
    if(valid && report?.absent_students?.length !== main.absent_count) issues.push(`Danh sách vắng có ${report?.absent_students?.length ?? 0} em, chỉ tiêu ghi ${main.absent_count} em.`);
    if(valid && report?.absent_students?.some(s=>!s.full_name?.trim() || !s.reason?.trim())) issues.push('Danh sách vắng còn thiếu họ tên hoặc lý do.');
    const half=entries.find(v=>boardingIds.has(v.indicator_group_id));
    const meals=boarding.find(b=>b.class_id===classItem.id&&b.date.split('T')[0]===date&&['SUBMITTED','LOCKED'].includes(b.status));
    if(valid&&half&&meals&&half.total_count!==meals.total_boarding_students) issues.push(`Tổng bán trú ${half.total_count} khác sĩ số đăng ký ăn ${meals.total_boarding_students}.`);
    if(meals&&[meals.breakfast_count,meals.lunch_count,meals.dinner_count].some(n=>n<0||n>meals.total_boarding_students)) issues.push('Suất ăn vượt sĩ số bán trú hoặc có số âm.');
    return {classItem,report,state:!report?'missing':valid?'valid':'incomplete',total:valid?main.total_count:0,present:valid?main.present_count:0,absent:valid?main.absent_count:0,issues} as ClassInsight;
  });
  const good=rows.filter(r=>r.state==='valid');
  const total=good.reduce((s,r)=>s+r.total,0),present=good.reduce((s,r)=>s+r.present,0),absent=good.reduce((s,r)=>s+r.absent,0);
  return {date,checkedAt,rows,totals:{classes:rows.length,reported:good.length,missing:rows.filter(r=>r.state==='missing').length,incomplete:rows.filter(r=>r.state==='incomplete').length,total,present,absent,rate:total?Math.round(present/total*10000)/100:null}};
}
export function operationsBrief(s:OperationsSnapshot,schoolName:string) {
  const t=s.totals;
  const missing=s.rows.filter(r=>r.state!=='valid').map(r=>r.classItem.class_name);
  const issues=s.rows.flatMap(r=>r.issues.map(x=>`${r.classItem.class_name}: ${x}`));
  return [`BÁO CÁO SĨ SỐ — ${schoolName}`,`Ngày báo cáo: ${s.date}`,`Đã xác nhận: ${t.reported}/${t.classes} lớp; chưa báo: ${t.missing}; chưa hoàn chỉnh: ${t.incomplete}.`,
    `Trên các lớp đã báo hợp lệ: tổng ${t.total}, có mặt ${t.present}, vắng ${t.absent}.`,
    `Tỷ lệ có mặt trong phần dữ liệu đã báo: ${t.rate===null?'Chưa có dữ liệu':`${t.rate}%`}.`,
    missing.length?`Chưa có báo cáo hợp lệ: ${missing.join(', ')}.`:'Đủ báo cáo hợp lệ cho phạm vi được chọn.',
    issues.length?`Cần kiểm tra:\n${issues.map(x=>`• ${x}`).join('\n')}`:'Chưa phát hiện sai lệch theo các quy tắc đã kiểm tra.',
    `Đối chiếu máy chủ lúc: ${new Date(s.checkedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}.`,
    'Dự thảo từ dữ liệu đã xác nhận; giáo viên kiểm tra trước khi sử dụng.'].join('\n');
}
export function answerOperationsQuestion(question:string,s:OperationsSnapshot) {
  const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  if(/tuan|thang|hoc ky|nam hoc|hom qua|ngay mai/.test(q)) return `Màn hình này chỉ đối chiếu ngày ${s.date}. Hãy chọn ngày cần xem hoặc mở báo cáo tuần/tháng; tôi chưa có dữ liệu để trả lời kỳ khác.`;
  if(/chua|thieu|nop/.test(q)) return s.rows.filter(r=>r.state!=='valid').map(r=>`${r.classItem.class_name}: ${r.state==='missing'?'chưa báo':'chưa hoàn chỉnh'}`).join('\n')||'Các lớp trong phạm vi đã có báo cáo hợp lệ.';
  if(/sai|lech|kiem tra|bat thuong/.test(q)) return s.rows.flatMap(r=>r.issues.map(x=>`${r.classItem.class_name}: ${x}`)).join('\n')||'Chưa phát hiện sai lệch theo các quy tắc đã kiểm tra.';
  if(/vang|nghi/.test(q)) return s.rows.filter(r=>r.state==='valid').flatMap(r=>(r.report?.absent_students??[]).map(st=>`${r.classItem.class_name} — ${st.full_name}: ${st.reason?.trim()||'Chưa ghi lý do'}`)).join('\n')|| (s.totals.reported ? 'Chưa có tên học sinh vắng trong báo cáo hợp lệ. Xem mục sai lệch nếu số vắng chưa khớp.' : 'Chưa có báo cáo hợp lệ; chưa thể kết luận học sinh có mặt đầy đủ.');
  if(/si so|tong|ty le|bao cao|tinh hinh/.test(q)) return operationsBrief(s,'Phạm vi đang chọn');
  return 'Tôi hỗ trợ số liệu của ngày đang chọn: lớp chưa báo, danh sách vắng, kiểm tra sai lệch và tổng hợp sĩ số. Chưa đủ dữ liệu để trả lời câu hỏi này.';
}
