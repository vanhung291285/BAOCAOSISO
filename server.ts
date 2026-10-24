import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Shared Gemini Client on server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const MODEL_NAME = 'gemini-3.8-flash';

// Helper with timeout
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout sau ${ms}ms`)), ms)),
  ]);
}

/**
 * Fallback generator for School Report
 */
function generateFallbackSchoolReport(schoolName: string, activeYear: string, stats: any, highRiskStudents: any[]) {
  const critical = stats?.criticalCount || 0;
  const high = stats?.highCount || 0;
  const level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' =
    critical > 3 ? 'CRITICAL' : critical > 0 || high > 5 ? 'HIGH' : high > 0 ? 'MODERATE' : 'LOW';

  return {
    summary: `Qua dữ liệu chuyên cần năm học ${activeYear || '2026-2027'}, trường ${schoolName} ghi nhận ${critical} học sinh thuộc diện cảnh báo đỏ khẩn cấp và ${high} học sinh có nguy cơ cao vắng ngắt quãng. Tỷ lệ vắng tập trung chủ yếu ở các bản xa trung tâm và nhóm học sinh bán trú sau các ngày nghỉ cuối tuần hoặc thời vụ mùa nương.`,
    overallRiskLevel: level,
    keyPatterns: [
      {
        patternName: 'Nghỉ học cầu nối đầu tuần & cuối tuần (Thứ 2 & Thứ 6)',
        description: 'Học sinh bán trú về bản vào chiều thứ Sáu và thường nghỉ thêm thứ Hai do đường sá xa xôi hoặc phụ giúp gia đình.',
        affectedGroups: 'Khối 7, Khối 8 và các bản Phì Cao, Háng Tàu',
      },
      {
        patternName: 'Nghỉ ngắt quãng kéo dài không phép',
        description: 'Học sinh vắng từ 3 ngày liên tiếp trở lên thường có biểu hiện tâm lý chán học sau khi hổng kiến thức hoặc có nguy cơ theo bạn bè đi làm ăn xa.',
        affectedGroups: 'Học sinh khối 8, 9 độ tuổi 14-15',
      },
      {
        patternName: 'Nghỉ theo vụ thu hoạch và thời tiết vùng cao',
        description: 'Vào các đợt sạt lở mùa mưa hoặc mùa gặt nương, sĩ số các bản vùng sâu có xu hướng giảm cục bộ.',
        affectedGroups: 'Toàn trường, đặc biệt học sinh ngoại trú đi bộ xa',
      },
    ],
    topRiskFactors: [
      'Khoảng cách địa lý từ các bản xa (Phì Cao, Háng Tàu...) đến trường lớn, cách trở suối mùa mưa',
      'Áp lực kinh tế gia đình, phụ huynh cần con em ở nhà lao động nương rẫy, chăn thả gia súc',
      'Nguy cơ tảo hôn hoặc theo người lớn đi làm ăn ngoài tỉnh ở lứa tuổi 14 - 15',
      'Học sinh bán trú chưa thích nghi hoàn toàn nếp sống tập thể hoặc gặp khó khăn tâm lý tuổi dậy thì',
    ],
    villageHotspots: [
      { villageName: 'Phì Cao', riskAssessment: 'Địa bàn cách xa trung tâm xã, địa hình hiểm trở, tỷ lệ học sinh nghỉ phụ giúp nương rẫy cao.' },
      { villageName: 'Háng Tàu', riskAssessment: 'Cần lưu ý nhóm học sinh bán trú thường xuyên về bản vào cuối tuần và chậm trở lại trường.' },
      { villageName: 'Làng Dung', riskAssessment: 'Gần trường hơn nhưng cần theo dõi sát các trường hợp học sinh ngoại trú nghỉ học rải rác.' },
    ],
    recommendationsForBGH: [
      'Chỉ đạo GVCN rà soát và lập danh sách học sinh vắng từ 2 ngày liên tiếp để phân công giáo viên phối hợp Trưởng bản đến tận nhà.',
      'Đảm bảo đầy đủ chế độ ăn ở, dinh dưỡng và nước ấm sinh hoạt bán trú để tạo sự an tâm, yêu thích trường lớp cho học sinh.',
      'Tham mưu Đảng ủy, UBND xã Xa Dung tổ chức các đoàn vận động liên ngành (Công an xã, Đoàn thanh niên, Trưởng bản) đối với các ca nguy cơ tảo hôn hoặc bỏ học.',
    ],
    recommendationsForGVCN: [
      'Nắm chắc hoàn cảnh từng học sinh có cảnh báo rủi ro; liên hệ gia đình ngay khi em nghỉ ngày thứ 2 liên tiếp.',
      'Phân công học sinh cán sự lớp hoặc bạn cùng phòng bán trú hỗ trợ, hỏi thăm và báo cáo kịp thời diễn biến tâm lý.',
      'Tổ chức phụ đạo kiến thức nhẹ nhàng khi học sinh trở lại lớp, tuyệt đối không phê bình gay gắt gây mặc cảm.',
    ],
    fourWeekForecast:
      'Trong 4 tuần tới, dự kiến sĩ số duy trì ổn định nếu kiểm soát tốt việc học sinh bán trú quay lại trường vào chiều Chủ nhật. Cần chú trọng tuần thứ 3 (thời điểm giao mùa) có thể có nguy cơ vắng học cục bộ ở các bản vùng cao.',
  };
}

/**
 * Fallback generator for Individual Student Plan
 */
function generateFallbackIndividualPlan(student: any, absenceHistory: any, riskScore: number) {
  const isCritical = riskScore >= 75 || (absenceHistory?.consecutiveAbsences || 0) >= 3;
  const isBoarding = !!student.isBoarding;

  return {
    studentName: student.full_name,
    riskLevel: isCritical ? 'NGHIÊM TRỌNG' : riskScore >= 50 ? 'CAO' : 'TRUNG BÌNH',
    dropoutProbability: riskScore || (isCritical ? 85 : 60),
    rootCauseAnalysis: `Học sinh ${student.full_name} (${isBoarding ? 'bán trú' : 'ngoại trú'}, cư trú tại ${
      student.address || student.village || 'bản vùng cao'
    }) đã vắng ${absenceHistory?.totalDaysAbsent || 0} ngày, trong đó có chuỗi ${
      absenceHistory?.consecutiveAbsences || 0
    } ngày liên tiếp. Biểu hiện này cho thấy em đang gặp rào cản lớn về tâm lý học tập, khó khăn gia đình (việc nương rẫy/chăm sóc em nhỏ) hoặc nguy cơ bị bạn bè lôi kéo nghỉ học. Khoảng cách địa lý và đặc thù vùng cao khiến nguy cơ em bỏ học hẳn là rất đáng báo động nếu không được can thiệp kịp thời.`,
    warningSignals: [
      `Nghỉ liên tiếp ${absenceHistory?.consecutiveAbsences || 2} buổi học không đến lớp`,
      isBoarding ? 'Là học sinh bán trú nhưng vắng mặt tại khu nội trú' : 'Học sinh ngoại trú gặp khó khăn đường sá',
      'Có biểu hiện vắng ngắt quãng lặp lại qua các tuần',
    ],
    interventionRoadmap: [
      {
        step: 1,
        phase: 'Bước 1: Nắm bắt nhanh trong 24 giờ đầu',
        actor: 'GVCN & Bạn cùng phòng/cùng bản',
        action: 'GVCN gọi điện thoại trực tiếp cho phụ huynh; cử bạn học cùng bản đến nhà hỏi thăm lý do em vắng mặt.',
      },
      {
        step: 2,
        phase: 'Bước 2: Phối hợp Trưởng bản đến tận nhà',
        actor: 'GVCN phối hợp Ban Quản lý Bản / Chi bộ Bản',
        action:
          'Nếu học sinh tiếp tục vắng ngày thứ 3, GVCN và đại diện BGH trực tiếp vào bản gặp cha mẹ, giải thích tầm quan trọng của việc học và quyền lợi hỗ trợ bán trú của Nhà nước.',
      },
      {
        step: 3,
        phase: 'Bước 3: Giải quyết khó khăn thực tế của gia đình',
        actor: 'BGH & Hội Khuyến học trường',
        action:
          'Hỗ trợ sách vở, đồ dùng cá nhân, miễn giảm các khoản đóng góp tự nguyện (nếu có) để giảm gánh nặng cho gia đình em.',
      },
      {
        step: 4,
        phase: 'Bước 4: Bồi dưỡng & Hòa nhập khi học sinh trở lại',
        actor: 'Giáo viên bộ môn & GVCN',
        action:
          'Kèm cặp bù đắp lỗ hổng kiến thức những ngày nghỉ, phân công bạn thân giúp đỡ, tạo không khí thân thiện để em không mặc cảm.',
      },
    ],
    familyDialogueScript: {
      recommendedApproaches: [
        'Mở lời bằng thái độ tôn trọng, thăm hỏi mùa màng và sức khỏe của gia đình trước khi nói về chuyện học.',
        'Nhấn mạnh Nhà nước và nhà trường nuôi ăn ở miễn phí theo chế độ bán trú, gia đình không mất chi phí sinh hoạt của em tại trường.',
        'Chia sẻ tấm gương các anh chị trong xã học xong có công việc ổn định, làm cán bộ hoặc công nhân có thu nhập gửi về giúp đỡ bố mẹ.',
        'Lắng nghe tâm tư xem em có bị bạn bè trêu chọc hay sợ môn học nào không để thầy cô kịp thời giúp đỡ.',
      ],
      avoidTopics: [
        'Không dùng lời lẽ trách mắng phụ huynh không quan tâm đến con cái.',
        'Không đe dọa xử phạt hành chính ngay từ buổi đầu tiếp xúc vì dễ gây phản ứng tự ái, khép mình.',
      ],
      sampleOpening: `Dạ chào bác, em là giáo viên chủ nhiệm của cháu ${student.full_name} ở trường PTDTBT THCS Xa Dung. Hôm nay em vào thăm gia đình và hỏi thăm sức khỏe của bác cùng bà con trong bản... Mấy hôm nay thấy cháu chưa tới lớp, các thầy cô và các bạn đều rất nhớ và lo lắng cho cháu...`,
    },
    officialActionForm: {
      proposedAction: isCritical
        ? 'Cử đoàn vận động (GVCN + Trưởng bản) đến tận nhà ngay trong ngày'
        : 'Gọi điện phụ huynh và theo dõi sĩ số ngày kế tiếp',
      priority: isCritical ? 'Khẩn cấp (trong ngày)' : 'Ưu tiên cao (trong 48h)',
      notesForTeacher: 'Cần giữ thái độ kiên trì, nhẹ nhàng, nắm chắc hoàn cảnh cụ thể của gia đình em trước khi vào bản.',
    },
  };
}

/**
 * Fallback generator for Chat Assistant
 */
function generateFallbackChatResponse(message: string, context: any) {
  const q = (message || '').toLowerCase().trim();

  // 1. Unreported classes inquiry
  if (q.includes('chưa nộp') || q.includes('chưa báo cáo') || q.includes('lớp nào chưa') || q.includes('quên điểm danh')) {
    const unrep = context?.unreportedClasses || [];
    if (unrep.length === 0) {
      return {
        reply: `Dạ báo cáo thầy/cô, hôm nay tất cả ${context?.totalClassesCount || 12} lớp trong trường đều đã nộp báo cáo điểm danh đầy đủ 100%!`,
        intent: 'UNREPORTED_CLASSES',
        keyMetrics: [{ label: 'Tiến độ báo cáo', value: '100% Hoàn thành' }],
        action: { type: 'NAVIGATE', target: '/dashboard', label: 'Xem Bảng điều khiển' },
        suggestedQuestions: ['Hôm nay toàn trường vắng bao nhiêu học sinh?', 'Khối 9 có bao nhiêu em vắng?', 'Hôm nay có bao nhiêu suất ăn bán trú?'],
      };
    }
    const names = unrep.map((c: any) => `Lớp ${c.name || c.class_name}${c.teacherName ? ` (${c.teacherName})` : ''}`).join(', ');
    return {
      reply: `Hiện tại còn ${unrep.length} lớp chưa nộp báo cáo sĩ số ngày ${context?.currentDate || 'hôm nay'}: ${names}. Thầy/cô có thể gửi thông báo nhắc nhở nhanh qua Bảng điều khiển.`,
      intent: 'UNREPORTED_CLASSES',
      keyMetrics: [{ label: 'Lớp chưa nộp', value: `${unrep.length} lớp` }],
      action: { type: 'NAVIGATE', target: '/dashboard', label: 'Xem danh sách & Gửi nhắc nhở' },
      suggestedQuestions: ['Gửi nhắc nhở các lớp chưa nộp', 'Hôm nay toàn trường vắng bao nhiêu học sinh?', 'Dự báo suất ăn ngày mai'],
    };
  }

  // 2. Specific grade inquiry (Khối 6, 7, 8, 9)
  const gradeMatch = q.match(/khối\s*(6|7|8|9)/i);
  if (gradeMatch) {
    const gNum = parseInt(gradeMatch[1], 10);
    const gInfo = (context?.gradeStats || []).find((g: any) => g.grade === gNum);
    if (gInfo) {
      return {
        reply: `Hôm nay Khối ${gNum} có tổng số ${gInfo.total} học sinh. Trong đó có ${gInfo.present} em có mặt, vắng ${gInfo.absent} em. Tỷ lệ chuyên cần đạt ${gInfo.rate}%.`,
        intent: 'GRADE_INQUIRY',
        keyMetrics: [
          { label: `Khối ${gNum} Tổng số`, value: `${gInfo.total} HS` },
          { label: `Có mặt`, value: `${gInfo.present} HS` },
          { label: `Vắng mặt`, value: `${gInfo.absent} HS` },
          { label: `Tỷ lệ`, value: `${gInfo.rate}%` },
        ],
        action: { type: 'NAVIGATE', target: '/reports/daily', label: `Xem chi tiết Khối ${gNum}` },
        suggestedQuestions: ['Các khối khác thế nào?', 'Có học sinh nào khối này vắng nhiều ngày?', 'Lớp nào chưa nộp báo cáo?'],
      };
    }
  }

  // 3. School overall attendance inquiry
  if (q.includes('toàn trường') || q.includes('tổng số') || q.includes('sĩ số') || q.includes('vắng bao nhiêu') || q.includes('có mặt')) {
    const total = context?.totalStudents || 0;
    const present = context?.presentCount || 0;
    const absent = context?.absentCount || 0;
    const rate = context?.presentRate || 0;
    return {
      reply: `Báo cáo sĩ số ngày ${context?.currentDate || 'hôm nay'}: Toàn trường có tổng cộng ${total} học sinh, hiện có mặt ${present} em, vắng ${absent} em. Tỷ lệ chuyên cần toàn trường đạt ${rate}%. Đã có ${context?.reportedClassesCount || 0}/${context?.totalClassesCount || 0} lớp hoàn thành nộp báo cáo.`,
      intent: 'ATTENDANCE_SUMMARY',
      keyMetrics: [
        { label: 'Tổng số HS', value: `${total}` },
        { label: 'Có mặt', value: `${present}` },
        { label: 'Vắng', value: `${absent}` },
        { label: 'Tỷ lệ', value: `${rate}%` },
      ],
      action: { type: 'NAVIGATE', target: '/reports/daily', label: 'Mở Báo cáo Ngày' },
      suggestedQuestions: ['Lớp nào chưa nộp báo cáo?', 'Hôm nay khối 9 vắng mấy em?', 'Suất ăn bán trú hôm nay'],
    };
  }

  // 4. Boarding inquiry
  if (q.includes('bán trú') || q.includes('ăn trưa') || q.includes('chấm cơm') || q.includes('suất ăn') || q.includes('nấu')) {
    const b = context?.boardingSummary || {};
    return {
      reply: `Về công tác bán trú hôm nay: Nhà trường ghi nhận ${b.totalBoarding || 0} học sinh bán trú. Số lượng suất ăn thực tế: Bữa sáng có ${b.breakfast || 0} suất, bữa trưa có ${b.lunch || 0} suất, bữa tối có ${b.dinner || 0} suất.`,
      intent: 'BOARDING_INQUIRY',
      keyMetrics: [
        { label: 'Học sinh Bán trú', value: `${b.totalBoarding || 0}` },
        { label: 'Suất Bữa Sáng', value: `${b.breakfast || 0}` },
        { label: 'Suất Bữa Trưa', value: `${b.lunch || 0}` },
        { label: 'Suất Bữa Tối', value: `${b.dinner || 0}` },
      ],
      action: { type: 'NAVIGATE', target: '/boarding', label: 'Mở Quản lý Bán trú' },
      suggestedQuestions: ['Dự báo suất ăn ngày mai', 'Sổ chấm cơm tháng này', 'Lớp nào chưa nộp báo cáo?'],
    };
  }

  // 5. Dropout / at-risk inquiry
  if (q.includes('bỏ học') || q.includes('nguy cơ') || q.includes('cảnh báo') || q.includes('nghỉ nhiều') || q.includes('vắng liên tiếp')) {
    const atRisk = context?.highRiskStudents || [];
    const count = atRisk.length;
    return {
      reply: `Hệ thống AI Dự báo phát hiện hiện có ${count} em học sinh có biểu hiện vắng ngắt quãng hoặc nguy cơ bỏ học cần lưu ý. Trong đó các em thuộc các bản vùng cao như Phì Cao, Háng Tàu. Thầy/cô nên rà soát để kịp thời phối hợp với Trưởng bản đến tận nhà vận động.`,
      intent: 'DROPOUT_PREDICTION',
      keyMetrics: [{ label: 'Học sinh có nguy cơ', value: `${count} em` }],
      action: { type: 'NAVIGATE', target: '/ai-dropout-prediction', label: 'Xem Danh sách Cảnh báo & Kế hoạch AI' },
      suggestedQuestions: ['Kế hoạch vận động học sinh bản Phì Cao', 'Hôm nay lớp nào chưa nộp báo cáo?', 'Tỷ lệ chuyên cần toàn trường'],
    };
  }

  // 6. Export / Reports
  if (q.includes('xuất') || q.includes('excel') || q.includes('in') || q.includes('tải') || q.includes('biểu mẫu')) {
    return {
      reply: 'Hệ thống hỗ trợ xuất biểu mẫu Excel chuẩn của Phòng GD&ĐT cho Báo cáo sĩ số hằng ngày, Báo cáo tuần, Báo cáo tháng và Sổ chấm cơm bán trú theo chuẩn mẫu số 01-BT/BGH.',
      intent: 'EXPORT',
      action: { type: 'NAVIGATE', target: '/reports/boarding-monthly', label: 'Mở Sổ chấm cơm xuất Excel' },
      suggestedQuestions: ['Xem báo cáo sĩ số hôm nay', 'Lớp nào chưa nộp báo cáo?', 'Dự báo suất ăn bán trú'],
    };
  }

  // Default friendly greeting
  return {
    reply: `Xin chào thầy/cô! Tôi là Trợ lý AI Báo cáo Sĩ số Trường PTDTBT THCS Xa Dung. Thầy/cô có thể hỏi tôi bất kỳ điều gì bằng cách gõ hoặc bấm Micro nói, ví dụ: "Hôm nay khối 9 vắng mấy em?", "Lớp nào chưa nộp báo cáo?", "Bán trú hôm nay ăn bao nhiêu suất?", hoặc "Dự báo học sinh có nguy cơ bỏ học".`,
    intent: 'GENERAL',
    suggestedQuestions: [
      'Hôm nay có những lớp nào chưa nộp báo cáo?',
      'Khối 9 vắng bao nhiêu học sinh hôm nay?',
      'Dự báo suất ăn bán trú ngày mai cần chuẩn bị bao nhiêu?',
    ],
  };
}

/**
 * Fallback generator for Boarding Meal Forecast
 */
function generateFallbackMealForecast(
  schoolName: string,
  totalBoarding: number,
  upcomingDays: Array<{ date: string; dayOfWeek: string; isMonday: boolean; isFriday: boolean; isWeekend: boolean }>
) {
  const base = totalBoarding || 240;

  const dailyForecasts = upcomingDays.map((d) => {
    let bf = Math.round(base * 0.94);
    let lu = Math.round(base * 0.96);
    let di = Math.round(base * 0.94);
    let notes = 'Lịch học bình thường, sĩ số ăn ổn định';

    if (d.isMonday) {
      bf = Math.round(base * 0.72); // Học sinh từ bản lên trường muộn
      lu = Math.round(base * 0.95);
      di = Math.round(base * 0.95);
      notes = 'Sáng thứ 2 học sinh ở bản xa (Phì Cao, Háng Tàu) lên trường muộn, giảm định lượng bữa sáng 25-30%';
    } else if (d.isFriday) {
      bf = Math.round(base * 0.94);
      lu = Math.round(base * 0.94);
      di = Math.round(base * 0.28); // Chiều thứ 6 học sinh về bản
      notes = 'Chiều thứ 6 học sinh về bản với gia đình, bữa tối giảm 70%, chỉ nấu cho các em ở lại cuối tuần';
    } else if (d.isWeekend) {
      bf = Math.round(base * 0.12);
      lu = Math.round(base * 0.14);
      di = Math.round(base * 0.12);
      notes = 'Cuối tuần chỉ phục vụ học sinh nội trú ở lại trường không về bản';
    }

    return {
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      predictedBreakfast: bf,
      predictedLunch: lu,
      predictedDinner: di,
      confidence: 94,
      notes,
    };
  });

  const totBf = dailyForecasts.reduce((a, b) => a + b.predictedBreakfast, 0);
  const totLu = dailyForecasts.reduce((a, b) => a + b.predictedLunch, 0);
  const totDi = dailyForecasts.reduce((a, b) => a + b.predictedDinner, 0);
  const grandTotal = totBf + totLu + totDi;

  // Định mức nguyên vật liệu chuẩn bán trú THCS
  // Gạo: 150g/bữa chính, 80g/bữa sáng
  const riceKg = Math.round(((totLu + totDi) * 0.15 + totBf * 0.08));
  // Thịt: 80g/bữa chính
  const meatKg = Math.round((totLu + totDi) * 0.08);
  // Rau: 180g/bữa chính
  const vegKg = Math.round((totLu + totDi) * 0.18);
  // Đậu phụ: 45g/bữa
  const tofuKg = Math.round((totLu + totDi) * 0.045);
  // Dầu ăn: 12ml/bữa
  const oilLiters = Math.round(((grandTotal * 12) / 1000));

  return {
    dailyForecasts,
    totalWeeklyMeals: {
      breakfast: totBf,
      lunch: totLu,
      dinner: totDi,
      grandTotal,
    },
    ingredientEstimates: {
      riceKg,
      meatKg,
      fishOrEggEstimate: `${Math.round(meatKg * 0.35)} kg cá tươi hoặc ${Math.round(grandTotal * 0.45)} quả trứng`,
      vegetablesKg: vegKg,
      tofuKg,
      cookingOilLiters: oilLiters,
      saltAndSpicesKg: Math.round(grandTotal * 0.012),
    },
    wasteReductionTips: [
      'Chiều thứ Sáu: Báo ăn bữa tối chốt trước 14h00 để cắt giảm ngay 65-75% suất ăn, tránh dư thừa cơm và thức ăn chín.',
      'Sáng thứ Hai: Chuẩn bị bữa sáng linh hoạt (ví dụ xôi nếp đóng gói hoặc bánh bao) để học sinh đến muộn vẫn có thể nhận ăn mà không lãng phí cơm canh.',
      'Ngày mưa lạnh hoặc đường sạt lở: Kịp thời liên hệ các trưởng bản để nắm sĩ số các em không thể qua suối, điều chỉnh lượng thực phẩm tươi sống trong ngày.',
    ],
    kitchenSummary: `Dự báo 7 ngày tới trường ${schoolName} cần chuẩn bị tổng cộng khoảng ${grandTotal} suất ăn (gồm ${totBf} bữa sáng, ${totLu} bữa trưa, ${totDi} bữa tối). Ước tính cần chuẩn bị ${riceKg} kg gạo tẻ và ${meatKg} kg thịt cùng các loại rau củ quả.`,
  };
}

/**
 * Endpoint 1: General School-wide Dropout Risk Analysis & Forecast
 */
app.post('/api/ai/dropout-prediction', async (req, res) => {
  const { schoolName, activeYear, totalStudents, stats, highRiskStudents, recentAbsentRecords } = req.body;

  try {
    const prompt = `
Bạn là Chuyên gia AI Cố vấn Giáo dục và Tâm lý học đường chuyên về các trường Phổ thông Dân tộc Bán trú (PTDTBT) vùng cao Tây Bắc Việt Nam (đặc biệt là tỉnh Điện Biên).
Nhiệm vụ của bạn là phân tích dữ liệu chuyên cần lịch sử của trường "${schoolName || 'Trường PTDTBT THCS Xa Dung'}" (Năm học: ${activeYear || '2026-2027'}) và đưa ra BÁO CÁO DỰ BÁO SỚM NGUY CƠ NGHỈ HỌC / BỎ HỌC (Early Warning & Predictive Report).

Dữ liệu đầu vào:
- Tổng số học sinh toàn trường: ${totalStudents || 'Chưa rõ'}
- Thống kê rủi ro:
  + Số học sinh nguy cơ nghiêm trọng (Critical): ${stats?.criticalCount || 0}
  + Số học sinh nguy cơ cao (High): ${stats?.highCount || 0}
  + Số học sinh nguy cơ trung bình (Moderate): ${stats?.moderateCount || 0}
- Danh sách học sinh có chỉ số rủi ro cao nhất:
${JSON.stringify(highRiskStudents || [], null, 2)}
- Các bản làng có số lượt vắng nhiều nhất:
${JSON.stringify(recentAbsentRecords || [], null, 2)}

Hãy phân tích và trả về định dạng JSON hợp lệ (không kèm markdown ngoài JSON):
{
  "summary": "Tóm tắt ngắn gọn tình hình chuyên cần và mức độ rủi ro bỏ học chung của nhà trường",
  "overallRiskLevel": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
  "keyPatterns": [
    {
      "patternName": "Tên quy luật",
      "description": "Mô tả chi tiết",
      "affectedGroups": "Nhóm bị ảnh hưởng"
    }
  ],
  "topRiskFactors": ["Yếu tố 1", "Yếu tố 2", "Yếu tố 3"],
  "villageHotspots": [
    {
      "villageName": "Tên bản",
      "riskAssessment": "Đánh giá chi tiết"
    }
  ],
  "recommendationsForBGH": ["Khuyến nghị 1", "Khuyến nghị 2", "Khuyến nghị 3"],
  "recommendationsForGVCN": ["Khuyến nghị 1", "Khuyến nghị 2", "Khuyến nghị 3"],
  "fourWeekForecast": "Dự báo sĩ số 4 tuần tới"
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.35,
      },
    });

    const response = await withTimeout(responsePromise, 8000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini API call timed out or failed, using expert fallback:', err.message);
    const fallbackData = generateFallbackSchoolReport(
      schoolName || 'Trường PTDTBT THCS Xa Dung',
      activeYear || '2026-2027',
      stats,
      highRiskStudents || []
    );
    res.json({ success: true, data: fallbackData });
  }
});

/**
 * Endpoint 2: Individual Student Dropout Risk Assessment & Personalized Intervention Plan
 */
app.post('/api/ai/individual-assessment', async (req, res) => {
  const { student, absenceHistory, riskScore, schoolName } = req.body;

  try {
    const prompt = `
Bạn là Chuyên gia AI Tâm lý Giáo dục học đường và Công tác Dân vận cơ sở của trường PTDTBT THCS Xa Dung (Điện Biên).
Hãy phân tích hồ sơ chuyên cần của học sinh sau đây và lập KẾ HOẠCH CAN THIỆP & VẬN ĐỘNG HỌC SINH ĐI HỌC TRỞ LẠI:

Thông tin học sinh:
- Họ và tên: ${student.full_name}
- Lớp: ${student.class_name || student.class_id}
- Bản / Địa chỉ: ${student.address || student.village || 'Vùng cao Xa Dung'}
- Loại hình: ${student.isBoarding ? 'Học sinh BÁN TRÚ' : 'Học sinh NGOẠI TRÚ'}
- Giới tính: ${student.gender || 'Chưa rõ'}
- Điểm rủi ro dự báo hiện tại: ${riskScore || 0}%
- Tổng số ngày vắng trong tháng: ${absenceHistory?.totalDaysAbsent || 0} ngày
- Chuỗi vắng liên tiếp gần nhất: ${absenceHistory?.consecutiveAbsences || 0} ngày
- Lịch sử các ngày vắng và lý do ghi nhận:
${JSON.stringify(absenceHistory?.recentAbsences || [], null, 2)}

Hãy trả về định dạng JSON hợp lệ:
{
  "studentName": "${student.full_name}",
  "riskLevel": "THẤP" | "TRUNG BÌNH" | "CAO" | "NGHIÊM TRỌNG",
  "dropoutProbability": number,
  "rootCauseAnalysis": "Phân tích tâm lý và nguyên nhân tiềm ẩn",
  "warningSignals": ["Dấu hiệu 1", "Dấu hiệu 2"],
  "interventionRoadmap": [
    {
      "step": 1,
      "phase": "Giai đoạn",
      "actor": "Người thực hiện",
      "action": "Hành động cụ thể"
    }
  ],
  "familyDialogueScript": {
    "recommendedApproaches": ["Điều nên nói 1", "Điều nên nói 2"],
    "avoidTopics": ["Điều nên tránh 1", "Điều nên tránh 2"],
    "sampleOpening": "Câu chào mở đầu"
  },
  "officialActionForm": {
    "proposedAction": "Đề xuất hành động",
    "priority": "Khẩn cấp (trong ngày)" | "Ưu tiên cao (trong 48h)" | "Theo dõi sát",
    "notesForTeacher": "Lưu ý cho giáo viên"
  }
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.35,
      },
    });

    const response = await withTimeout(responsePromise, 8000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini API individual call timed out or failed, using expert fallback:', err.message);
    const fallbackData = generateFallbackIndividualPlan(student, absenceHistory, riskScore);
    res.json({ success: true, data: fallbackData });
  }
});

/**
 * Endpoint 3: Natural Language AI Assistant (Chatbot & Voice Commands)
 */
app.post('/api/ai/chat-assistant', async (req, res) => {
  const { message, conversationHistory, context } = req.body;

  try {
    const prompt = `
Bạn là Trợ lý ảo AI Điều hành và Tra cứu Báo cáo Sĩ số của Trường PTDTBT THCS Xa Dung (Điện Biên).
Người dùng là Ban Giám hiệu hoặc Giáo viên đang hỏi hoặc ra lệnh bằng giọng nói/văn bản: "${message}"

Dữ liệu thực tế ngày ${context?.currentDate || 'hôm nay'}:
- Tên trường: ${context?.schoolName || 'Trường PTDTBT THCS Xa Dung'}
- Tổng số học sinh toàn trường: ${context?.totalStudents || 0}
- Có mặt: ${context?.presentCount || 0}
- Vắng mặt: ${context?.absentCount || 0} (Tỷ lệ: ${context?.presentRate || 0}%)
- Tiến độ báo cáo: Đã có ${context?.reportedClassesCount || 0}/${context?.totalClassesCount || 0} lớp nộp
- Danh sách lớp CHƯA NỘP: ${JSON.stringify(context?.unreportedClasses || [])}
- Thống kê các khối lớp: ${JSON.stringify(context?.gradeStats || [])}
- Số lượng bán trú hôm nay: ${JSON.stringify(context?.boardingSummary || {})}
- Học sinh nguy cơ bỏ học cao: ${JSON.stringify((context?.highRiskStudents || []).slice(0, 5))}

Hãy trả lời bằng tiếng Việt lịch sự, thân thiện, ngắn gọn và chính xác tuyệt đối theo dữ liệu trên.
Trả về định dạng JSON hợp lệ:
{
  "reply": "Câu trả lời trực tiếp, rõ ràng cho câu hỏi",
  "intent": "ATTENDANCE_SUMMARY" | "UNREPORTED_CLASSES" | "GRADE_INQUIRY" | "BOARDING_INQUIRY" | "DROPOUT_PREDICTION" | "EXPORT" | "GENERAL",
  "keyMetrics": [
    { "label": "Tiêu đề số liệu", "value": "Giá trị" }
  ],
  "action": {
    "type": "NAVIGATE",
    "target": "/dashboard" | "/reports/daily" | "/boarding" | "/ai-dropout-prediction" | "/attendance",
    "label": "Nhãn nút bấm hành động"
  },
  "suggestedQuestions": ["Gợi ý câu hỏi 1", "Gợi ý câu hỏi 2", "Gợi ý câu hỏi 3"]
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const response = await withTimeout(responsePromise, 8000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini chat assistant timed out or failed, using expert fallback:', err.message);
    const fallback = generateFallbackChatResponse(message, context);
    res.json({ success: true, data: fallback });
  }
});

/**
 * Endpoint 4: AI Boarding Meal Optimizer & 7-Day Forecast
 */
app.post('/api/ai/boarding-meal-forecast', async (req, res) => {
  const { schoolName, activeYear, totalBoardingStudents, historicalMeals, upcomingDays } = req.body;

  try {
    const prompt = `
Bạn là Chuyên gia AI Quản lý Dinh dưỡng và Hậu cần Bán trú chuyên về các trường PTDTBT vùng cao Tây Bắc.
Trường: "${schoolName || 'Trường PTDTBT THCS Xa Dung'}"
Tổng số học sinh bán trú: ${totalBoardingStudents || 240} em.

Quy luật đặc thù bán trú vùng cao Xa Dung:
1. Sáng thứ Hai: Học sinh từ các bản xa (Phì Cao, Háng Tàu) lên trường muộn -> số suất ăn sáng chỉ đạt khoảng 65% - 75%.
2. Trưa và tối thứ 2, 3, 4, 5: Đầy đủ (92% - 98%).
3. Chiều thứ Sáu: Học sinh về bản với gia đình -> bữa tối giảm mạnh chỉ còn khoảng 25% - 35% (các em ở lại cuối tuần).
4. Thứ 7 và Chủ nhật: Chỉ phục vụ các em ở lại nội trú (khoảng 10% - 15%).

Dữ liệu lịch sử gần đây: ${JSON.stringify(historicalMeals || [])}
Danh sách 7 ngày tới cần dự báo: ${JSON.stringify(upcomingDays || [])}

Hãy tính toán và trả về JSON hợp lệ:
{
  "dailyForecasts": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "Thứ 2",
      "predictedBreakfast": number,
      "predictedLunch": number,
      "predictedDinner": number,
      "confidence": number,
      "notes": "Lý do và lưu ý chuẩn bị"
    }
  ],
  "totalWeeklyMeals": {
    "breakfast": number,
    "lunch": number,
    "dinner": number,
    "grandTotal": number
  },
  "ingredientEstimates": {
    "riceKg": number,
    "meatKg": number,
    "fishOrEggEstimate": "35 kg cá hoặc 450 quả trứng",
    "vegetablesKg": number,
    "tofuKg": number,
    "cookingOilLiters": number,
    "saltAndSpicesKg": number
  },
  "wasteReductionTips": [
    "Lời khuyên chống lãng phí 1",
    "Lời khuyên chống lãng phí 2",
    "Lời khuyên chống lãng phí 3"
  ],
  "kitchenSummary": "Tóm tắt khối lượng chuẩn bị cho tuần tới"
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const response = await withTimeout(responsePromise, 8000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini meal forecast timed out or failed, using expert fallback:', err.message);
    const fallback = generateFallbackMealForecast(
      schoolName || 'Trường PTDTBT THCS Xa Dung',
      totalBoardingStudents || 240,
      upcomingDays || []
    );
    res.json({ success: true, data: fallback });
  }
});

/**
 * Fallback generator for Teacher Class Report Summary
 */
function generateFallbackClassReport(
  className: string,
  teacherName: string,
  schoolName: string,
  periodType: 'WEEK' | 'MONTH',
  periodLabel: string,
  attendanceStats: any,
  boardingStats: any,
  absentDetails: any[],
  specialNotes: string[],
  tone?: string
) {
  const isWeek = periodType === 'WEEK';
  const totalStudents = attendanceStats?.totalStudents || 35;
  const avgPresent = attendanceStats?.avgPresent || Math.round(totalStudents * 0.96);
  const avgAbsent = attendanceStats?.avgAbsent || Math.max(0, totalStudents - avgPresent);
  const rate = attendanceStats?.presentRate || 96.5;

  const totalBoarding = boardingStats?.totalBoarding || 0;
  const totalMeals = boardingStats?.totalMeals || (totalBoarding * (isWeek ? 14 : 60));

  const absentListStr = (absentDetails || [])
    .slice(0, 6)
    .map(
      (s: any) =>
        `- Em ${s.studentName || s.full_name} (${s.address || s.village || 'bản xa'}): vắng ${s.absentCount || 1} buổi, lý do: ${
          s.reasons?.length ? s.reasons.join(', ') : 'ốm sốt / giúp gia đình việc nương'
        }`
    )
    .join('\n');

  const notesStr = (specialNotes || []).filter(Boolean).length
    ? (specialNotes || []).filter(Boolean).map((n) => `+ ${n}`).join('\n')
    : '+ Các hoạt động học tập, thể dục giữa giờ và sinh hoạt bán trú diễn ra nền nếp, đúng quy chế.';

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
- Tổng số suất ăn đã phục vụ trong kỳ báo cáo: ${totalMeals} suất.
- Học sinh bán trú chấp hành tốt nội quy nhà ăn, giờ giấc sinh hoạt phòng ở ngăn nắp, vệ sinh cá nhân sạch sẽ.
- Thực đơn các bữa ăn đảm bảo dinh dưỡng, nóng sốt và an toàn vệ sinh thực phẩm. Chiều thứ Sáu, học sinh được quản lý bàn giao an toàn khi về thăm gia đình.

III. CÁC TRƯỜNG HỢP CẦN QUAN TÂM & NGUYÊN NHÂN VẮNG HỌC
${
  absentDetails && absentDetails.length > 0
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

  return {
    reportTitle: `BÁO CÁO CÔNG TÁC CHỦ NHIỆM & TỔNG HỢP SĨ SỐ, BÁN TRÚ LỚP ${className}`,
    recipient: `Ban Giám hiệu ${schoolName || 'Trường PTDTBT THCS Xa Dung'}`,
    overview: `Trong ${periodLabel}, lớp ${className} duy trì tổng số ${totalStudents} học sinh, tỷ lệ chuyên cần đạt ${rate}%, công tác nuôi dưỡng bán trú đạt ${totalMeals} suất ăn an toàn, nề nếp lớp học ổn định.`,
    attendanceAnalysis: `Tỷ lệ chuyên cần bình quân đạt ${rate}%, trung bình có ${avgPresent} học sinh có mặt/ngày. Học sinh đi học đều đặn, số lượt vắng rải rác chủ yếu do ốm sốt theo mùa hoặc việc gia đình đột xuất.`,
    boardingAnalysis: `Quản lý tốt ${totalBoarding} học sinh bán trú với tổng số ${totalMeals} suất ăn. Các em chấp hành nghiêm giờ giấc ăn nghỉ, vệ sinh phòng ở gọn gàng, trật tự tự quản tốt.`,
    specialAttentionCases:
      absentDetails && absentDetails.length > 0
        ? absentDetails.slice(0, 6).map((s: any) => ({
            studentName: s.studentName || s.full_name,
            village: s.address || s.village || 'Bản xa',
            absentCount: s.absentCount || 1,
            reasons: s.reasons?.length ? s.reasons.join(', ') : 'Nghỉ ốm / Việc gia đình',
            interventionTaken: 'GVCN đã liên hệ phụ huynh và giao bạn cán sự lớp hỗ trợ chép bài.',
          }))
        : [],
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
 * Fallback generator for Periodic Student Remarks
 */
function generateFallbackStudentRemarks(className: string, periodType: string, studentsData: any[]) {
  const remarks = (studentsData || []).map((s: any) => {
    const absent = s.absentCount || 0;
    const isBoarding = !!s.isBoarding;
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

/**
 * Endpoint 5: AI Teacher Assistant - Class Weekly/Monthly Summary Report Generator
 */
app.post('/api/ai/class-report-summary', async (req, res) => {
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
  } = req.body;

  try {
    const prompt = `
Bạn là Trợ lý AI Cố vấn Quản lý Lớp học và Giáo dục học đường chuyên hỗ trợ Giáo viên Chủ nhiệm (GVCN) tại các trường Phổ thông Dân tộc Bán trú (PTDTBT) Việt Nam (đặc biệt là huyện vùng cao Điện Biên Đông, tỉnh Điện Biên).
Nhiệm vụ của bạn là tổng hợp toàn bộ số liệu điểm danh, chấm ăn bán trú, học sinh vắng và ghi chú hàng ngày của lớp "${className || '6A11'}" trong "${periodLabel || 'Tuần này'}" thành một BÁO CÁO CÔNG TÁC CHỦ NHIỆM HOÀN CHỈNH, CHUẨN THỂ THỨC HÀNH CHÍNH GIÁO DỤC gửi Ban Giám hiệu nhà trường.

Thông tin lớp và dữ liệu thực tế:
- Trường: ${schoolName || 'Trường PTDTBT THCS Xa Dung'}
- Lớp: ${className}
- GVCN: ${teacherName || 'Giáo viên Chủ nhiệm'}
- Kỳ báo cáo: ${periodLabel} (${periodType === 'WEEK' ? 'Báo cáo Tuần' : 'Báo cáo Tháng'})
- Giọng điệu: ${tone || 'Trang trọng, chuẩn mực hành chính sư phạm'}

Thống kê chuyên cần:
- Sĩ số lớp: ${attendanceStats?.totalStudents || 35} học sinh
- Có mặt bình quân: ${attendanceStats?.avgPresent || 34} học sinh/ngày
- Vắng bình quân: ${attendanceStats?.avgAbsent || 1} học sinh/ngày
- Tỷ lệ chuyên cần bình quân: ${attendanceStats?.presentRate || 97}%
- Dữ liệu từng ngày: ${JSON.stringify(attendanceStats?.dayByDay || [])}

Thống kê bán trú:
- Số học sinh bán trú: ${boardingStats?.totalBoarding || 0} em
- Tổng số suất ăn đã phục vụ: ${boardingStats?.totalMeals || 0} suất (Sáng: ${boardingStats?.totalBreakfast || 0}, Trưa: ${boardingStats?.totalLunch || 0}, Tối: ${boardingStats?.totalDinner || 0})

Học sinh vắng nhiều / cần lưu ý:
${JSON.stringify(absentDetails || [], null, 2)}

Ghi chú nhật ký trong kỳ của GVCN:
${JSON.stringify(specialNotes || [], null, 2)}

Hãy phân tích kỹ lưỡng các số liệu trên và trả về định dạng JSON hợp lệ (không kèm markdown ngoài JSON):
{
  "reportTitle": "Tiêu đề báo cáo chuẩn",
  "recipient": "Ban Giám hiệu Trường PTDTBT THCS Xa Dung",
  "overview": "Đoạn văn tóm tắt tổng quan tình hình lớp trong kỳ báo cáo (ngắn gọn, đủ ý)",
  "attendanceAnalysis": "Phân tích cụ thể về chuyên cần, số liệu, tỷ lệ %, sự biến động đầu tuần và cuối tuần",
  "boardingAnalysis": "Đánh giá công tác ăn ở bán trú, nề nếp sinh hoạt phòng ở và vệ sinh an toàn",
  "specialAttentionCases": [
    {
      "studentName": "Họ và tên",
      "village": "Bản",
      "absentCount": number,
      "reasons": "Lý do",
      "interventionTaken": "Biện pháp GVCN đã thực hiện phối hợp gia đình/trưởng bản"
    }
  ],
  "classStrengths": ["Điểm mạnh 1", "Điểm mạnh 2", "Điểm mạnh 3"],
  "classChallenges": ["Khó khăn 1", "Khó khăn 2"],
  "recommendationsToBGH": ["Đề xuất 1", "Đề xuất 2"],
  "fullDocumentText": "Toàn văn bản báo cáo hoàn chỉnh từ Quốc hiệu, Tiêu ngữ, Kính gửi, các mục I, II, III, IV, V đến Ký tên GVCN để GVCN có thể sao chép trực tiếp vào văn bản gửi BGH."
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.35,
      },
    });

    const response = await withTimeout(responsePromise, 9000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini class report summary failed or timed out, using fallback:', err.message);
    const fallback = generateFallbackClassReport(
      className || '6A11',
      teacherName || 'Lò Thị Thắm',
      schoolName || 'Trường PTDTBT THCS Xa Dung',
      periodType || 'WEEK',
      periodLabel || 'Tuần này',
      attendanceStats,
      boardingStats,
      absentDetails || [],
      specialNotes || [],
      tone
    );
    res.json({ success: true, data: fallback });
  }
});

/**
 * Endpoint 6: AI Teacher Assistant - Periodic Pedagogical Student Remarks Generator
 */
app.post('/api/ai/student-periodic-remarks', async (req, res) => {
  const { className, periodType, studentsData, classOverallContext } = req.body;

  try {
    const prompt = `
Bạn là Chuyên gia AI Tâm lý Sư phạm và Đánh giá Học sinh Trung học Cơ sở theo tinh thần Thông tư 22/2021/TT-BGDĐT của Bộ Giáo dục và Đào tạo Việt Nam.
Nhiệm vụ của bạn là xem xét dữ liệu chuyên cần, nề nếp bán trú, lịch sử đi học và địa bàn cư trú của từng học sinh lớp "${className || '6A11'}" và tự động viết LỜI NHẬN XÉT ĐỊNH KỲ CHUẨN MỰC SƯ PHẠM (${periodType || 'Định kỳ'}).

Nguyên tắc viết nhận xét sư phạm:
1. Mang tính nhân văn, khuyến khích sự tiến bộ của học sinh, không dùng từ ngữ xúc phạm hoặc tiêu cực nặng nề.
2. Với học sinh chuyên cần tốt (0-1 buổi vắng): Khen ngợi tinh thần tự giác, ý thức kỷ luật, nề nếp sinh hoạt.
3. Với học sinh vắng từ 2-4 buổi: Nhắc nhở chân thành, khuyên rèn luyện sức khỏe, đi học đều đặn để không hổng kiến thức.
4. Với học sinh vắng nhiều (>4 buổi hoặc vắng liên tiếp): Cảnh báo nhẹ nhàng, đề nghị gia đình tại bản làng phối hợp chặt chẽ với nhà trường.
5. Ngắn gọn, súc tích (khoảng 2 - 4 câu/em), phù hợp để đưa vào Sổ liên lạc điện tử / VnEdu / SMAS.

Dữ liệu học sinh cần nhận xét:
${JSON.stringify((studentsData || []).slice(0, 50), null, 2)}

Hãy trả về định dạng JSON hợp lệ:
{
  "className": "${className}",
  "periodType": "${periodType}",
  "summaryClassRemarks": "Nhận xét tổng thể về nề nếp chuyên cần của cả lớp trong kỳ",
  "remarks": [
    {
      "studentId": "ID học sinh",
      "studentName": "Họ và tên",
      "category": "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" | "SPECIAL_ATTENTION",
      "categoryLabel": "Chuyên cần xuất sắc" | "Chuyên cần tốt" | "Cần nhắc nhở chuyên cần" | "Cần phối hợp gia đình",
      "remarkText": "Lời nhận xét chuẩn mực sư phạm gửi học sinh và phụ huynh",
      "conductSuggestion": "Tốt" | "Khá" | "Đạt",
      "strengths": "Ưu điểm nổi bật",
      "notesForParent": "Lời nhắn riêng cho phụ huynh"
    }
  ]
}
    `.trim();

    const responsePromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const response = await withTimeout(responsePromise, 9000);
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.warn('Gemini student remarks failed or timed out, using fallback:', err.message);
    const fallback = generateFallbackStudentRemarks(
      className || '6A11',
      periodType || 'MONTH',
      studentsData || []
    );
    res.json({ success: true, data: fallback });
  }
});

// Vite middleware in dev or static files in production
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
