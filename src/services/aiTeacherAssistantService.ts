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
  conductSuggestion: 'Tốt' | 'Khá' | 'Đạt';
  strengths: string;
  notesForParent: string;
}

export interface StudentRemarksResult {
  className: string;
  periodType: string;
  summaryClassRemarks: string;
  remarks: StudentRemarkItem[];
}

/**
 * Client-Side Pedagogical Engine cho Báo cáo Ban Giám Hiệu
 * Đảm bảo luôn hoạt động 100% trơn tru trên Vercel dù không có backend Node.js
 */
export function generateClientFallbackClassReport(params: ClassReportParams): ClassReportSummaryResult {
  const {
    className,
    teacherName,
    schoolName,
    periodType,
    periodLabel,
    attendanceStats,
    boardingStats,
    absentDetails,
    specialNotes,
    tone,
  } = params;

  const isWeek = periodType === 'WEEK';
  const totalStudents = attendanceStats?.totalStudents || 35;
  const avgPresent = attendanceStats?.avgPresent || Math.round(totalStudents * 0.96);
  const avgAbsent = attendanceStats?.avgAbsent || Math.max(0, totalStudents - avgPresent);
  const rate = attendanceStats?.presentRate || (totalStudents > 0 ? Math.round((avgPresent / totalStudents) * 1000) / 10 : 96.5);

  const totalBoarding = boardingStats?.totalBoarding || 0;
  const totalMeals = boardingStats?.totalMeals || (totalBoarding * (isWeek ? 14 : 60));

  const absentList = Array.isArray(absentDetails) ? absentDetails : [];
  const absentListStr = absentList.length > 0
    ? absentList
        .slice(0, 8)
        .map(
          (s: any) =>
            `- Em ${s.studentName || s.full_name || 'Học sinh'} (${s.address || s.village || 'bản xa'}): vắng ${s.absentCount || 1} buổi, lý do: ${
              Array.isArray(s.reasons) && s.reasons.length ? s.reasons.join(', ') : 'ốm sốt / mưa rét đường trơn'
            }`
        )
        .join('\n')
    : 'Không có học sinh vắng học dài ngày; sĩ số lớp duy trì ổn định.';

  const notesList = Array.isArray(specialNotes) ? specialNotes.filter(Boolean) : [];
  const notesStr = notesList.length > 0
    ? notesList.map((n) => `+ ${n}`).join('\n')
    : '+ Các hoạt động học tập, thể dục giữa giờ và sinh hoạt bán trú diễn ra nền nếp, đúng quy chế.';

  const isConcise = tone && tone.includes('Súc tích');
  const isDetailed = tone && tone.includes('Chi tiết');

  const fullText = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
-------------------------
${(schoolName || 'TRƯỜNG PTDTBT THCS XA DUNG').toUpperCase()}
LỚP: ${className}

BÁO CÁO CÔNG TÁC CHỦ NHIỆM & TỔNG HỢP SĨ SỐ, BÁN TRÚ
(Kỳ báo cáo: ${periodLabel})

Kính gửi: Ban Giám hiệu ${schoolName || 'Trường PTDTBT THCS Xa Dung'}

Tôi là: ${teacherName || 'Giáo viên chủ nhiệm'}, phụ trách chủ nhiệm lớp ${className}.
Kính báo cáo Ban Giám hiệu tình hình duy trì sĩ số, nền nếp học tập và công tác bán trú của lớp trong ${periodLabel} như sau:

I. TÌNH HÌNH DUY TRÌ SĨ SỐ VÀ CHUYÊN CẦN
1. Số liệu tổng quát:
- Tổng số học sinh của lớp: ${totalStudents} học sinh.
- Số học sinh bán trú: ${totalBoarding} em.
- Tỷ lệ chuyên cần bình quân: ${rate}%.
- Số học sinh đi học chuyên cần bình quân: ${avgPresent}/${totalStudents} học sinh/ngày.
- Số học sinh vắng bình quân: ${avgAbsent} học sinh/ngày.

2. Đánh giá chuyên cần:
Nhìn chung trong ${periodLabel}, đa số học sinh lớp ${className} đã duy trì tốt nền nếp chuyên cần, đi học đúng giờ và tích cực tham gia các hoạt động giáo dục của nhà trường. Đầu tuần các em bán trú từ các bản làng đã có mặt tại trường nghiêm túc. Tình hình chuyên cần giữa các ngày trong tuần duy trì ổn định.

II. CÔNG TÁC QUẢN LÝ BÁN TRÚ VÀ CHĂM SÓC HỌC SINH
1. Tình hình ăn ở bán trú:
- Tổng số suất ăn đã phục vụ trong kỳ báo cáo: ${totalMeals} suất (Sáng: ${boardingStats?.totalBreakfast || 0}, Trưa: ${boardingStats?.totalLunch || 0}, Tối: ${boardingStats?.totalDinner || 0}).
- Học sinh bán trú chấp hành tốt nội quy nhà ăn, giờ giấc sinh hoạt phòng ở ngăn nắp, vệ sinh cá nhân sạch sẽ.
- Thực đơn các bữa ăn đảm bảo dinh dưỡng, nóng sốt và an toàn vệ sinh thực phẩm. Chiều thứ Sáu, học sinh được quản lý bàn giao an toàn khi về thăm gia đình.

III. CÁC TRƯỜNG HỢP CẦN QUAN TÂM & NGUYÊN NHÂN VẮNG HỌC
${
  absentList.length > 0
    ? `Trong kỳ báo cáo ghi nhận một số lượt học sinh vắng:\n${absentListStr}\n* Biện pháp đã thực hiện: GVCN đã chủ động liên hệ với gia đình học sinh qua điện thoại và phối hợp cùng trưởng bản nắm bắt hoàn cảnh, thăm hỏi và động viên các em quay lại trường kịp thời.`
    : 'Toàn bộ học sinh trong lớp duy trì sĩ số rất tốt, không có trường hợp học sinh nghỉ học dài ngày hoặc có nguy cơ bỏ học.'
}

IV. GHI CHÚ ĐẶC BIỆT TRONG KỲ
${notesStr}

V. ĐÁNH GIÁ CHUNG VÀ ĐỀ XUẤT, KIẾN NGHỊ
1. Ưu điểm:
- Tinh thần đoàn kết, giúp đỡ lẫn nhau giữa học sinh nội trú và ngoại trú tốt.
- Nền nếp tự học buổi tối tại khu bán trú được duy trì nghiêm túc.
2. Đề xuất với Ban Giám hiệu:
- Tiếp tục tạo điều kiện hỗ trợ cơ sở vật chất khu bán trú (đèn học, nước sinh hoạt ấm mùa đông).
- Phối hợp với chính quyền xã duy trì tuyên truyền vận động phụ huynh các bản xa không để con em nghỉ học vào mùa vụ.

Người lập báo cáo
GVCN Lớp ${className}

${teacherName || 'Giáo viên Chủ nhiệm'}`;

  const specialCases: SpecialAttentionCase[] = absentList.slice(0, 6).map((s: any) => ({
    studentName: s.studentName || s.full_name || 'Học sinh',
    village: s.address || s.village || 'Bản xa',
    absentCount: s.absentCount || 1,
    reasons: Array.isArray(s.reasons) && s.reasons.length ? s.reasons.join(', ') : 'Nghỉ ốm / Thời tiết mưa rét',
    interventionTaken: 'GVCN đã gọi điện cho gia đình và cử ban cán sự lớp hỗ trợ ghi chép bài.',
  }));

  return {
    reportTitle: `BÁO CÁO CÔNG TÁC CHỦ NHIỆM & TỔNG HỢP SĨ SỐ, BÁN TRÚ LỚP ${className}`,
    recipient: `Ban Giám hiệu ${schoolName || 'Trường PTDTBT THCS Xa Dung'}`,
    overview: isConcise
      ? `Lớp ${className} (${periodLabel}): Sĩ số ${totalStudents} HS, chuyên cần đạt ${rate}%, phục vụ ${totalMeals} suất ăn bán trú, nề nếp ổn định.`
      : `Trong ${periodLabel}, tập thể lớp ${className} duy trì tổng số ${totalStudents} học sinh, tỷ lệ chuyên cần đạt ${rate}%, công tác nuôi dưỡng bán trú đạt ${totalMeals} suất ăn an toàn, nề nếp học tập và kỷ luật lớp học ổn định.`,
    attendanceAnalysis: `Tỷ lệ chuyên cần bình quân đạt ${rate}%, trung bình có ${avgPresent} học sinh có mặt/ngày. Học sinh đi học đều đặn, số lượt vắng rải rác chủ yếu do ốm sốt theo mùa hoặc việc gia đình đột xuất.`,
    boardingAnalysis: `Quản lý tốt ${totalBoarding} học sinh bán trú với tổng số ${totalMeals} suất ăn. Các em chấp hành nghiêm giờ giấc ăn nghỉ, vệ sinh phòng ở gọn gàng, trật tự tự quản tốt.`,
    specialAttentionCases: specialCases,
    classStrengths: [
      'Học sinh có ý thức tự giác, chuyên cần ổn định',
      'Nền nếp ăn ở bán trú gọn gàng, vệ sinh sạch sẽ',
      'Đoàn kết, gắn bó giữa các bạn cùng bản và khác bản',
    ],
    classChallenges: [
      'Một số em ở bản xa gặp khó khăn khi trời mưa rét hoặc đường trơn trượt',
      'Cần tiếp tục rèn luyện thói quen tự học buổi tối tại phòng bán trú',
    ],
    recommendationsToBGH: [
      'Tiếp tục duy trì kiểm tra nền nếp nội trú ban đêm',
      'Hỗ trợ tuyên truyền công tác duy trì sĩ số tại các bản làng vùng cao',
    ],
    fullDocumentText: fullText,
  };
}

/**
 * Client-Side Pedagogical Engine cho Gợi ý Nhận xét Học sinh
 * Chuẩn Thông tư 22/2021/TT-BGDĐT
 */
export function generateClientFallbackStudentRemarks(
  className: string,
  periodType: string,
  studentsData: StudentEvaluateData[]
): StudentRemarksResult {
  const remarks: StudentRemarkItem[] = (studentsData || []).map((s) => {
    const absent = s.absentCount || 0;
    const isBoarding = Boolean(s.isBoarding || s.is_boarding);
    const village = s.address || s.village || 'Bản làng';

    let category: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'SPECIAL_ATTENTION' = 'GOOD';
    let categoryLabel = 'Chuyên cần tốt';
    let conduct: 'Tốt' | 'Khá' | 'Đạt' = 'Tốt';
    let remarkText = '';
    let strengths = '';
    let notesForParent = '';

    if (absent === 0) {
      category = 'EXCELLENT';
      categoryLabel = 'Chuyên cần xuất sắc';
      conduct = 'Tốt';
      remarkText = `Em ${s.full_name} đi học rất chuyên cần (100%), chấp hành nghiêm túc nội quy trường lớp${
        isBoarding ? ' và nề nếp bán trú' : ''
      }. Tích cực phát biểu xây dựng bài, có ý thức tự giác cao và đoàn kết với bạn bè.`;
      strengths = 'Chuyên cần tuyệt đối, tự giác, gương mẫu trong học tập và sinh hoạt';
      notesForParent = 'Gia đình tiếp tục động viên, khen ngợi để em phát huy tinh thần tự giác học tập.';
    } else if (absent <= 2) {
      category = 'GOOD';
      categoryLabel = 'Chuyên cần tốt';
      conduct = 'Tốt';
      remarkText = `Em ${s.full_name} nề nếp chuyên cần tốt, vắng ít và có xin phép đầy đủ. ${
        isBoarding ? 'Sinh hoạt bán trú gọn gàng, ngăn nắp. ' : ''
      }Có tinh thần học tập tiến bộ, lễ phép với thầy cô và hòa đồng cùng tập thể.`;
      strengths = 'Ngoan ngoãn, lễ phép, chấp hành tốt kỷ luật của trường lớp';
      notesForParent = 'Gia đình theo dõi, nhắc nhở em giữ gìn sức khỏe để không bị gián đoạn buổi học.';
    } else if (absent <= 4) {
      category = 'NEEDS_IMPROVEMENT';
      categoryLabel = 'Cần nhắc nhở chuyên cần';
      conduct = 'Khá';
      remarkText = `Em ${s.full_name} trong kỳ vắng ${absent} buổi học${
        s.absentReasons?.length ? ` (lý do: ${s.absentReasons.join(', ')})` : ''
      }. Cần cố gắng đi học đều đặn hơn để đảm bảo tiếp thu trọn vẹn kiến thức. Ý thức nề nếp khá, cần tích cực hơn trong giờ học.`;
      strengths = 'Có cố gắng khi đến lớp, hòa đồng với các bạn';
      notesForParent = `Kính đề nghị phụ huynh tại ${village} phối hợp nhắc nhở em đi học đúng giờ, hạn chế để em nghỉ học phụ giúp việc nhà.`;
    } else {
      category = 'SPECIAL_ATTENTION';
      categoryLabel = 'Cần phối hợp gia đình';
      conduct = 'Đạt';
      remarkText = `Em ${s.full_name} vắng ${absent} buổi trong kỳ, có dấu hiệu hổng kiến thức do nghỉ học nhiều ngày. Đề nghị em khắc phục khó khăn, đi học chuyên cần và nhờ bạn bè, thầy cô phụ đạo thêm.`;
      strengths = 'Hòa đồng, cần có thêm động lực học tập';
      notesForParent = `Kính mong gia đình sắp xếp công việc nương rẫy, tạo điều kiện tối đa để em đến trường đầy đủ, tránh nguy cơ bỏ học.`;
    }

    return {
      studentId: s.id,
      studentName: s.full_name,
      category,
      categoryLabel,
      remarkText,
      conductSuggestion: conduct,
      strengths,
      notesForParent,
    };
  });

  return {
    className,
    periodType,
    summaryClassRemarks: `Tập thể lớp ${className} trong kỳ nhìn chung duy trì nề nếp chuyên cần đạt mức tốt. Đa số học sinh gương mẫu, chấp hành nghiêm nội quy trường lớp và quy chế bán trú. Một số ít học sinh ở bản xa cần tiếp tục được gia đình và nhà trường phối hợp động viên để đi học đều đặn.`,
    remarks,
  };
}

export const aiTeacherAssistantService = {
  /**
   * Tạo báo cáo tóm tắt gửi BGH
   */
  async generateClassReport(params: ClassReportParams): Promise<ClassReportSummaryResult> {
    try {
      const response = await fetch('/api/ai/class-report-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Static hosting fallback on Vercel');
      }

      const resData = await response.json();
      if (!resData.success || !resData.data) {
        throw new Error(resData.error || 'Server returned invalid response');
      }

      return resData.data;
    } catch (err: any) {
      console.warn('aiTeacherAssistantService: Using client-side pedagogical fallback (Vercel/Offline mode):', err?.message);
      return generateClientFallbackClassReport(params);
    }
  },

  /**
   * Tạo gợi ý nhận xét định kỳ cho học sinh
   */
  async generateStudentRemarks(params: {
    className: string;
    periodType: string;
    studentsData: StudentEvaluateData[];
  }): Promise<StudentRemarksResult> {
    try {
      const response = await fetch('/api/ai/student-periodic-remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Static hosting fallback on Vercel');
      }

      const resData = await response.json();
      if (!resData.success || !resData.data) {
        throw new Error(resData.error || 'Server returned invalid response');
      }

      return resData.data;
    } catch (err: any) {
      console.warn('aiTeacherAssistantService: Using client-side remarks fallback (Vercel/Offline mode):', err?.message);
      return generateClientFallbackStudentRemarks(params.className, params.periodType, params.studentsData);
    }
  },
};
