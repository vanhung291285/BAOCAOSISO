import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceDayOff, gradeAttendanceStats } from '../src/services/gradeAttendanceStats';
import type { ClassReportRow, SchoolOffDay } from '../src/types';
const row = (id: string, status = 'REPORTED', date = '2026-11-16', campus = 'a') => ({classItem:{id,grade:6,campus_id:campus},status,report:{status:'SUBMITTED',report_date:date},values:{all:{total:30,present:28,absent:2,rate:0},boarding:{total:20,present:20,absent:0,rate:0}}} as unknown as ClassReportRow);
test('unreported roster defaults never count as attendance or 100 percent',()=>{
 const result=gradeAttendanceStats([row('a','NOT_REPORTED')],'all','2026-11-16',[])[0];
 assert.equal(result.totalStudents,0);assert.equal(result.presentStudents,0);assert.equal(result.rate,null);
});
test('Sunday excludes even saved reports without deleting them',()=>{
 const result=gradeAttendanceStats([row('a','REPORTED','2026-11-15')],'all','2026-11-15',[])[0];
 assert.equal(result.isOffDay,true);assert.equal(result.rate,null);assert.equal(result.reportedClasses,0);
});
test('partial reporting counts only valid reports for selected date and ALL indicator',()=>{
 const invalid=row('bad');invalid.values.all.present=31;
 const result=gradeAttendanceStats([row('a'),row('b','NOT_REPORTED'),row('old','REPORTED','2026-11-13'),invalid],'all','2026-11-16',[])[0];
 assert.equal(result.totalStudents,30);assert.equal(result.reportedClasses,1);assert.equal(result.presentStudents,28);assert.equal(result.rate,93.3);
 assert.equal(gradeAttendanceStats([row('a')],undefined,'2026-11-16',[])[0].rate,null);
});
test('campus holiday excludes only its campus; Saturday respects settings',()=>{
 const off=[{date:'2026-11-16',name:'Nghỉ riêng',applies_to:'a'}] as SchoolOffDay[];
 const result=gradeAttendanceStats([row('a'),row('b','REPORTED','2026-11-16','b')],'all','2026-11-16',off)[0];
 assert.equal(result.offClasses,1);assert.equal(result.reportedClasses,1);assert.equal(result.totalStudents,30);
 assert.ok(attendanceDayOff('2026-11-14','a',[],false));assert.equal(attendanceDayOff('2026-11-14','a',[],true),null);
});
