import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storage';
import {
  Sparkles,
  Bot,
  Mic,
  MicOff,
  Send,
  X,
  RefreshCw,
  ArrowRight,
  Phone,
  Clock,
  Utensils,
  ClipboardList,
  Cloud,
  Check,
  Copy,
  AlertTriangle,
  HelpCircle,
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldCheck,
  Layers,
  ChevronDown,
  UserCheck,
  GraduationCap,
  Search,
  UserX,
} from 'lucide-react';

export interface TeacherAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  keyMetrics?: Array<{ label: string; value: string }>;
  action?: {
    type: string;
    target: string;
    label: string;
  };
  suggestedQuestions?: string[];
}

interface QuickPromptCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

function normalizeVietnamese(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const QUICK_PROMPTS: QuickPromptCategory[] = [
  {
    id: 'absent_today',
    label: '🚫 Học sinh vắng hôm nay?',
    icon: <UserX className="w-3.5 h-3.5 text-rose-500" />,
    prompt: 'Hôm nay toàn trường có những học sinh nào nghỉ học và lý do vắng là gì?',
  },
  {
    id: 'homeroom_teachers',
    label: '👨‍🏫 Danh sách GVCN các lớp',
    icon: <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />,
    prompt: 'Cho tôi xem danh sách giáo viên chủ nhiệm và sĩ số của các lớp trong trường.',
  },
  {
    id: 'deadline',
    label: '⏰ Hạn chót 07h30 & Thi đua',
    icon: <Clock className="w-3.5 h-3.5 text-amber-500" />,
    prompt: 'Hạn chót nộp báo cáo sĩ số hàng ngày là mấy giờ? Quy định cộng trừ điểm thi đua thế nào?',
  },
  {
    id: 'boarding',
    label: '🍱 Quy chế chấm ăn bán trú',
    icon: <Utensils className="w-3.5 h-3.5 text-emerald-500" />,
    prompt: 'Quy định chấm ăn bán trú và ngày thứ Sáu, thứ Bảy như thế nào?',
  },
  {
    id: 'attendance_guide',
    label: '📋 Hướng dẫn điểm danh GVCN',
    icon: <ClipboardList className="w-3.5 h-3.5 text-blue-500" />,
    prompt: 'Hướng dẫn các bước điểm danh và báo học sinh vắng cho giáo viên chủ nhiệm.',
  },
  {
    id: 'unreported',
    label: '📊 Lớp chưa nộp hôm nay?',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />,
    prompt: 'Hôm nay có những lớp nào chưa nộp báo cáo sĩ số?',
  },
  {
    id: 'student_lookup',
    label: '🔍 Tra cứu hồ sơ học sinh',
    icon: <Search className="w-3.5 h-3.5 text-teal-500" />,
    prompt: 'Hướng dẫn cách tìm kiếm thông tin và hồ sơ học sinh trong trường.',
  },
  {
    id: 'supabase',
    label: '☁️ Lưu trữ Supabase Cloud',
    icon: <Cloud className="w-3.5 h-3.5 text-sky-500" />,
    prompt: 'Dữ liệu sĩ số và học sinh có được lưu ngay lập tức vào Supabase Cloud không?',
  },
  {
    id: 'author',
    label: '📞 Tác giả & Hỗ trợ kỹ thuật',
    icon: <Phone className="w-3.5 h-3.5 text-violet-500" />,
    prompt: 'Cho tôi biết thông tin liên hệ hỗ trợ kỹ thuật của Thầy Vũ Văn Hùng.',
  },
];

export const TeacherAIAssistant: React.FC<TeacherAIAssistantProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { settings, classes, students, activeYear, indicators } = useSchool();
  const { currentUser } = useAuth();

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ai',
      text: `Xin chào ${currentUser?.full_name ? `Thầy/Cô ${currentUser.full_name}` : 'quý Thầy/Cô và Ban Giám Hiệu'}! 👋\n\nTôi là **Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp phát triển** để đồng hành, hỗ trợ Giáo viên Chủ nhiệm (GVCN) và Ban Giám Hiệu (BGH) Trường PTDTBT THCS Xa Dung 24/7.\n\nThầy/Cô có thể hỏi đáp nhanh về **tra cứu học sinh, danh sách lớp, GVCN phụ trách, học sinh vắng hôm nay, quy chế hạn chót nộp báo cáo (trước 07h30 sáng), quy chế chấm ăn bán trú, đồng bộ Supabase Cloud** hoặc tra cứu tức thì số liệu toàn trường bằng bàn phím hoặc giọng nói!`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      suggestedQuestions: [
        'Hôm nay có học sinh nào vắng không?',
        'Danh sách GVCN các lớp',
        'Hạn chót nộp báo cáo sĩ số là mấy giờ? Có tính thi đua không?',
        'Quy định chấm ăn bán trú và ngày thứ Sáu như thế nào?',
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Thông tin hỗ trợ kỹ thuật của Thầy Vũ Văn Hùng',
      ],
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Prevent background body scroll on mobile when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
    return () => {
      document.body.style.overflow = '';
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen]);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'vi-VN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInputMessage(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSpeakText = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeaking === msgId) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown before speaking
    const cleanText = text
      .replace(/[*#_`~]/g, '')
      .replace(/\n+/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;

    utterance.onend = () => setIsSpeaking(null);
    utterance.onerror = () => setIsSpeaking(null);

    setIsSpeaking(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Build live school context for AI
  const getLiveSchoolContext = async () => {
    const today = new Date().toISOString().split('T')[0];
    let dailyData: any = null;
    let unreportedClasses: any[] = [];
    let gradeStats: any[] = [];
    let boardingSummary: any = {};
    const absentStudentsToday: any[] = [];

    try {
      dailyData = await StorageService.getDailyAggregate(today);
      unreportedClasses = dailyData.rows
        .filter((r: any) => r.status === 'NOT_REPORTED')
        .map((r: any) => ({
          id: r.classItem.id,
          name: r.classItem.class_name,
          teacherName: r.teacher?.full_name,
        }));

      // Collect absent students today
      dailyData.rows.forEach((r: any) => {
        let list: any[] = [];
        if (Array.isArray(r.report?.absent_students)) {
          list = r.report.absent_students;
        } else if (typeof r.report?.absent_students === 'string') {
          try {
            list = JSON.parse(r.report.absent_students);
          } catch {}
        }
        list.forEach((st: any) => {
          absentStudentsToday.push({
            student_name: st.full_name || st.name || 'Học sinh',
            class_name: r.classItem.class_name,
            teacher_name: r.teacher?.full_name,
            reason: st.reason || 'Nghỉ có phép',
            isBoarding: Boolean(st.isBoarding || st.is_boarding),
          });
        });
      });

      const grades = [6, 7, 8, 9];
      gradeStats = grades.map((g) => {
        const gRows = dailyData.rows.filter((r: any) => r.classItem.grade === g);
        let total = 0,
          present = 0,
          absent = 0;
        const firstInd = indicators[0]?.id;
        gRows.forEach((r: any) => {
          if (firstInd && r.values[firstInd]) {
            total += r.values[firstInd].total || 0;
            present += r.values[firstInd].present || 0;
            absent += r.values[firstInd].absent || 0;
          }
        });
        const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '100';
        return { grade: g, total, present, absent, rate };
      });
    } catch (e) {
      console.warn('Context gathering warning:', e);
    }

    try {
      boardingSummary = await StorageService.getBoardingSummaryByDate(today);
    } catch {}

    // Build classList with teacher names and actual student counts
    const classList = (dailyData?.rows || classes).map((item: any) => {
      const cls = item.classItem || item;
      const tName = item.teacher?.full_name || 'Chưa phân công';
      const cStudents = students.filter(
        (s) => s.class_id === cls.id || s.class_id === cls.class_name
      );
      return {
        id: cls.id,
        class_name: cls.class_name,
        grade: cls.grade || (cls.class_name ? parseInt(cls.class_name.charAt(0), 10) : 6),
        teacher_name: tName,
        student_count: cStudents.length || 35,
        status: item.status || 'NOT_REPORTED',
      };
    });

    // Build student directory sample for lookup
    const studentDirectory = students.map((s) => {
      const matchedCls = classes.find(
        (c) => c.id === s.class_id || c.class_name === s.class_id
      );
      return {
        id: s.id,
        name: s.full_name,
        className: matchedCls ? matchedCls.class_name : s.class_id,
        village: s.village || s.address || '',
        isBoarding: Boolean(s.isBoarding || s.is_boarding),
        gender: s.gender || '',
      };
    });

    return {
      schoolName: settings?.school_name || 'Trường PTDTBT THCS Xa Dung',
      currentDate: today,
      totalStudents: dailyData?.overallSchool?.total || students.length,
      presentCount: dailyData?.overallSchool?.present || 0,
      absentCount: dailyData?.overallSchool?.absent || 0,
      presentRate: dailyData?.overallSchool?.presentRate || 0,
      reportedClassesCount: dailyData?.reportedClasses || 0,
      totalClassesCount: dailyData?.totalClasses || classes.length,
      unreportedClasses,
      classList,
      absentStudentsToday,
      studentDirectory,
      gradeStats,
      boardingSummary: {
        totalBoarding: boardingSummary?.totalBoardingStudents || 240,
        breakfast: boardingSummary?.totalBreakfast || 0,
        lunch: boardingSummary?.totalLunch || 0,
        dinner: boardingSummary?.totalDinner || 0,
      },
      userRole: currentUser?.role || 'GVCN',
      userName: currentUser?.full_name || '',
      developerName: settings?.developer_name || 'Vũ Văn Hùng',
      developerContact: settings?.developer_contact || 'SĐT: 0984246993',
    };
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const context = await getLiveSchoolContext();
      const res = await fetch('/api/ai/chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.slice(-4).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          })),
          context,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Static hosting fallback');
      }

      const data = await res.json();
      const aiData = data.data || {};

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: aiData.reply || 'Dạ tôi đã ghi nhận câu hỏi của thầy cô.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        keyMetrics: aiData.keyMetrics,
        action: aiData.action,
        suggestedQuestions: aiData.suggestedQuestions,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.warn('Using client-side assistant fallback:', err);
      const rawLower = text.trim();
      const lower = rawLower.toLowerCase();
      const normQ = normalizeVietnamese(rawLower);

      let replyText = '';
      let keyMetrics: Array<{ label: string; value: string }> | undefined;
      let action: { type: string; target: string; label: string } | undefined;
      let suggested: string[] = [];

      // 1. Tác giả & Hỗ trợ kỹ thuật Thầy Vũ Văn Hùng
      if (
        lower.includes('vũ văn hùng') ||
        normQ.includes('vu van hung') ||
        lower.includes('tác giả') ||
        normQ.includes('tac gia') ||
        lower.includes('phát triển') ||
        normQ.includes('phat trien') ||
        lower.includes('sđt') ||
        lower.includes('sdt') ||
        lower.includes('hotline') ||
        lower.includes('0984') ||
        lower.includes('liên hệ') ||
        normQ.includes('lien he') ||
        lower.includes('hỗ trợ kỹ thuật')
      ) {
        replyText = `Ứng dụng **"Sổ Báo Cáo Sĩ Số"** và Trợ lý ảo AI do **Thầy Vũ Văn Hùng** trực tiếp nghiên cứu, lập trình và phát triển nhằm hỗ trợ tối đa quý Thầy/Cô GVCN và BGH Trường PTDTBT THCS Xa Dung 24/7.\n\n📞 **Thông tin hỗ trợ kỹ thuật trực tiếp:**\n• Tác giả phát triển: **Thầy Vũ Văn Hùng**\n• Hotline / Zalo: **0984.246.993** (Hỗ trợ 24/7)\n• Email: **hungthcsnongu@gmail.com**\n• Phạm vi hỗ trợ: Giải đáp thắc mắc điểm danh, xuất biểu mẫu Excel chuẩn mẫu số 01-BT, cấu hình tài khoản, phân quyền GVCN và đồng bộ CSDL Supabase Cloud.`;
        keyMetrics = [
          { label: 'Tác giả phát triển', value: 'Thầy Vũ Văn Hùng' },
          { label: 'Hotline / Zalo', value: '0984.246.993' },
          { label: 'Đơn vị', value: 'THCS Xa Dung' },
        ];
        suggested = [
          'Hôm nay có học sinh nào vắng không?',
          'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
          'Quy định chấm ăn bán trú thế nào?',
          'Lớp nào chưa nộp hôm nay?',
        ];
      }
      // 2. Tra cứu học sinh vắng / nghỉ học hôm nay
      else if (
        lower.includes('nghỉ') ||
        lower.includes('vắng') ||
        normQ.includes('nghi hoc') ||
        normQ.includes('hoc sinh nghi') ||
        normQ.includes('ai nghi') ||
        normQ.includes('em nao nghi') ||
        normQ.includes('ai vang') ||
        normQ.includes('danh sach vang') ||
        normQ.includes('ly do vang')
      ) {
        const today = new Date().toISOString().split('T')[0];
        let absentList: any[] = [];
        try {
          const daily = await StorageService.getDailyAggregate(today);
          daily.rows.forEach((r: any) => {
            let list: any[] = [];
            if (Array.isArray(r.report?.absent_students)) {
              list = r.report.absent_students;
            } else if (typeof r.report?.absent_students === 'string') {
              try { list = JSON.parse(r.report.absent_students); } catch {}
            }
            list.forEach((st: any) => {
              absentList.push({
                student_name: st.full_name || st.name || 'Học sinh',
                class_name: r.classItem.class_name,
                teacher_name: r.teacher?.full_name,
                reason: st.reason || 'Nghỉ có phép',
                isBoarding: Boolean(st.isBoarding || st.is_boarding),
              });
            });
          });
        } catch {}

        const classMatch = lower.match(/(?:lớp\s*|lop\s*)?([6-9][a-z0-9]*)/i);
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
          replyText = `🎉 **Tin vui chuyên cần**: ${scopeLabel} hôm nay **không có học sinh nào vắng mặt**! Tất cả học sinh đều đã có mặt đầy đủ tại lớp học đúng giờ.`;
          keyMetrics = [
            { label: 'Sĩ số vắng', value: '0 học sinh' },
            { label: 'Tỷ lệ chuyên cần', value: '100%' },
          ];
          action = { type: 'NAVIGATE', target: '/reports/daily', label: 'Xem Báo cáo Sĩ số Ngày' };
        } else {
          const itemsText = filteredAbsents
            .map(
              (st: any, idx: number) =>
                `• **${idx + 1}. ${st.student_name}** - Lớp **${st.class_name}**\n  - Lý do: *${st.reason || 'Nghỉ có phép'}*\n  - Chế độ: ${st.isBoarding ? '🍱 Bán trú' : '🏡 Ngoại trú'}${st.teacher_name ? ` (GVCN: ${st.teacher_name})` : ''}`
            )
            .join('\n\n');

          replyText = `📋 **DANH SÁCH HỌC SINH VẮNG MẶT HÔM NAY (${filteredAbsents.length} em):**\n\n${itemsText}\n\nThầy/Cô có thể nhấp vào nút bên dưới để mở Báo cáo ngày và theo dõi chi tiết.`;
          keyMetrics = [
            { label: 'Tổng số vắng', value: `${filteredAbsents.length} em` },
            { label: 'Bán trú vắng', value: `${filteredAbsents.filter((s: any) => s.isBoarding).length} em` },
          ];
          action = { type: 'NAVIGATE', target: '/reports/daily', label: 'Xem Báo cáo Chi tiết Sĩ số Ngày' };
        }

        suggested = [
          'Hôm nay có những lớp nào chưa nộp báo cáo?',
          'Danh sách giáo viên chủ nhiệm các lớp',
          'Quy chế chấm ăn bán trú hôm nay',
        ];
      }
      // 3. Tra cứu GVCN & Lớp học
      else if (
        lower.includes('gvcn') ||
        normQ.includes('giao vien chu nhiem') ||
        normQ.includes('chu nhiem') ||
        normQ.includes('thay nao') ||
        normQ.includes('co nao') ||
        normQ.includes('ai chu nhiem') ||
        normQ.includes('danh sach gvcn') ||
        (normQ.includes('lop') && (normQ.includes('ai') || normQ.includes('co bao nhieu') || normQ.includes('si so')))
      ) {
        const today = new Date().toISOString().split('T')[0];
        let classList: any[] = [];
        try {
          const daily = await StorageService.getDailyAggregate(today);
          classList = daily.rows.map((r: any) => ({
            id: r.classItem.id,
            class_name: r.classItem.class_name,
            grade: r.classItem.grade,
            teacher_name: r.teacher?.full_name || 'Chưa phân công',
            student_count: students.filter((s) => s.class_id === r.classItem.id || s.class_id === r.classItem.class_name).length || 35,
            status: r.status,
          }));
        } catch {
          classList = classes.map((c) => ({
            id: c.id,
            class_name: c.class_name,
            grade: c.grade,
            teacher_name: 'Đang cập nhật',
            student_count: students.filter((s) => s.class_id === c.id || s.class_id === c.class_name).length || 35,
            status: 'NOT_REPORTED',
          }));
        }

        const classMatch = lower.match(/(?:lớp\s*|lop\s*)?([6-9][a-z0-9]*)/i);
        const targetClass = classMatch ? classMatch[1].toUpperCase() : null;

        if (targetClass && targetClass.length >= 2) {
          const cls = classList.find((c: any) => {
            const cName = String(c.class_name || '').toUpperCase();
            return cName === targetClass || cName.replace(/[^0-9A-Z]/g, '') === targetClass.replace(/[^0-9A-Z]/g, '');
          });

          if (cls) {
            replyText = `👨‍🏫 **THÔNG TIN LỚP ${cls.class_name}:**\n\n• **Giáo viên Chủ nhiệm (GVCN)**: **${cls.teacher_name || 'Chưa phân công'}**\n• **Khối lớp**: Khối ${cls.grade || cls.class_name.charAt(0)}\n• **Sĩ số học sinh**: **${cls.student_count || 35}** học sinh\n• **Trạng thái báo cáo hôm nay**: ${cls.status === 'REPORTED' ? '✅ Đã nộp báo cáo' : cls.status === 'LOCKED' ? '🔒 Đã khóa sổ' : '⏳ Chưa nộp báo cáo'}\n\nThầy/Cô có thể bấm nút bên dưới để mở trang Quản lý Lớp học.`;
            keyMetrics = [
              { label: `GVCN Lớp ${cls.class_name}`, value: cls.teacher_name || 'Chưa phân công' },
              { label: 'Sĩ số lớp', value: `${cls.student_count || 35} HS` },
              { label: 'Trạng thái', value: cls.status === 'REPORTED' ? 'Đã nộp' : 'Chưa nộp' },
            ];
            action = { type: 'NAVIGATE', target: '/classes', label: 'Quản lý Lớp học & GVCN' };
            suggested = [
              `Lớp ${cls.class_name} hôm nay có học sinh nào vắng không?`,
              'Hôm nay có những lớp nào chưa nộp báo cáo?',
              'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
            ];
          }
        }

        if (!replyText && classList.length > 0) {
          const listText = classList
            .map(
              (c: any) =>
                `• **Lớp ${c.class_name}**: GVCN **${c.teacher_name || 'Đang cập nhật'}** (Sĩ số: ${c.student_count || 35} HS) - ${c.status === 'REPORTED' ? '✅ Đã nộp' : '⏳ Chưa nộp'}`
            )
            .join('\n');

          replyText = `👨‍🏫 **DANH SÁCH GIÁO VIÊN CHỦ NHIỆM (GVCN) TRƯỜNG PTDTBT THCS XA DUNG:**\n\n${listText}\n\nThầy/Cô có thể vào mục **"Quản lý Lớp học"** để cập nhật phân công GVCN hoặc sắp xếp lớp.`;
          keyMetrics = [
            { label: 'Tổng số lớp', value: `${classList.length} lớp` },
            { label: 'Đã phân công', value: `${classList.filter((c: any) => c.teacher_name && !c.teacher_name.includes('Chưa')).length} lớp` },
          ];
          action = { type: 'NAVIGATE', target: '/classes', label: 'Mở Quản lý Lớp học' };
          suggested = [
            'Hôm nay có những lớp nào chưa nộp báo cáo?',
            'Hạn chót nộp báo cáo là mấy giờ?',
            'Hôm nay có học sinh nào vắng không?',
          ];
        }
      }
      // 4. Tra cứu thông tin Học sinh theo tên / hồ sơ học sinh
      else if (
        lower.includes('học sinh') ||
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
        normQ.includes('lau a')
      ) {
        const cleanSearchKeyword = normQ
          .replace(/tim\s*hoc\s*sinh/g, '')
          .replace(/thong\s*tin\s*hoc\s*sinh/g, '')
          .replace(/hoc\s*sinh/g, '')
          .replace(/em\s+/g, '')
          .replace(/ho\s*so/g, '')
          .replace(/tra\s*cuu/g, '')
          .trim();

        if (cleanSearchKeyword.length >= 2 && students.length > 0) {
          const matches = students.filter((s) => {
            const sNormName = normalizeVietnamese(s.full_name || '');
            const sNormVillage = normalizeVietnamese(s.village || s.address || '');
            const matchedCls = classes.find((c) => c.id === s.class_id || c.class_name === s.class_id);
            const sNormClass = normalizeVietnamese(matchedCls ? matchedCls.class_name : s.class_id || '');
            return (
              sNormName.includes(cleanSearchKeyword) ||
              cleanSearchKeyword.includes(sNormName) ||
              sNormVillage.includes(cleanSearchKeyword) ||
              sNormClass === cleanSearchKeyword
            );
          });

          if (matches.length > 0) {
            const displayList = matches.slice(0, 5).map((s, idx) => {
              const matchedCls = classes.find((c) => c.id === s.class_id || c.class_name === s.class_id);
              const cName = matchedCls ? matchedCls.class_name : s.class_id || 'Chưa xếp lớp';
              const isB = Boolean(s.isBoarding || s.is_boarding);
              return `• **${idx + 1}. ${s.full_name}**\n  - Lớp: **${cName}**\n  - Diện: **${isB ? '🍱 Bán trú' : '🏡 Ngoại trú'}**\n  - Bản/Cư trú: ${s.village || s.address || 'Xã Xa Dung'}${s.gender ? ` | Giới tính: ${s.gender}` : ''}`;
            }).join('\n\n');

            replyText = `🔍 **KẾT QUẢ TÌM KIẾM HỌC SINH (Tìm thấy ${matches.length} học sinh phù hợp):**\n\n${displayList}${matches.length > 5 ? `\n\n*(Và còn ${matches.length - 5} học sinh khác nữa...)*` : ''}\n\nThầy/Cô có thể bấm vào nút **"Mở Hồ sơ Học sinh"** bên dưới để xem chi tiết đầy đủ hồ sơ.`;
            keyMetrics = [
              { label: 'Kết quả tìm kiếm', value: `${matches.length} học sinh` },
              { label: 'Học sinh đầu tiên', value: matches[0].full_name },
            ];
            action = { type: 'NAVIGATE', target: '/students', label: 'Mở Hồ sơ Học sinh' };
            suggested = [
              'Danh sách GVCN các lớp',
              'Hôm nay có học sinh nào vắng không?',
              'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
            ];
          }
        }

        if (!replyText) {
          replyText = `Để tra cứu hồ sơ và danh sách học sinh toàn trường, Thầy/Cô có thể:\n1. Gõ trực tiếp họ tên học sinh cần tìm (ví dụ: *"Giàng A Páo"*, *"Hờ Thị Mỷ"*).\n2. Gõ tên lớp để xem sĩ số và GVCN (ví dụ: *"GVCN lớp 6A1"*).\n3. Bấm nút **"Mở Hồ sơ Học sinh"** bên dưới để xem toàn bộ danh sách, lọc theo lớp, thôn bản hoặc cập nhật thông tin học sinh.`;
          action = { type: 'NAVIGATE', target: '/students', label: 'Mở Hồ sơ Học sinh' },
          suggested = [
            'Danh sách GVCN các lớp',
            'Hôm nay có học sinh nào vắng không?',
            'Hạn chót nộp báo cáo là mấy giờ?',
          ];
        }
      }
      // 5. Hạn chót 07h30 sáng & Điểm thưởng thi đua
      else if (
        lower.includes('hạn chót') ||
        normQ.includes('han chot') ||
        lower.includes('07:30') ||
        lower.includes('07h30') ||
        lower.includes('mấy giờ') ||
        normQ.includes('may gio') ||
        lower.includes('thi đua') ||
        normQ.includes('thi dua') ||
        lower.includes('quy chế') ||
        normQ.includes('quy che') ||
        lower.includes('điểm cộng')
      ) {
        replyText = `⏰ **QUY CHẾ NỘP BÁO CÁO SĨ SỐ TRƯỜNG PTDTBT THCS XA DUNG:**\n\n1. **Hạn chót hằng ngày**: Trước **07h30 sáng** (Thứ 2 đến Thứ 6).\n2. **Điểm cộng thi đua**: Các lớp nộp sớm trước 07h30 được cộng **+0.5 điểm thi đua/ngày** (tối đa **+2.5 điểm/tuần**).\n3. **Trừ điểm thi đua**: Lớp nộp muộn sau 07h30 hoặc để BGH phải gửi thông báo nhắc nhở sẽ bị trừ điểm thi đua của tuần.\n\nThầy/Cô vui lòng điểm danh sớm trước 07h30 để BGH kịp thời tổng hợp số liệu toàn trường và báo cơm nhà bếp!`;
        keyMetrics = [
          { label: 'Hạn chót', value: 'Trước 07h30' },
          { label: 'Cộng thi đua', value: '+0.5 đ/ngày' },
          { label: 'Tối đa tuần', value: '+2.5 đ/tuần' },
        ];
        action = { type: 'NAVIGATE', target: '/attendance', label: 'Điểm danh nộp báo cáo ngay' };
        suggested = ['Lớp nào chưa nộp hôm nay?', 'Quy định chấm ăn bán trú thế nào?', 'Hôm nay có học sinh nào vắng không?'];
      }
      // 6. Quy chế chấm ăn bán trú & ngày thứ Sáu
      else if (
        lower.includes('bán trú') ||
        normQ.includes('ban tru') ||
        lower.includes('chấm ăn') ||
        normQ.includes('cham an') ||
        lower.includes('chấm cơm') ||
        normQ.includes('cham com') ||
        lower.includes('suất ăn') ||
        normQ.includes('suat an') ||
        lower.includes('thứ sáu') ||
        lower.includes('thứ 6') ||
        lower.includes('thứ bảy') ||
        lower.includes('thứ 7')
      ) {
        replyText = `🍱 **QUY ĐỊNH CHẤM ĂN BÁN TRÚ NHÀ TRƯỜNG:**\n\n• **Chế độ 3 bữa**: Học sinh bán trú được hưởng tiêu chuẩn ăn Sáng, Trưa, Tối.\n• **Sáng Thứ Hai**: Học sinh từ các bản xa (Phì Cao, Háng Tàu) lên trường muộn $\\rightarrow$ Chỉ tính suất ăn cho các em đã có mặt thực tế (khoảng 65% - 75%).\n• **Thứ Sáu**: Bữa trưa ăn đầy đủ; chiều thứ Sáu học sinh được quản lý về thăm gia đình nên **bữa tối chỉ tính các em ở lại nội trú** (khoảng 25% - 35%).\n• **Thứ Bảy & Chủ Nhật**: Mặc định không chấm ăn theo quy chế nhà trường (trừ trường hợp đặc biệt được BGH phê duyệt).\n• **Tự động đồng bộ**: Khi GVCN báo học sinh có mặt ở Báo cáo sĩ số ngày, hệ thống tự động ghi nhận suất ăn tương ứng, không bị cắt sót suất cơm.`;
        action = { type: 'NAVIGATE', target: '/boarding', label: 'Mở Quản lý Bán trú' };
        suggested = ['Sổ chấm cơm tháng này', 'Hạn chót nộp báo cáo là mấy giờ?', 'Lớp nào chưa nộp hôm nay?'];
      }
      // 7. Hướng dẫn điểm danh
      else if (
        lower.includes('hướng dẫn') ||
        normQ.includes('huong dan') ||
        lower.includes('cách điểm danh') ||
        normQ.includes('cach diem danh') ||
        lower.includes('cách báo vắng') ||
        normQ.includes('cach bao vang') ||
        lower.includes('báo vắng')
      ) {
        replyText = `📋 **HƯỚNG DẪN ĐIỂM DANH CHO GIÁO VIÊN CHỦ NHIỆM:**\n\n1. Nhấn nút **"Điểm danh"** (hoặc mục "Báo cáo sĩ số" trên menu).\n2. Chọn lớp chủ nhiệm và ngày báo cáo (mặc định là hôm nay).\n3. Tích chọn các em vắng mặt và chọn lý do (Ốm, việc gia đình, mưa lũ, không phép...).\n4. Kiểm tra tổng số học sinh có mặt và số học sinh bán trú.\n5. Nhấn **"Lưu & Nộp báo cáo"** trước 07h30 sáng.\n\nDữ liệu sẽ lập tức được gửi lên BGH và tự động sao lưu vào Supabase Cloud.`;
        action = { type: 'NAVIGATE', target: '/attendance', label: 'Đi tới trang Điểm danh' };
        suggested = ['Hạn chót nộp báo cáo là mấy giờ?', 'Quy chế chấm ăn bán trú', 'Dữ liệu có lưu vào Supabase không?'];
      }
      // 8. Supabase Cloud sync & persistence
      else if (
        lower.includes('supabase') ||
        lower.includes('cloud') ||
        lower.includes('lưu trữ') ||
        normQ.includes('luu tru') ||
        lower.includes('đồng bộ') ||
        normQ.includes('dong bo')
      ) {
        replyText = `☁️ **CƠ CHẾ LƯU TRỮ VĨNH VIỄN TRÊN SUPABASE CLOUD:**\n\n• Toàn bộ cấu hình trường, danh sách lớp, danh sách học sinh (đầy đủ nhãn Bán trú/Ngoại trú), báo cáo sĩ số và sổ chấm ăn đều được **ghi ngay lập tức vào CSDL Supabase Cloud**.\n• Khi thầy/cô đăng nhập trên điện thoại, máy tính mới hoặc mở tab ẩn danh, toàn bộ dữ liệu luôn được tải đầy đủ về máy.\n• Thầy/Cô có thể theo dõi trạng thái tại nút **"Cloud Đã kết nối"** ở góc phải thanh Header.`;
        action = { type: 'NAVIGATE', target: '/settings/supabase', label: 'Xem Cấu hình Supabase' };
        suggested = ['Hạn chót nộp báo cáo là mấy giờ?', 'Lớp nào chưa nộp hôm nay?', 'Hotline hỗ trợ Thầy Vũ Văn Hùng'];
      }
      // 9. Lớp chưa nộp hôm nay
      else if (
        lower.includes('chưa nộp') ||
        normQ.includes('chua nop') ||
        lower.includes('chưa báo cáo') ||
        normQ.includes('chua bao cao') ||
        lower.includes('lớp nào chưa')
      ) {
        const today = new Date().toISOString().split('T')[0];
        let unrep: any[] = [];
        try {
          const daily = await StorageService.getDailyAggregate(today);
          unrep = daily.rows.filter((r: any) => r.status === 'NOT_REPORTED');
        } catch {}

        if (unrep.length === 0) {
          replyText = `🎉 **Báo cáo Thầy/Cô**: Hôm nay tất cả các lớp trong trường đều đã hoàn thành nộp báo cáo điểm danh **100%** đúng giờ!`;
          keyMetrics = [{ label: 'Tiến độ báo cáo', value: '100% Hoàn thành' }];
          action = { type: 'NAVIGATE', target: '/dashboard', label: 'Xem Bảng điều khiển' };
        } else {
          const names = unrep.map((r: any) => `• **Lớp ${r.classItem.class_name}**${r.teacher?.full_name ? ` (GVCN: ${r.teacher.full_name})` : ''}`).join('\n');
          replyText = `⚠️ **HIỆN TẠI CÒN ${unrep.length} LỚP CHƯA NỘP BÁO CÁO:**\n\n${names}\n\nThầy/Cô vui lòng nộp sớm trước 07h30 để kịp thời tổng hợp số liệu toàn trường!`;
          keyMetrics = [{ label: 'Lớp chưa nộp', value: `${unrep.length} lớp` }];
          action = { type: 'NAVIGATE', target: '/dashboard', label: 'Xem danh sách & Gửi nhắc nhở' };
        }
        suggested = ['Hạn chót nộp báo cáo là mấy giờ?', 'Quy chế chấm ăn bán trú', 'Danh sách GVCN các lớp'];
      }
      // Default fallback
      else {
        replyText = `Dạ xin kính chào Thầy/Cô! 👋\n\nTôi là **Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp phát triển** để đồng hành và hỗ trợ GVCN và BGH Trường PTDTBT THCS Xa Dung 24/7.\n\nThầy/Cô có thể hỏi nhanh về:\n• **Tra cứu học sinh**: Gõ tên học sinh để tra cứu lớp, bản cư trú, diện bán trú.\n• **Tra cứu GVCN & Lớp học**: Hỏi lớp nào, ai là GVCN, sĩ số lớp.\n• **Tra cứu học sinh vắng**: Hỏi hôm nay em nào vắng, lý do nghỉ học.\n• **Quy chế sĩ số & Hạn chót**: Hạn chót 07h30 sáng, điểm thưởng chuyên cần thi đua (+0.5đ/ngày).\n• **Quy chế bán trú**: Chấm ăn 3 bữa, thứ 2 lên muộn, thứ 6 về bản, thứ 7/CN.\n• **Hotline hỗ trợ Thầy Vũ Văn Hùng**: 0984.246.993.\n\nThầy/Cô có thể bấm chọn các gợi ý nhanh bên dưới:`;
        suggested = [
          'Hôm nay có học sinh nào vắng không?',
          'Danh sách GVCN các lớp',
          'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
          'Quy định chấm ăn bán trú thế nào?',
          'Lớp nào chưa nộp báo cáo hôm nay?',
          'Thông tin liên hệ Thầy Vũ Văn Hùng',
        ];
      }

      const fallbackMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        keyMetrics,
        action,
        suggestedQuestions: suggested,
      };

      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetConversation = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(null);
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        sender: 'ai',
        text: `Hội thoại đã được làm mới. Tôi là **Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp phát triển** hỗ trợ GVCN và BGH 24/7. Thầy/Cô cần hỗ trợ thông tin gì về quy chế, hạn chót 07h30, chấm ăn bán trú hay điểm danh sĩ số hôm nay ạ?`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        suggestedQuestions: [
          'Hạn chót nộp báo cáo sĩ số là mấy giờ?',
          'Quy định chấm ăn bán trú và ngày thứ Sáu thế nào?',
          'Hôm nay có những lớp nào chưa nộp báo cáo?',
          'Thông tin hỗ trợ kỹ thuật của Thầy Vũ Văn Hùng',
        ],
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/65 backdrop-blur-xs transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Container: Mobile = Bottom Sheet Drawer; Desktop = Centered Modal Dialog */}
      <div
        className={`w-full bg-white flex flex-col overflow-hidden shadow-2xl transition-all duration-200 border-slate-200
          /* Mobile styles: ôm sát đáy, bo góc trên, full width, h-88vh */
          max-md:rounded-t-3xl max-md:max-h-[88dvh] max-md:h-[88dvh] max-md:border-t
          /* Desktop styles: modal trung tâm, bo 4 góc, max-w-2xl, h-[680px] */
          md:rounded-3xl md:max-w-2xl md:h-[680px] md:max-h-[92vh] md:border
        `}
      >
        {/* Mobile Swipe / Drag Handle Bar */}
        <div className="md:hidden bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 pt-2.5 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-white/35 rounded-full" />
        </div>

        {/* 1. Header with Teacher Vu Van Hung Branding */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-3.5 sm:p-4.5 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Glowing Bot Avatar */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-400 via-indigo-500 to-blue-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-indigo-500/30 ring-2 ring-white/20">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-slate-950" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900" title="Sẵn sàng 24/7" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="font-extrabold text-xs sm:text-sm text-white tracking-tight uppercase truncate">
                  TRỢ LÝ ẢO AI - THẦY VŨ VĂN HÙNG
                </h3>
                <span className="text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shrink-0">
                  Hỗ trợ 24/7
                </span>
              </div>
              <div className="text-[10px] sm:text-xs text-blue-200 font-medium truncate mt-0.5 flex items-center gap-1.5">
                <span>Phát triển trực tiếp bởi Thầy Vũ Văn Hùng</span>
                <span className="text-blue-400 hidden sm:inline">•</span>
                <span className="text-amber-300 font-bold hidden sm:inline">PTDTBT THCS Xa Dung</span>
              </div>
            </div>
          </div>

          {/* Action buttons: Hotline, Reset, Close */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <a
              href="tel:0984246993"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-[11px] font-bold transition-all"
              title="Gọi hotline Thầy Vũ Văn Hùng: 0984246993"
            >
              <Phone className="w-3 h-3 text-amber-300" />
              <span>0984.246.993</span>
            </a>

            <button
              type="button"
              onClick={handleResetConversation}
              className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white transition-colors cursor-pointer"
              title="Làm mới cuộc trò chuyện"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-rose-600/80 text-white transition-colors cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Quick Prompts Toolbar (Horizontal Scroll on Mobile) */}
        <div className="bg-slate-100/90 border-b border-slate-200/90 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
              <span>Hỏi nhanh:</span>
            </div>
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.id}
                type="button"
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold text-slate-700 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-200/90 hover:border-blue-300 shadow-2xs whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span>{qp.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Messages Chat Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 bg-slate-50/70 text-xs sm:text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm ring-1 ring-blue-300/40">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[88%] sm:max-w-[82%] rounded-2xl p-3.5 space-y-2 shadow-2xs ${
                  m.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none font-medium'
                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/90'
                }`}
              >
                {/* Message Header Badge for AI */}
                {m.sender === 'ai' && (
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100 text-[10px] text-slate-500 font-bold">
                    <span className="flex items-center gap-1 text-blue-700">
                      <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
                      Trợ lý AI Thầy Vũ Văn Hùng
                    </span>
                    <span className="text-[10px] text-slate-400">{m.timestamp}</span>
                  </div>
                )}

                <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>

                {/* Key Metrics Chips */}
                {m.keyMetrics && m.keyMetrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100">
                    {m.keyMetrics.map((km, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 rounded-xl p-2 border border-slate-100 text-left"
                      >
                        <div className="text-[9px] text-slate-500 font-bold uppercase truncate">
                          {km.label}
                        </div>
                        <div className="text-xs font-black text-blue-900 mt-0.5 truncate">
                          {km.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Navigation Action Button */}
                {m.action && onNavigate && (
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(m.action!.target);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-black rounded-xl text-xs border border-blue-200 transition-all cursor-pointer active:scale-95 shadow-2xs group"
                    >
                      <span>{m.action.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                )}

                {/* Suggested Questions */}
                {m.suggestedQuestions && m.suggestedQuestions.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Gợi ý tiếp theo:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendMessage(q)}
                          disabled={isLoading}
                          className="text-[11px] font-semibold text-slate-700 bg-slate-100/90 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 px-2.5 py-1 rounded-lg text-left transition-colors cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Toolbar: Timestamp, Copy, Voice Readout */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>{m.sender === 'user' ? m.timestamp : ''}</span>
                  {m.sender === 'ai' && (
                    <div className="flex items-center gap-2">
                      {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                        <button
                          type="button"
                          onClick={() => handleSpeakText(m.id, m.text)}
                          className={`flex items-center gap-1 cursor-pointer transition-colors ${
                            isSpeaking === m.id
                              ? 'text-rose-600 font-bold animate-pulse'
                              : 'hover:text-slate-600'
                          }`}
                          title={isSpeaking === m.id ? 'Dừng đọc' : 'Đọc bằng giọng nói tiếng Việt'}
                        >
                          {isSpeaking === m.id ? (
                            <VolumeX className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {isSpeaking === m.id ? 'Dừng đọc' : 'Đọc'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.text)}
                        className="hover:text-slate-600 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Sao chép nội dung"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-bold">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-8 h-8 rounded-2xl bg-blue-700 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold shadow-2xs">
                  {currentUser?.full_name?.charAt(0) || 'GV'}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2.5 text-xs text-indigo-800 font-bold p-3 bg-indigo-50/80 rounded-2xl max-w-fit border border-indigo-100 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Trợ lý AI đang tra cứu dữ liệu nhà trường và tổng hợp câu trả lời...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 4. Chat Input Box */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 space-y-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Active speech indicator banner */}
          {isListening && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 animate-pulse">
              <div className="flex items-center gap-2 font-bold">
                <Mic className="w-4 h-4 text-rose-600" />
                <span>Đang nghe giọng nói của Thầy/Cô... Hãy nói câu hỏi vào micro!</span>
              </div>
              <button
                type="button"
                onClick={toggleListening}
                className="text-[11px] font-black underline cursor-pointer"
              >
                Dừng lại
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Voice input button */}
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-rose-600 text-white border-rose-600 animate-bounce shadow-md'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title={isListening ? 'Bấm để dừng nghe' : 'Nói câu hỏi bằng Micro tiếng Việt'}
              >
                {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />}
              </button>
            )}

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Hỏi về hạn chót 07h30, chấm ăn bán trú, điểm danh, Supabase..."
              disabled={isLoading}
              className="flex-1 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none bg-slate-50/50"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white text-xs sm:text-sm font-black transition-all shadow-sm cursor-pointer active:scale-95 flex items-center gap-1.5 shrink-0"
            >
              <span className="hidden sm:inline">Gửi câu hỏi</span>
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Teacher Vu Van Hung signature footer */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
            <span className="truncate">
              Trợ lý ảo AI do <strong>Thầy Vũ Văn Hùng</strong> trực tiếp phát triển
            </span>
            <span className="text-slate-500 font-bold shrink-0">
              Hotline: 0984.246.993
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
