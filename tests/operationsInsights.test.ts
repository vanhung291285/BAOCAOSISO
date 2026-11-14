import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOperationsSnapshot,answerOperationsQuestion,operationsBrief} from '../src/services/operationsInsights';
import type {ClassItem,DailyReport,DailyReportValue,IndicatorGroup} from '../src/types';
const classes=[{id:'a',class_name:'6A1',active:true},{id:'b',class_name:'6A2',active:true}] as ClassItem[];
const indicators=[{id:'all',code:'ALL'}] as IndicatorGroup[];
const report={id:'r',class_id:'a',report_date:'2026-11-14',status:'SUBMITTED',updated_at:'2026-11-14T00:00:00Z',absent_students:[]} as DailyReport;
const value={id:'v',report_id:'r',indicator_group_id:'all',total_count:30,present_count:30,absent_count:0} as DailyReportValue;
test('no reports means unknown attendance, never 100 percent',()=>{
  const s=buildOperationsSnapshot('2026-11-14',classes,[],[],indicators);
  assert.equal(s.totals.rate,null);assert.equal(s.totals.reported,0);assert.equal(s.totals.missing,2);
  assert.match(answerOperationsQuestion('học sinh vắng',s),/Chưa có báo cáo hợp lệ/);
});
test('only valid submitted data is counted; missing classes stay visible',()=>{
  const s=buildOperationsSnapshot('2026-11-14',classes,[report],[value],indicators);
  assert.equal(s.totals.reported,1);assert.equal(s.totals.total,30);assert.equal(s.totals.missing,1);
  assert.match(operationsBrief(s,'Trường'),/1\/2 lớp/);assert.match(answerOperationsQuestion('lớp chưa báo',s),/6A2/);
  assert.match(answerOperationsQuestion('tuần này có bao nhiêu học sinh vắng',s),/chưa có dữ liệu/);
});
test('drafts, missing ALL, inconsistent counts and other dates cannot count as reported',()=>{
  for(const [r,v] of [[{...report,status:'DRAFT'},value],[report,{...value,indicator_group_id:'other'}],[report,{...value,present_count:31}],[{...report,report_date:'2026-11-13'},value]]){
    const s=buildOperationsSnapshot('2026-11-14',classes,[r as DailyReport],[v as DailyReportValue],indicators);
    assert.equal(s.totals.reported,0);assert.equal(s.totals.rate,null);
  }
});
test('absence list discrepancies are explicit',()=>{
  const s=buildOperationsSnapshot('2026-11-14',classes,[report],[{...value,present_count:29,absent_count:1}],indicators);
  assert.match(s.rows[0].issues.join(),/Danh sách vắng có 0 em/);
});
