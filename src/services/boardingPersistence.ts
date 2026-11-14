import type {SupabaseClient} from '@supabase/supabase-js';
import type {BoardingDailyReport} from '../types';
export async function persistBoardingReports(client:SupabaseClient|null,reports:BoardingDailyReport[]):Promise<BoardingDailyReport[]> {
  if(!client) throw new Error('Chưa kết nối Supabase. Báo ăn chưa được lưu.');
  if(!reports.length) return [];
  for(const r of reports) {
    const counts=[r.total_boarding_students,r.breakfast_count,r.lunch_count,r.dinner_count,r.absent_count,r.total_meals];
    if(!counts.every(n=>Number.isSafeInteger(n)&&n>=0)||
      [r.breakfast_count,r.lunch_count,r.dinner_count,r.absent_count].some(n=>n>r.total_boarding_students)||
      r.total_meals!==r.breakfast_count+r.lunch_count+r.dinner_count) {
      throw new Error('Số liệu báo ăn không hợp lệ. Kiểm tra sĩ số, số vắng và tổng suất ăn.');
    }
  }
  const {data,error}=await client.from('boarding_reports').upsert(reports.map(({id:_id,created_at:_created,...r})=>r),{onConflict:'class_id,date'}).select('*');
  if(error) throw new Error(`Máy chủ chưa xác nhận báo ăn: ${error.message}`);
  if(!data||data.length!==reports.length) throw new Error('Máy chủ chưa xác nhận đủ báo ăn. Vui lòng thử lại.');
  return data as BoardingDailyReport[];
}
