import type {BoardingDailyReport, SchoolSettings, SchoolOffDay, ClassItem} from '../types';
import {getMealScheduleForDate} from '../utils/boardingRules';
// Never infer registered meals from enrolment or attendance percentages.
export function plannedMeals(date:string, classes:ClassItem[], reports:BoardingDailyReport[], settings:Partial<SchoolSettings>, offDays:SchoolOffDay[]) {
  let breakfast=0,lunch=0,dinner=0,submitted=0,open=0;
  for(const c of classes) {
    const schedule=getMealScheduleForDate(date,offDays.filter(d=>!d.applies_to||d.applies_to==='ALL'||d.applies_to===c.campus_id),settings);
    if(!schedule.isMealDay) continue;
    open++;
    const r=reports.filter(r=>r.class_id===c.id&&r.date.split('T')[0]===date&&['SUBMITTED','LOCKED'].includes(r.status)).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))[0];
    if(!r || ![r.total_boarding_students,r.breakfast_count,r.lunch_count,r.dinner_count].every(n=>Number.isSafeInteger(n)&&n>=0) || [r.breakfast_count,r.lunch_count,r.dinner_count].some(n=>n>r.total_boarding_students)) continue;
    submitted++;
    breakfast+=schedule.breakfastAllowed?r.breakfast_count:0;
    lunch+=schedule.lunchAllowed?r.lunch_count:0;
    dinner+=schedule.dinnerAllowed?r.dinner_count:0;
  }
  return {breakfast,lunch,dinner,submitted,open,notes:!open?'Ngày nghỉ / không tổ chức ăn: 0 suất.':`Đã đăng ký ${submitted}/${open} lớp. ${submitted<open?'Chưa đủ đăng ký; số 0 chưa phải kết luận không ăn.':'Đã đủ báo ăn trong phạm vi.'}`};
}
