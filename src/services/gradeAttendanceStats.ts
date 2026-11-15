import type { ClassReportRow, SchoolOffDay } from '../types';

export function attendanceDayOff(date: string, campusId: string | undefined, offDays: SchoolOffDay[], allowSaturday = false): string | null {
  const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  const configured = offDays.find(d => d.date === date && (!d.applies_to || d.applies_to === 'ALL' || d.applies_to === campusId));
  if (configured) return configured.name;
  if (weekday === 0) return 'Chủ nhật · Ngày nghỉ';
  if (weekday === 6 && !allowSaturday) return 'Thứ bảy · Ngày nghỉ';
  return null;
}

export function gradeAttendanceStats(rows: ClassReportRow[], indicatorId: string | undefined, date: string, offDays: SchoolOffDay[], allowSaturday = false) {
  return [6, 7, 8, 9].map(grade => {
    const group = rows.filter(r => Number(r.classItem.grade) === grade);
    const eligible = group.filter(r => !attendanceDayOff(date, r.classItem.campus_id, offDays, allowSaturday));
    const valid = eligible.filter(r => {
      const v = indicatorId ? r.values[indicatorId] : undefined;
      return ['REPORTED', 'LOCKED'].includes(r.status) && !!r.report && ['SUBMITTED', 'LOCKED'].includes(r.report.status)
        && r.report.report_date.split('T')[0] === date && !!v
        && [v.total, v.present, v.absent].every(n => Number.isInteger(n) && n >= 0)
        && v.total > 0 && v.present + v.absent === v.total;
    });
    const sum = (key: 'total' | 'present' | 'absent') => valid.reduce((s, r) => s + r.values[indicatorId!][key], 0);
    const totalStudents = sum('total'), presentStudents = sum('present'), absentStudents = sum('absent');
    return { grade, totalClasses: group.length, eligibleClasses: eligible.length, offClasses: group.length - eligible.length,
      isOffDay: group.length > 0 && eligible.length === 0, reportedClasses: valid.length,
      totalStudents, presentStudents, absentStudents, rate: totalStudents ? Math.round(presentStudents / totalStudents * 1000) / 10 : null };
  });
}
