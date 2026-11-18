import type { ClassWeeklySummary } from '../types';

export interface ResearchRow {
  id: string;
  name: string;
  days: number;
  present: number;
  absent: number;
}

export function toResearchRow(row: ClassWeeklySummary): ResearchRow {
  return {
    id: row.classItem.id,
    name: row.classItem.class_name,
    days: row.totalSessionsReported,
    present: row.sumPresent,
    absent: row.sumAbsent,
  };
}

export function attendanceRate(present: number, absent: number) {
  const total = present + absent;
  return total > 0 ? (100 * present) / total : null;
}

export function compareResearchWeeks(current: ResearchRow[], baseline: ResearchRow[], minimumDays: number) {
  const baselineByClass = new Map(baseline.map(row => [row.id, row]));
  const matchedIds = new Set<string>();
  let currentPresent = 0;
  let currentAbsent = 0;
  let baselinePresent = 0;
  let baselineAbsent = 0;

  for (const row of current) {
    const other = baselineByClass.get(row.id);
    if (!other || row.days < minimumDays || row.days !== other.days ||
        attendanceRate(row.present, row.absent) === null ||
        attendanceRate(other.present, other.absent) === null) {
      continue;
    }
    matchedIds.add(row.id);
    currentPresent += row.present;
    currentAbsent += row.absent;
    baselinePresent += other.present;
    baselineAbsent += other.absent;
  }

  const currentRate = attendanceRate(currentPresent, currentAbsent);
  const baselineRate = attendanceRate(baselinePresent, baselineAbsent);
  return {
    matchedIds,
    matched: matchedIds.size,
    excluded: current.length - matchedIds.size,
    currentRate,
    baselineRate,
    change: currentRate === null || baselineRate === null
      ? null
      : Math.round((currentRate - baselineRate) * 10) / 10,
  };
}

export const sampleResearchWeeks: Record<number, ResearchRow[]> = {
  10: [
    { id: 'a', name: 'Lớp A', days: 5, present: 126, absent: 24 },
    { id: 'b', name: 'Lớp B', days: 4, present: 108, absent: 12 },
    { id: 'c', name: 'Lớp C', days: 2, present: 53, absent: 7 },
    { id: 'd', name: 'Lớp D', days: 3, present: 72, absent: 18 },
  ],
  11: [
    { id: 'a', name: 'Lớp A', days: 5, present: 135, absent: 15 },
    { id: 'b', name: 'Lớp B', days: 4, present: 105, absent: 15 },
    { id: 'c', name: 'Lớp C', days: 2, present: 56, absent: 4 },
    { id: 'd', name: 'Lớp D', days: 4, present: 105, absent: 15 },
  ],
};
