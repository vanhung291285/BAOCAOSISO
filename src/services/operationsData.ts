import type { ClassItem, DailyReport, DailyReportValue, BoardingDailyReport } from '../types';
import { getSupabaseClient } from './supabase';
// Read only the chosen date and visible classes; avoid downloading all years.
export async function loadOperationsData(date:string, classes:ClassItem[]) {
  const client=getSupabaseClient();
  if(!client) throw new Error('Chưa cấu hình kết nối Supabase.');
  if(!classes.length) return {reports:[],values:[],boarding:[],boardingWarning:''};
  const ids=classes.map(c=>c.id);
  const reports:DailyReport[]=[]; const values:DailyReportValue[]=[];
  for(let i=0;i<ids.length;i+=100) {
    const {data,error}=await client.from('daily_reports').select('*').eq('report_date',date).in('class_id',ids.slice(i,i+100));
    if(error) throw new Error(`Không tải được báo cáo: ${error.message}`);
    reports.push(...(data??[]));
  }
  const reportIds=reports.map(r=>r.id);
  for(let i=0;i<reportIds.length;i+=50) {
    // Paginate indicator rows, including schools with many configured indicators.
    for(let offset=0;;offset+=500) {
      const {data,error}=await client.from('daily_report_values').select('*').in('report_id',reportIds.slice(i,i+50)).order('id').range(offset,offset+499);
      if(error) throw new Error(`Không tải đủ chỉ tiêu: ${error.message}`);
      values.push(...(data??[])); if((data?.length??0)<500) break;
    }
  }
  const boarding:BoardingDailyReport[]=[]; let boardingWarning='';
  for(let i=0;i<ids.length;i+=100) {
    const {data,error}=await client.from('boarding_reports').select('*').eq('date',date).in('class_id',ids.slice(i,i+100));
    if(error) {boardingWarning='Chưa đối chiếu được dữ liệu báo ăn. Số liệu sĩ số vẫn được hiển thị độc lập.';break;}
    boarding.push(...(data??[]));
  }
  return {reports,values,boarding,boardingWarning};
}
