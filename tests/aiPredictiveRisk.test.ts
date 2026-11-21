import test from 'node:test';
import assert from 'node:assert/strict';
import { AIPredictiveService } from '../src/services/aiPredictiveService';

const student = (id: string, classId: string, isBoarding = false, address = '') =>
  ({ id, full_name: 'Học sinh thử nghiệm', class_id: classId, isBoarding, address }) as any;
const cls = (id: string) => ({ id, class_name: id }) as any;
const report = (classId: string, date: string, absent = false, reason = 'Ốm') =>
  ({ class_id: classId, report_date: date, status: 'SUBMITTED', absent_students: absent ?
    [{ id: 's1', full_name: 'Học sinh thử nghiệm', reason }] : [] }) as any;

test('denominator uses only submitted days of the student class', () => {
  const result = AIPredictiveService.calculateDropoutRisk(
    [student('s1', 'a')], [cls('a'), cls('b')],
    [report('a', '2026-11-02', true), report('a', '2026-11-03'), report('b', '2026-11-04')]
  )[0];
  assert.equal(result.totalSchoolDays, 2);
  assert.equal(result.totalDaysAbsent, 1);
  assert.equal(result.absentRate, 50);
  assert.equal(result.consecutiveAbsences, 0);
});

test('boarding status and residential address do not alter risk score', () => {
  const reports = [report('a', '2026-11-02', true), report('a', '2026-11-03')];
  const risks = AIPredictiveService.calculateDropoutRisk(
    [student('s1', 'a'), student('s2', 'a', true, 'Bản xa')], [cls('a')], reports
  );
  assert.equal(risks[0].riskScore, risks[1].riskScore);
});

test('a reason containing the letter k is not automatically unexcused', () => {
  const risk = AIPredictiveService.calculateDropoutRisk(
    [student('s1', 'a')], [cls('a')], [report('a', '2026-11-02', true, 'Khám bệnh')]
  )[0];
  assert.equal(risk.unexcusedCount, 0);
});

test('no submitted reports is insufficient evidence, not a calibrated prediction', () => {
  const risk = AIPredictiveService.calculateDropoutRisk([student('s1', 'a')], [cls('a')], [])[0];
  assert.equal(risk.totalSchoolDays, 0);
  assert.equal(risk.absentRate, 0);
  assert.match(risk.warningFlags.join(' '), /Chưa có dữ liệu/);
});
