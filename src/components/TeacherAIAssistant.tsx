import { loadOperationsData } from '../services/operationsData';
import { buildOperationsSnapshot, answerOperationsQuestion } from '../services/operationsInsights';
import { getTodayDateStr } from '../utils/schoolWeeks';
import { matchClassReport } from '../utils/studentUtils';
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

  const sendMessageRef = useRef<(text:string)=>void>(()=>{});
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
          sendMessageRef.current(transcript);
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
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if(!text || isLoading || !currentUser) return;
    setInputMessage(''); setIsLoading(true);
    setMessages(prev=>[...prev,{id:crypto.randomUUID(),sender:'user',text,timestamp:new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}]);
    let reply='';
    let action:ChatMessage['action'];
    try {
      const q=normalizeVietnamese(text);
      if(/han chot|quy dinh|thi dua/.test(q)) {
        reply=`Hạn báo cáo đang cấu hình: ${settings?.early_report_deadline || '07:30'}. Điểm thưởng sớm: ${settings?.enable_early_report_bonus === false ? 'đã tắt' : `${settings?.early_report_bonus_points ?? 0.5} điểm/ngày; tối đa ${settings?.early_report_max_bonus ?? 2.5} điểm/tuần`}. Lịch nghỉ và lịch ăn áp dụng theo cấu hình nhà trường.`;
      } else if(/huong dan|cach diem danh|cac buoc/.test(q)) {
        reply='Chọn lớp được giao và ngày báo cáo → kiểm tra tổng sĩ số → nhập học sinh vắng và lý do → kiểm tra báo ăn → gửi báo cáo. Chỉ coi là đã gửi khi máy chủ xác nhận. Bản nháp trên thiết bị chưa được tính là báo cáo.';
        action={type:'NAVIGATE',target:'/attendance',label:'Mở báo cáo sĩ số'};
      } else if(/supabase|cloud|luu tru|dong bo/.test(q)) {
        reply='Bản nháp được giữ riêng trên thiết bị. Báo cáo sĩ số được gửi trong một giao dịch; nếu máy chủ chưa xác nhận thì cần giữ bản nháp và kiểm tra lại. Báo ăn có trạng thái đồng bộ riêng, cần đối chiếu tại Trợ lý dữ liệu.';
      } else if(/tac gia|ho tro ky thuat|hotline|lien he/.test(q)) {
        reply=`Người phát triển: ${settings?.developer_name || 'Vũ Văn Hùng'}. Liên hệ: ${settings?.developer_contact || 'Chưa cấu hình thông tin liên hệ'}.`;
      } else {
        let scope=classes.filter(c=>c.active && (!activeYear||c.school_year_id===activeYear.id) &&
          (currentUser.role!=='GVCN' || c.homeroom_teacher_id===currentUser.id || !!currentUser.assigned_class_id&&matchClassReport(currentUser.assigned_class_id,c)));
        const target=q.match(/\b(\d{1,2}[a-z]\d+)\b/i)?.[1];
        if(target) scope=scope.filter(c=>normalizeVietnamese(c.class_name)===target);
        if(!scope.length) reply='Chưa có lớp thuộc phạm vi được giao hoặc lớp được hỏi. Không có dữ liệu để trả lời.';
        else if(/gvcn|giao vien chu nhiem|ho so|tra cuu/.test(q)) {
          reply='Mở Trợ lý dữ liệu để đối chiếu lớp được giao. Tra cứu hồ sơ chi tiết tại mục Lớp học theo quyền hiện có; câu trả lời này không tải danh bạ toàn trường.';
        } else {
          const today=getTodayDateStr();
          const data=await loadOperationsData(today,scope);
          const snapshot=buildOperationsSnapshot(today,scope,data.reports,data.values,indicators,data.boarding);
          reply=answerOperationsQuestion(text,snapshot)+`\n\nNguồn: báo cáo máy chủ ngày ${today}; phạm vi ${scope.length} lớp; đối chiếu lúc ${new Date(snapshot.checkedAt).toLocaleTimeString('vi-VN')}.`;
          if(data.boardingWarning) reply+='\n'+data.boardingWarning;
        }
        action={type:'NAVIGATE',target:'/operations',label:'Mở Trợ lý dữ liệu & đối chiếu'};
      }
    } catch {
      reply='Chưa tải được dữ liệu máy chủ nên chưa thể kết luận số lớp đã báo, số học sinh vắng hoặc tỷ lệ chuyên cần. Hãy thử lại khi kết nối ổn định.';
    } finally { setIsLoading(false); }
    setMessages(prev=>[...prev,{id:crypto.randomUUID(),sender:'ai',text:reply,action,
      timestamp:new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),
      suggestedQuestions:['Lớp nào chưa báo?','Kiểm tra sai lệch sĩ số','Danh sách học sinh vắng hôm nay']}]);
  };
  sendMessageRef.current = text => { void handleSendMessage(text); };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(()=>{ setCopiedId(id); setTimeout(()=>setCopiedId(null),2000); }).catch(()=>{});
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
