/**
 * AI Teacher Assistant Service (Hỗ trợ GVCN soạn thảo báo cáo BGH & viết nhận xét học sinh)
 * Hỗ trợ song song cả Server API (khi chạy Node.js/Cloud Run) và Client Fallback Engine (khi đưa lên Vercel static hosting)
 */

export interface ClassReportParams {
  className: string;
  teacherName: string;
  schoolName: string;
  periodType: 'WEEK' | 'MONTH';
  periodLabel: string;
  attendanceStats: any;
  boardingStats: any;
  absentDetails: any[];
  specialNotes: string[];
  tone?: string;
}

export interface SpecialAttentionCase {
  studentName: string;
  village: string;
  absentCount: number;
  reasons: string;
  interventionTaken: string;
}

export interface ClassReportSummaryResult {
  reportTitle: string;
  recipient: string;
  overview: string;
  attendanceAnalysis: string;
  boardingAnalysis: string;
  specialAttentionCases: SpecialAttentionCase[];
  classStrengths: string[];
  classChallenges: string[];
  recommendationsToBGH: string[];
  fullDocumentText: string;
}

export interface StudentEvaluateData {
  id: string;
  full_name: string;
  gender?: string;
  address?: string;
  village?: string;
  isBoarding?: boolean;
  is_boarding?: boolean;
  absentCount?: number;
  absentReasons?: string[];
  consecutiveAbsences?: number;
}

export interface StudentRemarkItem {
  studentId: string;
  studentName: string;
  category: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'SPECIAL_ATTENTION';
  categoryLabel: string;
  remarkText: string;
  conductSuggestion: 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đánh giá';
  strengths: string;
  notesForParent: string;
}

export interface StudentRemarksResult {
  className: string;
  periodType: string;
  summaryClassRemarks: string;
  remarks: StudentRemarkItem[];
}

export async function postAI<T>(path: string, params: unknown): Promise<T> {
  const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(params), signal:AbortSignal.timeout(55000)});
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'AI chưa trả về kết quả. Vui lòng thử lại sau.');
  return result.data;
}

export const aiTeacherAssistantService = {
  generateClassReport(params: ClassReportParams): Promise<ClassReportSummaryResult> {
    return postAI('/api/ai/class-report-summary', params);
  },
  generateStudentRemarks(params: {className:string; periodType:string; studentsData:StudentEvaluateData[]}): Promise<StudentRemarksResult> {
    return postAI('/api/ai/student-periodic-remarks', params);
  },
};
