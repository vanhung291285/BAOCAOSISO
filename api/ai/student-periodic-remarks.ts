import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-3.8-flash';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { className, periodType, studentsData } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt = `
Bạn là Chuyên gia AI Tâm lý Sư phạm và Đánh giá Học sinh Trung học Cơ sở theo tinh thần Thông tư 22/2021/TT-BGDĐT của Bộ Giáo dục và Đào tạo Việt Nam.
Nhiệm vụ của bạn là xem xét dữ liệu chuyên cần, nề nếp bán trú, lịch sử đi học và địa bàn cư trú của từng học sinh lớp "${className || '6A11'}" và tự động viết LỜI NHẬN XÉT ĐỊNH KỲ CHUẨN MỰC SƯ PHẠM (${periodType || 'Định kỳ'}).

Danh sách học sinh cần nhận xét:
${JSON.stringify((studentsData || []).slice(0, 45), null, 2)}

Trả về JSON hợp lệ:
{
  "summaryClassRemarks": "Nhận xét tổng thể lớp",
  "remarks": [
    {
      "studentId": "id",
      "studentName": "Họ và tên",
      "category": "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" | "SPECIAL_ATTENTION",
      "categoryLabel": "Chuyên cần xuất sắc" | "Chuyên cần tốt" | "Cần nhắc nhở chuyên cần" | "Cần phối hợp gia đình",
      "remarkText": "Nội dung nhận xét sư phạm",
      "conductSuggestion": "Tốt" | "Khá" | "Đạt",
      "strengths": "Điểm mạnh",
      "notesForParent": "Lưu ý gửi phụ huynh"
    }
  ]
}
      `.trim();

      const response = await Promise.race([
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.35 },
        }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout sau 8s')), 8000)),
      ]);

      const text = response.text || '{}';
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        data = JSON.parse(cleaned);
      }
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.warn('Vercel serverless Gemini remarks API fallback:', err?.message);
    }
  }

  // Fallback
  const remarks = (studentsData || []).map((s: any) => {
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
      }. Cần cố gắng đi học đều đặn hơn để đảm bảo tiếp thu trọn vẹn kiến thức.`;
      strengths = 'Có cố gắng khi đến lớp, hòa đồng với các bạn';
      notesForParent = `Kính đề nghị phụ huynh tại ${village} phối hợp nhắc nhở em đi học đúng giờ.`;
    } else {
      category = 'SPECIAL_ATTENTION';
      categoryLabel = 'Cần phối hợp gia đình';
      conduct = 'Đạt';
      remarkText = `Em ${s.full_name} vắng ${absent} buổi trong kỳ, có dấu hiệu hổng kiến thức do nghỉ học nhiều ngày. Đề nghị em khắc phục khó khăn, đi học chuyên cần.`;
      strengths = 'Hòa đồng, cần có thêm động lực học tập';
      notesForParent = `Kính mong gia đình sắp xếp công việc, tạo điều kiện tối đa để em đến trường đầy đủ.`;
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

  return res.status(200).json({
    success: true,
    data: {
      className,
      periodType,
      summaryClassRemarks: `Tập thể lớp ${className} trong kỳ nhìn chung duy trì nề nếp chuyên cần đạt mức tốt. Đa số học sinh gương mẫu, chấp hành nghiêm nội quy trường lớp và quy chế bán trú.`,
      remarks,
    },
  });
}
