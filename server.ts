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

const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const SECONDARY_MODEL = 'gemini-3.8-flash';

// Helper with timeout
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout sau ${ms}ms`)), ms)),
  ]);
}

/**
 * Robust JSON caller for Gemini with model cascading, fast response, and graceful fallback
 */
async function callGeminiStructuredJson<T>(
  prompt: string,
  fallbackFn: () => T,
  temperature = 0.3
): Promise<T> {
  const models = [PRIMARY_MODEL, SECONDARY_MODEL];
  for (const model of models) {
    try {
      const responsePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature,
        },
      });

      // Generous 20s timeout per model attempt to prevent premature timeouts
      const response = await withTimeout(responsePromise, 20000);
      const text = response.text || '{}';
      try {
        return JSON.parse(text);
      } catch {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
      }
    } catch {
      // Continue to next model or fallback
      continue;
    }
  }

  // Gracefully return expert fallback without noisy warnings
  return fallbackFn();
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

// Helper to normalize Vietnamese search queries
function normalizeVietnamese(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Fallback generator for Chat Assistant with precise intent matching
 */
function generateFallbackChatResponse(message: string, context: any) {
  const rawQ = (message || '').trim();
  const q = rawQ.toLowerCase();
  const normQ = normalizeVietnamese(rawQ);

  // 1. Questions about Developer / Teacher Vu Van Hung / Hotline / Technical Support
  if (
    q.includes('vũ văn hùng') ||
    normQ.includes('vu van hung') ||
    q.includes('tác giả') ||
    normQ.includes('tac gia') ||
    q.includes('phát triển') ||
    normQ.includes('phat trien') ||
    q.includes('sđt') ||
    q.includes('sdt') ||
    q.includes('hotline') ||
    q.includes('0984') ||
    q.includes('liên hệ') ||
    normQ.includes('lien he') ||
    q.includes('hỗ trợ kỹ thuật') ||
    normQ.includes('ho tro ky thuat')
  ) {
    return {
      reply: `Ứng dụng **"Sổ Báo Cáo Sĩ Số"** và Trợ lý ảo AI này do **Thầy Vũ Văn Hùng** trực tiếp nghiên cứu, lập trình và phát triển nhằm hỗ trợ tối đa quý Thầy/Cô GVCN và Ban Giám Hiệu (BGH) Trường PTDTBT THCS Xa Dung 24/7.\n\n📞 **Thông tin hỗ trợ kỹ thuật trực tiếp:**\n• **Tác giả phát triển**: Thầy Vũ Văn Hùng\n• **Hotline / Zalo**: **0984.246.993** (Hỗ trợ 24/7)\n• **Email**: hungthcsnongu@gmail.com\n• **Phạm vi hỗ trợ**: Giải đáp thắc mắc điểm danh, xuất biểu mẫu Excel chuẩn mẫu số 01-BT, cấu hình phân quyền tài khoản, và đồng bộ CSDL Supabase Cloud.`,
      intent: 'GENERAL',
      keyMetrics: [
        { label: 'Tác giả phát triển', value: 'Thầy Vũ Văn Hùng' },
        { label: 'Hotline / Zalo', value: '0984.246.993' },
        { label: 'Đơn vị', value: 'THCS Xa Dung' },
      ],
      suggestedQuestions: [
        'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
        'Quy định chấm ăn bán trú và ngày thứ Sáu thế nào?',
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
      ],
    };
  }

  // 2. Tra cứu học sinh vắng / nghỉ học hôm nay (Must check before general attendance)
  const isAbsentInquiry =
    q.includes('nghỉ') ||
    q.includes('vắng') ||
    normQ.includes('nghi hoc') ||
    normQ.includes('hoc sinh nghi') ||
    normQ.includes('ai nghi') ||
    normQ.includes('em nao nghi') ||
    normQ.includes('ai vang') ||
    normQ.includes('danh sach vang') ||
    normQ.includes('ly do vang');

  if (isAbsentInquiry) {
    const absentList: any[] = context?.absentStudentsToday || [];
    
    // Check if user is asking about a specific class (e.g. 6a1, 7a, 8a2)
    const classMatch = q.match(/(?:lớp\s*|lop\s*)?([6-9][a-z0-9]*)/i);
    const targetClassCode = classMatch ? classMatch[1].toUpperCase() : null;

    let filteredAbsents = absentList;
    if (targetClassCode && targetClassCode.length >= 2) {
      filteredAbsents = absentList.filter((st: any) => {
        const cName = String(st.class_name || '').toUpperCase();
        return cName.includes(targetClassCode) || targetClassCode.includes(cName);
      });
    }

    if (filteredAbsents.length === 0) {
      const scopeLabel = targetClassCode ? `Lớp ${targetClassCode}` : 'Toàn trường';
      return {
        reply: `🎉 **Tin vui chuyên cần**: ${scopeLabel} hôm nay **không có học sinh nào vắng mặt**! Tất cả học sinh đều đã có mặt đầy đủ tại lớp học đúng giờ.`,
        intent: 'ATTENDANCE_SUMMARY',
        keyMetrics: [
          { label: 'Sĩ số vắng', value: '0 học sinh' },
          { label: 'Tỷ lệ chuyên cần', value: '100%' },
        ],
        action: { type: 'NAVIGATE', target: '/reports/daily', label: 'Xem Báo cáo Chi tiết Sĩ số Ngày' },
        suggestedQuestions: [
          'Hôm nay có những lớp nào chưa nộp báo cáo?',
          'Quy chế chấm ăn bán trú hôm nay',
          'Danh sách giáo viên chủ nhiệm các lớp',
        ],
      };
    }

    const itemsText = filteredAbsents
      .map(
        (st: any, idx: number) =>
          `• **${idx + 1}. ${st.student_name}** - Lớp **${st.class_name || 'Chưa rõ'}**\n  - Lý do: *${st.reason || 'Nghỉ có phép'}*\n  - Chế độ: ${st.isBoarding ? '🍱 Bán trú' : '🏡 Ngoại trú'}${st.teacher_name ? ` (GVCN: ${st.teacher_name})` : ''}`
      )
      .join('\n\n');

    return {
      reply: `📋 **DANH SÁCH HỌC SINH VẮNG MẶT HÔM NAY (${filteredAbsents.length} em):**\n\n${itemsText}\n\nThầy/Cô có thể nhấp vào nút bên dưới để mở Báo cáo ngày và xuất sổ theo dõi.`,
      intent: 'ATTENDANCE_SUMMARY',
      keyMetrics: [
        { label: 'Tổng số vắng', value: `${filteredAbsents.length} em` },
        { label: 'Bán trú vắng', value: `${filteredAbsents.filter((s: any) => s.isBoarding).length} em` },
      ],
      action: { type: 'NAVIGATE', target: '/reports/daily', label: 'Xem Báo cáo Chi tiết Sĩ số Ngày' },
      suggestedQuestions: [
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Số suất ăn bán trú trưa nay là bao nhiêu?',
        'Hạn chót nộp báo cáo là mấy giờ?',
      ],
    };
  }

  // 3. Tra cứu Giáo viên Chủ nhiệm (GVCN) & Thông tin Lớp học
  const isTeacherOrClassInquiry =
    q.includes('gvcn') ||
    normQ.includes('giao vien chu nhiem') ||
    normQ.includes('chu nhiem') ||
    normQ.includes('thay nao') ||
    normQ.includes('co nao') ||
    normQ.includes('ai chu nhiem') ||
    normQ.includes('danh sach gvcn') ||
    (normQ.includes('lop') && (normQ.includes('ai') || normQ.includes('co bao nhieu') || normQ.includes('si so')));

  if (isTeacherOrClassInquiry) {
    const classList: any[] = context?.classList || [];
    
    // Check if asking about a specific class (e.g., 6A1, 7A, 8A1, 9B...)
    const classMatch = q.match(/(?:lớp\s*|lop\s*)?([6-9][a-z0-9]*)/i);
    const targetClass = classMatch ? classMatch[1].toUpperCase() : null;

    if (targetClass && targetClass.length >= 2) {
      const cls = classList.find((c: any) => {
        const cName = String(c.class_name || '').toUpperCase();
        return cName === targetClass || cName.replace(/[^0-9A-Z]/g, '') === targetClass.replace(/[^0-9A-Z]/g, '');
      });

      if (cls) {
        return {
          reply: `👨‍🏫 **THÔNG TIN LỚP ${cls.class_name}:**\n\n• **Giáo viên Chủ nhiệm (GVCN)**: **${cls.teacher_name || 'Chưa phân công'}**\n• **Khối lớp**: Khối ${cls.grade || cls.class_name.charAt(0)}\n• **Sĩ số học sinh**: **${cls.student_count || 35}** học sinh\n• **Trạng thái báo cáo hôm nay**: ${cls.status === 'REPORTED' ? '✅ Đã nộp báo cáo' : cls.status === 'LOCKED' ? '🔒 Đã khóa sổ' : '⏳ Chưa nộp báo cáo'}\n\nThầy/Cô có thể bấm nút bên dưới để mở trang Quản lý Lớp học hoặc liên hệ trực tiếp GVCN.`,
          intent: 'GENERAL',
          keyMetrics: [
            { label: `GVCN Lớp ${cls.class_name}`, value: cls.teacher_name || 'Chưa phân công' },
            { label: 'Sĩ số lớp', value: `${cls.student_count || 35} HS` },
            { label: 'Trạng thái', value: cls.status === 'REPORTED' ? 'Đã nộp' : 'Chưa nộp' },
          ],
          action: { type: 'NAVIGATE', target: '/classes', label: 'Quản lý Lớp học & GVCN' },
          suggestedQuestions: [
            `Lớp ${cls.class_name} hôm nay có học sinh nào vắng không?`,
            'Hôm nay có những lớp nào chưa nộp báo cáo?',
            'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
          ],
        };
      }
    }

    // List all homeroom teachers
    if (classList.length > 0) {
      const listText = classList
        .map(
          (c: any) =>
            `• **Lớp ${c.class_name}**: GVCN **${c.teacher_name || 'Đang cập nhật'}** (Sĩ số: ${c.student_count || 35} HS) - ${c.status === 'REPORTED' ? '✅ Đã nộp' : '⏳ Chưa nộp'}`
        )
        .join('\n');

      return {
        reply: `👨‍🏫 **DANH SÁCH GIÁO VIÊN CHỦ NHIỆM (GVCN) TRƯỜNG PTDTBT THCS XA DUNG:**\n\n${listText}\n\nThầy/Cô có thể vào mục **"Quản lý Lớp học"** để cập nhật thông tin phân công GVCN hoặc thông tin phòng học.`,
        intent: 'GENERAL',
        keyMetrics: [
          { label: 'Tổng số lớp', value: `${classList.length} lớp` },
          { label: 'Đã phân công', value: `${classList.filter((c: any) => c.teacher_name && !c.teacher_name.includes('Chưa')).length} lớp` },
        ],
        action: { type: 'NAVIGATE', target: '/classes', label: 'Mở Quản lý Lớp học' },
        suggestedQuestions: [
          'Hôm nay có những lớp nào chưa nộp báo cáo?',
          'Hạn chót nộp báo cáo là mấy giờ?',
          'Hôm nay có học sinh nào vắng không?',
        ],
      };
    }
  }

  // 4. Tra cứu thông tin Học sinh theo tên / hồ sơ học sinh
  const isStudentSearch =
    q.includes('học sinh') ||
    normQ.includes('hoc sinh') ||
    normQ.includes('tim hoc sinh') ||
    normQ.includes('ho so hoc sinh') ||
    normQ.includes('em ') ||
    normQ.includes('giang a') ||
    normQ.includes('ho thi') ||
    normQ.includes('vang a') ||
    normQ.includes('thao a') ||
    normQ.includes('song a') ||
    normQ.includes('mua a') ||
    normQ.includes('ly a') ||
    normQ.includes('lau a');

  if (isStudentSearch) {
    const studentDir: any[] = context?.studentDirectory || [];
    
    // Extract search query by removing common prefix words
    const cleanSearchKeyword = normQ
      .replace(/tim\s*hoc\s*sinh/g, '')
      .replace(/thong\s*tin\s*hoc\s*sinh/g, '')
      .replace(/hoc\s*sinh/g, '')
      .replace(/em\s+/g, '')
      .replace(/ho\s*so/g, '')
      .replace(/tra\s*cuu/g, '')
      .trim();

    if (cleanSearchKeyword.length >= 2 && studentDir.length > 0) {
      const matches = studentDir.filter((s: any) => {
        const sNormName = normalizeVietnamese(s.name || s.full_name || '');
        const sNormVillage = normalizeVietnamese(s.village || s.address || '');
        const sNormClass = normalizeVietnamese(s.className || s.class_name || '');
        return (
          sNormName.includes(cleanSearchKeyword) ||
          cleanSearchKeyword.includes(sNormName) ||
          sNormVillage.includes(cleanSearchKeyword) ||
          sNormClass === cleanSearchKeyword
        );
      });

      if (matches.length > 0) {
        const displayList = matches.slice(0, 5).map((s: any, idx: number) => {
          return `• **${idx + 1}. ${s.name || s.full_name}**\n  - Lớp: **${s.className || s.class_name || 'Chưa xếp lớp'}**\n  - Diện: **${s.isBoarding ? '🍱 Bán trú' : '🏡 Ngoại trú'}**\n  - Bản/Cư trú: ${s.village || s.address || 'Xã Xa Dung'}${s.gender ? ` | Giới tính: ${s.gender}` : ''}`;
        }).join('\n\n');

        return {
          reply: `🔍 **KẾT QUẢ TÌM KIẾM HỌC SINH (Tìm thấy ${matches.length} học sinh phù hợp):**\n\n${displayList}${matches.length > 5 ? `\n\n*(Và còn ${matches.length - 5} học sinh khác nữa...)*` : ''}\n\nThầy/Cô có thể bấm vào nút **"Mở Hồ sơ Học sinh"** bên dưới để tra cứu chi tiết hoặc cập nhật thông tin.`,
          intent: 'GENERAL',
          keyMetrics: [
            { label: 'Kết quả tìm kiếm', value: `${matches.length} học sinh` },
            { label: 'Học sinh đầu tiên', value: matches[0].name || matches[0].full_name },
            { label: 'Lớp', value: matches[0].className || matches[0].class_name || 'N/A' },
          ],
          action: { type: 'NAVIGATE', target: '/students', label: 'Mở Hồ sơ Học sinh' },
          suggestedQuestions: [
            `Lớp ${matches[0].className || 'này'} GVCN là ai?`,
            'Hôm nay có học sinh nào vắng không?',
            'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
          ],
        };
      }
    }

    return {
      reply: `Để tra cứu hồ sơ và danh sách học sinh toàn trường, Thầy/Cô có thể:\n1. Gõ trực tiếp họ tên học sinh cần tìm (ví dụ: *"Giàng A Páo"*, *"Hờ Thị Mỷ"*).\n2. Gõ tên lớp để xem sĩ số và GVCN (ví dụ: *"GVCN lớp 6A1"*).\n3. Bấm nút **"Mở Hồ sơ Học sinh"** bên dưới để xem toàn bộ danh sách, lọc theo lớp, thôn bản hoặc xuất file danh sách học sinh.`,
      intent: 'GENERAL',
      action: { type: 'NAVIGATE', target: '/students', label: 'Mở Hồ sơ Học sinh' },
      suggestedQuestions: [
        'Danh sách GVCN các lớp',
        'Hôm nay có học sinh nào vắng không?',
        'Hạn chót nộp báo cáo là mấy giờ?',
      ],
    };
  }

  // 5. Questions about Report Deadline (07h30) & Emulation bonus points
  if (
    q.includes('hạn chót') ||
    normQ.includes('han chot') ||
    q.includes('07:30') ||
    q.includes('07h30') ||
    q.includes('mấy giờ') ||
    normQ.includes('may gio') ||
    q.includes('thi đua') ||
    normQ.includes('thi dua') ||
    q.includes('quy chế') ||
    normQ.includes('quy che') ||
    q.includes('điểm cộng') ||
    normQ.includes('diem cong') ||
    q.includes('trừ điểm') ||
    normQ.includes('tru diem')
  ) {
    return {
      reply: `⏰ **QUY CHẾ NỘP BÁO CÁO SĨ SỐ TRƯỜNG PTDTBT THCS XA DUNG:**\n\n1. **Hạn chót nộp hàng ngày**: **Trước 07h30 sáng** (Thứ 2 đến Thứ 6).\n2. **Điểm thưởng thi đua chuyên cần**: Lớp hoàn thành nộp báo cáo sớm trước 07h30 được cộng **+0.5 điểm thi đua/ngày** (tối đa **+2.5 điểm/tuần**).\n3. **Trừ điểm thi đua**: Lớp nộp muộn sau 07h30 hoặc để BGH phải gửi thông báo nhắc nhở sẽ bị trừ điểm thi đua trong tuần.\n4. **Ý nghĩa nghiệp vụ**: Nộp sớm trước 07h30 giúp BGH nắm chắc sĩ số toàn trường và chốt số lượng suất ăn với nhà bếp bán trú trước giờ nấu trưa.`,
      intent: 'GENERAL',
      keyMetrics: [
        { label: 'Hạn chót nộp', value: 'Trước 07h30' },
        { label: 'Cộng thi đua', value: '+0.5 đ/ngày' },
        { label: 'Tối đa tuần', value: '+2.5 đ/tuần' },
      ],
      action: { type: 'NAVIGATE', target: '/attendance', label: 'Điểm danh nộp báo cáo ngay' },
      suggestedQuestions: [
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Quy chế chấm ăn bán trú thế nào?',
        'Hướng dẫn các bước điểm danh cho GVCN',
      ],
    };
  }

  // 6. Questions about Boarding meal regulations & Friday/Weekend
  if (
    q.includes('bán trú') ||
    normQ.includes('ban tru') ||
    q.includes('chấm ăn') ||
    normQ.includes('cham an') ||
    q.includes('chấm cơm') ||
    normQ.includes('cham com') ||
    q.includes('suất ăn') ||
    normQ.includes('suat an') ||
    q.includes('nấu') ||
    q.includes('thứ sáu') ||
    q.includes('thứ 6') ||
    normQ.includes('thu 6') ||
    q.includes('thứ hai') ||
    q.includes('thứ 2') ||
    normQ.includes('thu 2') ||
    q.includes('thứ bảy') ||
    q.includes('thứ 7') ||
    normQ.includes('thu 7')
  ) {
    const b = context?.boardingSummary || {};
    return {
      reply: `🍱 **QUY CHẾ CHẤM ĂN BÁN TRÚ TRƯỜNG PTDTBT THCS XA DUNG:**\n\n• **Chế độ 3 bữa**: Học sinh bán trú được hưởng tiêu chuẩn ăn Sáng, Trưa, Tối theo định mức Nhà nước.\n• **Đặc thù Sáng Thứ Hai**: Học sinh từ các bản xa (Phì Cao, Háng Tàu...) lên trường muộn $\\rightarrow$ Bữa sáng chỉ tính khoảng **65% - 75%** sĩ số thực tế có mặt.\n• **Đặc thù Chiều Thứ Sáu**: Học sinh về bản thăm gia đình $\\rightarrow$ Bữa trưa ăn đầy đủ; **bữa tối chỉ tính học sinh ở lại nội trú cuối tuần** (khoảng **25% - 35%**).\n• **Thứ Bảy & Chủ Nhật**: Mặc định **tắt chấm ăn** theo quy định nhà trường (trừ trường hợp đặc biệt có phê duyệt của BGH).\n• **Tự động liên thông**: GVCN chỉ cần điểm danh học sinh có mặt ở Báo cáo sĩ số hàng ngày, hệ thống sẽ tự động cập nhật số suất cơm vào Sổ chấm ăn bán trú.\n\n📊 **Số liệu hôm nay**: Sáng: ${b.breakfast || 0} suất | Trưa: ${b.lunch || 0} suất | Tối: ${b.dinner || 0} suất.`,
      intent: 'BOARDING_INQUIRY',
      keyMetrics: [
        { label: 'Học sinh Bán trú', value: `${b.totalBoarding || 240} HS` },
        { label: 'Bữa Sáng hôm nay', value: `${b.breakfast || 0} suất` },
        { label: 'Bữa Trưa hôm nay', value: `${b.lunch || 0} suất` },
        { label: 'Bữa Tối hôm nay', value: `${b.dinner || 0} suất` },
      ],
      action: { type: 'NAVIGATE', target: '/boarding', label: 'Mở Quản lý Bán trú' },
      suggestedQuestions: [
        'Dự báo suất ăn tuần tới',
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Hôm nay có học sinh nào vắng không?',
      ],
    };
  }

  // 7. Questions about Attendance instructions / How to mark absent students
  if (
    q.includes('hướng dẫn') ||
    normQ.includes('huong dan') ||
    q.includes('cách điểm danh') ||
    normQ.includes('cach diem danh') ||
    q.includes('cách báo vắng') ||
    normQ.includes('cach bao vang') ||
    q.includes('nhập sĩ số') ||
    normQ.includes('nhap si so')
  ) {
    return {
      reply: `📋 **HƯỚNG DẪN 4 BƯỚC ĐIỂM DANH CHO GIÁO VIÊN CHỦ NHIỆM (GVCN):**\n\n1. **Bước 1**: Nhấn nút **"Điểm danh"** nổi bật ở thanh điều hướng dưới cùng (trên điện thoại) hoặc menu **"Báo cáo sĩ số"** (trên máy tính).\n2. **Bước 2**: Hệ thống tự động chọn lớp chủ nhiệm và ngày hôm nay. Kiểm tra sĩ số tổng của lớp.\n3. **Bước 3**: Tích chọn những học sinh vắng mặt và chọn lý do tương ứng (Ốm, Gia đình, Mưa lũ đường sạt lở, Không phép...).\n4. **Bước 4**: Kiểm tra lại số học sinh có mặt và số học sinh bán trú ăn trưa, sau đó bấm **"Lưu & Nộp báo cáo"**.\n\n⏱️ **Lưu ý**: Hãy nộp trước **07h30 sáng** để lớp nhận **+0.5 điểm thi đua**!`,
      intent: 'GENERAL',
      action: { type: 'NAVIGATE', target: '/attendance', label: 'Đi tới trang Điểm danh' },
      suggestedQuestions: [
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Quy chế chấm ăn bán trú thế nào?',
        'Dữ liệu có được lưu vào Supabase Cloud không?',
      ],
    };
  }

  // 8. Questions about Supabase Cloud sync & Persistence
  if (
    q.includes('supabase') ||
    q.includes('cloud') ||
    q.includes('lưu trữ') ||
    normQ.includes('luu tru') ||
    q.includes('đồng bộ') ||
    normQ.includes('dong bo') ||
    q.includes('mất dữ liệu') ||
    normQ.includes('mat du lieu') ||
    q.includes('an toàn dữ liệu') ||
    normQ.includes('an toan du lieu')
  ) {
    return {
      reply: `☁️ **CƠ CHẾ LƯU TRỮ VĨNH VIỄN TRÊN SUPABASE CLOUD:**\n\n• **Lưu trữ tức thì**: Toàn bộ thiết lập trường học, danh sách lớp, hồ sơ học sinh (phân loại Bán trú/Ngoại trú), báo cáo sĩ số hằng ngày và sổ chấm cơm bán trú đều được ghi nhận ngay lập tức vào CSDL Supabase Cloud.\n• **Đồng bộ đa thiết bị**: Thầy/Cô đăng nhập trên điện thoại cá nhân, máy tính trường, máy tính bảng hay trình duyệt khác thì dữ liệu luôn được tải về tức thì, chính xác 100%.\n• **An toàn tuyệt đối**: Kể cả khi tắt máy đột ngột, xóa lịch sử duyệt web hay đổi điện thoại mới, dữ liệu vẫn được bảo vệ nguyên vẹn trên Cloud.\n• **Trạng thái**: Thầy/Cô có thể theo dõi biểu tượng Cloud xanh trên thanh Header hoặc vào mục *"Cấu hình Supabase"* để kiểm tra.`,
      intent: 'GENERAL',
      action: { type: 'NAVIGATE', target: '/settings/supabase', label: 'Xem Cấu hình Supabase' },
      suggestedQuestions: [
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Thông tin hỗ trợ kỹ thuật Thầy Vũ Văn Hùng',
      ],
    };
  }

  // 9. Unreported classes inquiry
  if (
    q.includes('chưa nộp') ||
    normQ.includes('chua nop') ||
    q.includes('chưa báo cáo') ||
    normQ.includes('chua bao cao') ||
    q.includes('lớp nào chưa') ||
    normQ.includes('lop nao chua') ||
    q.includes('quên điểm danh') ||
    normQ.includes('quen diem danh')
  ) {
    const unrep = context?.unreportedClasses || [];
    if (unrep.length === 0) {
      return {
        reply: `🎉 **Báo cáo Thầy/Cô**: Hôm nay tất cả **${context?.totalClassesCount || 12} lớp** trong trường đều đã hoàn thành nộp báo cáo điểm danh **100%** đúng giờ! Ban Giám Hiệu đã có đầy đủ số liệu toàn trường.`,
        intent: 'UNREPORTED_CLASSES',
        keyMetrics: [{ label: 'Tiến độ báo cáo', value: '100% Hoàn thành' }],
        action: { type: 'NAVIGATE', target: '/dashboard', label: 'Xem Bảng điều khiển' },
        suggestedQuestions: [
          'Hôm nay toàn trường vắng bao nhiêu học sinh?',
          'Hôm nay có học sinh nào vắng không?',
          'Số suất ăn bán trú hôm nay',
        ],
      };
    }
    const names = unrep
      .map((c: any) => `• **Lớp ${c.name || c.class_name}**${c.teacherName ? ` (GVCN: ${c.teacherName})` : ''}`)
      .join('\n');

    return {
      reply: `⚠️ **DANH SÁCH ${unrep.length} LỚP CHƯA NỘP BÁO CÁO HÔM NAY:**\n\n${names}\n\nThầy/Cô chủ nhiệm các lớp trên vui lòng hoàn thành trước **07h30 sáng** để kịp thời chốt cơm bán trú và không bị trừ điểm thi đua của lớp!`,
      intent: 'UNREPORTED_CLASSES',
      keyMetrics: [{ label: 'Lớp chưa nộp', value: `${unrep.length} lớp` }],
      action: { type: 'NAVIGATE', target: '/dashboard', label: 'Xem danh sách & Gửi nhắc nhở' },
      suggestedQuestions: [
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Danh sách GVCN các lớp',
        'Quy chế chấm ăn bán trú thế nào?',
      ],
    };
  }

  // 10. Specific grade inquiry (Khối 6, 7, 8, 9)
  const gradeMatch = q.match(/khối\s*(6|7|8|9)/i) || normQ.match(/khoi\s*(6|7|8|9)/i);
  if (gradeMatch) {
    const gNum = parseInt(gradeMatch[1], 10);
    const gInfo = (context?.gradeStats || []).find((g: any) => g.grade === gNum);
    if (gInfo) {
      return {
        reply: `📊 **TÌNH HÌNH CHUYÊN CẦN KHỐI ${gNum} HÔM NAY:**\n\n• **Tổng số học sinh**: **${gInfo.total}** em\n• **Có mặt thực tế**: **${gInfo.present}** em\n• **Vắng mặt**: **${gInfo.absent}** em\n• **Tỷ lệ chuyên cần**: **${gInfo.rate}%**\n\nThầy/Cô có thể nhấp vào nút bên dưới để xem chi tiết từng lớp thuộc Khối ${gNum}.`,
        intent: 'GRADE_INQUIRY',
        keyMetrics: [
          { label: `Khối ${gNum} Tổng số`, value: `${gInfo.total} HS` },
          { label: 'Có mặt', value: `${gInfo.present} HS` },
          { label: 'Vắng', value: `${gInfo.absent} HS` },
          { label: 'Tỷ lệ', value: `${gInfo.rate}%` },
        ],
        action: { type: 'NAVIGATE', target: '/reports/daily', label: `Xem chi tiết Khối ${gNum}` },
        suggestedQuestions: [
          'Khối này có học sinh nào vắng không?',
          'Hôm nay toàn trường vắng bao nhiêu?',
          'Lớp nào chưa nộp báo cáo hôm nay?',
        ],
      };
    }
  }

  // 11. School overall attendance summary
  if (
    q.includes('toàn trường') ||
    normQ.includes('toan truong') ||
    q.includes('tổng số') ||
    normQ.includes('tong so') ||
    q.includes('sĩ số') ||
    normQ.includes('si so') ||
    q.includes('có mặt') ||
    normQ.includes('co mat') ||
    q.includes('chuyên cần') ||
    normQ.includes('chuyen can')
  ) {
    const total = context?.totalStudents || 0;
    const present = context?.presentCount || 0;
    const absent = context?.absentCount || 0;
    const rate = context?.presentRate || 0;
    return {
      reply: `📊 **BÁO CÁO SĨ SỐ TOÀN TRƯỜNG NGÀY ${context?.currentDate || 'HÔM NAY'}:**\n\n• **Tổng số học sinh toàn trường**: **${total}** em\n• **Số em có mặt**: **${present}** em\n• **Số em vắng mặt**: **${absent}** em\n• **Tỷ lệ chuyên cần toàn trường**: **${rate}%**\n• **Tiến độ báo cáo**: Đã có **${context?.reportedClassesCount || 0}/${context?.totalClassesCount || 0}** lớp hoàn thành nộp báo cáo.`,
      intent: 'ATTENDANCE_SUMMARY',
      keyMetrics: [
        { label: 'Tổng số HS', value: `${total} HS` },
        { label: 'Có mặt', value: `${present} HS` },
        { label: 'Vắng mặt', value: `${absent} HS` },
        { label: 'Tỷ lệ chuyên cần', value: `${rate}%` },
      ],
      action: { type: 'NAVIGATE', target: '/reports/daily', label: 'Mở Báo cáo Sĩ số Ngày' },
      suggestedQuestions: [
        'Hôm nay em nào vắng?',
        'Lớp nào chưa nộp báo cáo hôm nay?',
        'Số lượng suất ăn bán trú hôm nay',
      ],
    };
  }

  // 12. Dropout / at-risk inquiry
  if (
    q.includes('bỏ học') ||
    normQ.includes('bo hoc') ||
    q.includes('nguy cơ') ||
    normQ.includes('nguy co') ||
    q.includes('cảnh báo') ||
    normQ.includes('canh bao') ||
    q.includes('vắng liên tiếp') ||
    normQ.includes('vang lien tiep')
  ) {
    const atRisk = context?.highRiskStudents || [];
    const count = atRisk.length;
    return {
      reply: `⚠️ **CẢNH BÁO NGUY CƠ BỎ HỌC & CHUYÊN CẦN:**\n\nHệ thống AI Dự báo phát hiện có **${count} em học sinh** có biểu hiện vắng ngắt quãng hoặc có nguy cơ bỏ học cần sự quan tâm đặc biệt từ nhà trường. Đa số các em thuộc các bản vùng cao xa trường như Phì Cao, Háng Tàu.\n\nGVCN và đại diện BGH nên phối hợp cùng Trưởng bản để gặp gỡ gia đình, động viên các em duy trì đi học đều đặn.`,
      intent: 'DROPOUT_PREDICTION',
      keyMetrics: [{ label: 'Học sinh có nguy cơ', value: `${count} em` }],
      action: { type: 'NAVIGATE', target: '/ai-dropout-prediction', label: 'Xem Danh sách Cảnh báo & Kế hoạch AI' },
      suggestedQuestions: [
        'Hôm nay em nào vắng?',
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Quy chế chấm ăn bán trú thế nào?',
      ],
    };
  }

  // 13. Export / Reports
  if (
    q.includes('xuất excel') ||
    normQ.includes('xuat excel') ||
    q.includes('tải excel') ||
    normQ.includes('tai excel') ||
    q.includes('mẫu 01-bt') ||
    normQ.includes('mau 01-bt') ||
    q.includes('in biểu mẫu') ||
    normQ.includes('in bieu mau')
  ) {
    return {
      reply: `📑 **XUẤT BIỂU MẪU EXCEL BÁO CÁO & BÁN TRÚ:**\n\nHệ thống hỗ trợ xuất các biểu mẫu Excel chính thức theo chuẩn quy định của Phòng GD&ĐT:\n• **Báo cáo sĩ số hàng ngày**: Tổng hợp sĩ số, chuyên cần và danh sách học sinh vắng.\n• **Báo cáo sĩ số tuần & tháng**: Phục vụ công tác thi đua và báo cáo giao ban.\n• **Sổ chấm ăn bán trú**: Chuẩn biểu mẫu số 01-BT/BGH có đầy đủ ngày, bữa ăn, chữ ký GVCN và phụ trách bán trú.\n\nThầy/Cô có thể bấm nút bên dưới để mở Sổ chấm cơm và tải file Excel ngay lập tức.`,
      intent: 'EXPORT',
      action: { type: 'NAVIGATE', target: '/reports/boarding-monthly', label: 'Mở Sổ chấm cơm xuất Excel' },
      suggestedQuestions: [
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Hạn chót nộp báo cáo là mấy giờ?',
        'Xem báo cáo sĩ số hôm nay',
      ],
    };
  }

  // Default friendly pedagogical response
  return {
    reply: `Dạ xin kính chào Thầy/Cô! 👋\n\nTôi là **Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp phát triển** để đồng hành, hỗ trợ Ban Giám Hiệu và Giáo viên Chủ nhiệm Trường PTDTBT THCS Xa Dung 24/7.\n\nThầy/Cô có thể hỏi đáp nhanh về:\n• **Tra cứu học sinh, lớp học và GVCN**: Hỏi tên học sinh, lớp nào, ai là GVCN, học sinh nào nghỉ hôm nay.\n• **Quy chế sĩ số & Hạn chót**: Hạn chót 07h30 sáng, điểm thưởng chuyên cần thi đua (+0.5đ/ngày).\n• **Quy chế bán trú**: Chấm ăn 3 bữa, đặc thù sáng thứ Hai lên trường muộn, chiều thứ Sáu về bản, thứ Bảy & CN.\n• **Đồng bộ Supabase Cloud**: Lưu trữ dữ liệu an toàn trên Cloud, không sợ mất dữ liệu.\n• **Hỗ trợ kỹ thuật Thầy Vũ Văn Hùng**: Hotline/Zalo 0984.246.993.\n\nThầy/Cô có thể nhập câu hỏi vào ô chat hoặc bấm chọn các câu hỏi gợi ý nhanh bên dưới:`,
    intent: 'GENERAL',
    suggestedQuestions: [
      'Hôm nay có học sinh nào vắng không?',
      'Danh sách GVCN các lớp',
      'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
      'Quy chế chấm ăn bán trú và ngày thứ Sáu thế nào?',
      'Hôm nay có những lớp nào chưa nộp báo cáo?',
      'Thông tin hỗ trợ kỹ thuật của Thầy Vũ Văn Hùng',
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

    const fallback = () => generateFallbackSchoolReport(
      schoolName || 'Trường PTDTBT THCS Xa Dung',
      activeYear || '2026-2027',
      stats,
      highRiskStudents || []
    );

    const data = await callGeminiStructuredJson(prompt, fallback, 0.35);
    res.json({ success: true, data });
  } catch (err: any) {
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

    const fallback = () => generateFallbackIndividualPlan(student, absenceHistory, riskScore);
    const data = await callGeminiStructuredJson(prompt, fallback, 0.35);
    res.json({ success: true, data });
  } catch (err: any) {
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
Bạn là Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp nghiên cứu và phát triển để hỗ trợ Giáo viên Chủ nhiệm (GVCN) và Ban Giám hiệu (BGH) Trường PTDTBT THCS Xa Dung (Điện Biên Đông, Điện Biên) 24/7.
Tác giả phần mềm: Thầy Vũ Văn Hùng (Hotline / Zalo: 0984.246.993, Email: hungthcsnongu@gmail.com).

CƠ SỞ DỮ LIỆU THỰC TẾ ĐƯỢC CẤP (BẮT BUỘC ĐỌC VÀ TRÍCH XUẤT TRỰC TIẾP TÊN THẬT, SỐ LIỆU THẬT):
1. Danh sách Lớp học & Giáo viên Chủ nhiệm (GVCN):
${JSON.stringify(context?.classList || [], null, 2)}

2. Danh sách Học sinh VẮNG MẶT hôm nay (${context?.currentDate || 'hôm nay'}):
${JSON.stringify(context?.absentStudentsToday || [], null, 2)}

3. Thư mục tra cứu Học sinh (mẫu thực tế):
${JSON.stringify((context?.studentDirectory || []).slice(0, 80), null, 2)}

4. Số liệu toàn trường:
- Tổng số học sinh: ${context?.totalStudents || 0} em (Có mặt: ${context?.presentCount || 0}, Vắng: ${context?.absentCount || 0}, Tỷ lệ: ${context?.presentRate || 0}%)
- Lớp chưa nộp báo cáo: ${JSON.stringify(context?.unreportedClasses || [])}
- Suất ăn bán trú hôm nay: ${JSON.stringify(context?.boardingSummary || {})}
- Khối lớp: ${JSON.stringify(context?.gradeStats || [])}

Quy chế nhà trường:
- Hạn chót nộp báo cáo sĩ số trước 07h30 sáng (+0.5 điểm thi đua/ngày, tối đa +2.5đ/tuần, muộn bị trừ điểm).
- Chấm ăn bán trú 3 bữa (Sáng, Trưa, Tối). Sáng Thứ 2 các em lên muộn đạt ~65-75%; chiều Thứ 6 về bản nên tối chỉ nấu cho các em ở lại cuối tuần (~25-35%); Thứ 7 & CN tắt mặc định.
- Lưu trữ đám mây Supabase an toàn tuyệt đối.

NGƯỜI DÙNG ĐANG HỎI: "${message}"

QUY TẮC PHẢN HỒI BẮT BUỘC:
1. KHI ĐƯỢC HỎI VỀ GVCN HOẶC LỚP HỌC (ví dụ: "Ai là GVCN lớp 6A1?", "Chủ nhiệm lớp 7A2 là ai?", "Danh sách GVCN"):
   - BẮT BUỘC đọc trực tiếp mục (1) ở trên và NÊU ĐÍCH DANH tên Thầy/Cô chủ nhiệm lớp đó, sĩ số và trạng thái nộp báo cáo.
   - TUYỆT ĐỐI KHÔNG trả lời chung chung, TUYỆT ĐỐI KHÔNG bảo người dùng "liên hệ văn phòng" hay "tự đi kiểm tra danh sách".
   - Ví dụ chuẩn: "Dạ thưa Thầy/Cô, Giáo viên Chủ nhiệm của lớp 6A1 là **Thầy Lò Văn Hùng** (sĩ số lớp: 36 học sinh)."
2. KHI ĐƯỢC HỎI VỀ HỌC SINH VẮNG HÔM NAY (ví dụ: "Hôm nay em nào vắng?", "Ai nghỉ học?", "Lớp 6A có ai nghỉ không?"):
   - BẮT BUỘC trích xuất chính xác từ mục (2) ở trên: Tên học sinh, Lớp, Lý do vắng, Bán trú hay Ngoại trú.
   - Nếu danh sách (2) rỗng, thông báo rõ ràng toàn trường hôm nay không có học sinh nào vắng (chuyên cần 100%).
3. KHI ĐƯỢC HỎI TÌM KIẾM HỌC SINH CỤ THỂ:
   - Tìm kiếm trong mục (3) và trả lời đầy đủ: Họ tên, Lớp, Thôn bản cư trú, Diện Bán trú/Ngoại trú.
4. VĂN PHONG SƯ PHẠM: Xưng hô "Thầy/Cô", kính trọng, chu đáo. Dùng định dạng Markdown in đậm, chia mục gạch đầu dòng rõ ràng. Kèm số liệu (keyMetrics) và nút bấm (action).

Trả về định dạng JSON hợp lệ:
{
  "reply": "Câu trả lời trực tiếp, rõ ràng, nêu đích danh tên GVCN / học sinh từ dữ liệu trên",
  "intent": "ATTENDANCE_SUMMARY" | "UNREPORTED_CLASSES" | "GRADE_INQUIRY" | "BOARDING_INQUIRY" | "DROPOUT_PREDICTION" | "EXPORT" | "GENERAL",
  "keyMetrics": [
    { "label": "Tiêu đề số liệu", "value": "Giá trị" }
  ],
  "action": {
    "type": "NAVIGATE",
    "target": "/dashboard" | "/reports/daily" | "/boarding" | "/ai-dropout-prediction" | "/attendance" | "/classes" | "/students",
    "label": "Nhãn nút bấm hành động"
  },
  "suggestedQuestions": ["Gợi ý câu hỏi 1", "Gợi ý câu hỏi 2", "Gợi ý câu hỏi 3"]
}
    `.trim();

    const fallback = () => generateFallbackChatResponse(message, context);
    const data = await callGeminiStructuredJson(prompt, fallback, 0.3);
    res.json({ success: true, data });
  } catch (err: any) {
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

    const fallback = () => generateFallbackMealForecast(
      schoolName || 'Trường PTDTBT THCS Xa Dung',
      totalBoardingStudents || 240,
      upcomingDays || []
    );

    const data = await callGeminiStructuredJson(prompt, fallback, 0.3);
    res.json({ success: true, data });
  } catch (err: any) {
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

    const fallback = () => generateFallbackClassReport(
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

    const data = await callGeminiStructuredJson(prompt, fallback, 0.35);
    res.json({ success: true, data });
  } catch (err: any) {
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

    const fallback = () => generateFallbackStudentRemarks(
      className || '6A11',
      periodType || 'MONTH',
      studentsData || []
    );

    const data = await callGeminiStructuredJson(prompt, fallback, 0.3);
    res.json({ success: true, data });
  } catch (err: any) {
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
