import React, { useState, useEffect, useRef } from 'react';
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
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Compass,
  AlertTriangle,
  FileSpreadsheet,
  Calendar,
  Utensils,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

interface ChatMessage {
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

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const { settings, classes, students, activeYear, indicators } = useSchool();
  const { currentUser } = useAuth();

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ai',
      text: `Xin chào ${currentUser?.full_name || 'thầy/cô'}! Tôi là Trợ lý AI Tra cứu Báo cáo Sĩ số Trường PTDTBT THCS Xa Dung. Thầy/cô có thể hỏi tôi bất kỳ điều gì về sĩ số hôm nay, các lớp chưa nộp, suất ăn bán trú hoặc dự báo học sinh nguy cơ bỏ học bằng cách gõ tin nhắn hoặc bấm Micro nói.`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      suggestedQuestions: [
        'Hôm nay có những lớp nào chưa nộp báo cáo?',
        'Khối 9 vắng bao nhiêu học sinh hôm nay?',
        'Dự báo suất ăn bán trú ngày mai cần chuẩn bị bao nhiêu?',
        'Có bao nhiêu học sinh thuộc diện nguy cơ bỏ học?',
      ],
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputMessage(transcript);
          // Auto send transcript
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

  // Build live school context for AI
  const getLiveSchoolContext = async () => {
    const today = new Date().toISOString().split('T')[0];
    let dailyData = null;
    let unreportedClasses: any[] = [];
    let gradeStats: any[] = [];
    let boardingSummary: any = {};

    try {
      dailyData = await StorageService.getDailyAggregate(today);
      unreportedClasses = dailyData.rows
        .filter((r) => r.status === 'NOT_REPORTED')
        .map((r) => ({
          id: r.classItem.id,
          name: r.classItem.class_name,
          teacherName: r.teacher?.full_name,
        }));

      const grades = [6, 7, 8, 9];
      gradeStats = grades.map((g) => {
        const gRows = dailyData.rows.filter((r) => r.classItem.grade === g);
        let total = 0,
          present = 0,
          absent = 0;
        const firstInd = indicators[0]?.id;
        gRows.forEach((r) => {
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
      gradeStats,
      boardingSummary: {
        totalBoarding: boardingSummary?.totalBoardingStudents || 240,
        breakfast: boardingSummary?.totalBreakfast || 0,
        lunch: boardingSummary?.totalLunch || 0,
        dinner: boardingSummary?.totalDinner || 0,
      },
      userRole: currentUser?.role || 'GVCN',
      userName: currentUser?.full_name || '',
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
      console.error(err);
      const errorMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: 'Xin lỗi thầy/cô, hệ thống AI đang bận xử lý hoặc gặp gián đoạn kết nối. Thầy/cô vui lòng thử lại sau giây lát!',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full h-[600px] max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-indigo-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-5 h-5 text-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base uppercase tracking-tight">TRỢ LÝ ẢO AI BÁO CÁO</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Gemini 3.8 Flash
                </span>
              </div>
              <div className="text-[11px] text-blue-200 mt-0.5 font-medium">
                Tra cứu sĩ số, lớp chưa nộp, suất ăn bán trú bằng giọng nói & chữ viết
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer font-bold text-sm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/60 text-xs sm:text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 shadow-2xs ${
                  m.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none font-medium'
                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/90'
                }`}
              >
                <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>

                {/* Key Metrics Chips */}
                {m.keyMetrics && m.keyMetrics.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
                    {m.keyMetrics.map((km, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 text-left">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">{km.label}</div>
                        <div className="text-xs font-black text-blue-900 mt-0.5">{km.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Button */}
                {m.action && onNavigate && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(m.action!.target);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold rounded-xl text-xs border border-blue-200 transition-all cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <span>{m.action.label}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Suggested Questions */}
                {m.suggestedQuestions && m.suggestedQuestions.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Câu hỏi gợi ý nhanh:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendMessage(q)}
                          className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 px-2.5 py-1 rounded-lg text-left transition-colors cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>{m.timestamp}</span>
                  {m.sender === 'ai' && (
                    <button
                      type="button"
                      onClick={() => handleCopy(m.id, m.text)}
                      className="hover:text-slate-600 flex items-center gap-0.5 cursor-pointer"
                      title="Sao chép nội dung"
                    >
                      {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold shadow-2xs">
                  {currentUser?.full_name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold p-2 bg-indigo-50/70 rounded-xl max-w-fit">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>Trợ lý AI đang tra cứu dữ liệu thời gian thực...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 space-y-2">
          {/* Active speech indicator */}
          {isListening && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 animate-pulse">
              <div className="flex items-center gap-2 font-bold">
                <Mic className="w-4 h-4 text-rose-600" />
                <span>Đang lắng nghe giọng nói của thầy/cô... Hãy nói câu hỏi vào micro!</span>
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
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white border-rose-600 animate-bounce shadow-md'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title={isListening ? 'Bấm để dừng nghe' : 'Bấm để nói bằng giọng nói (Tiếng Việt)'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Nhập câu hỏi hoặc bấm micro (Ví dụ: Khối 9 hôm nay vắng mấy em?)..."
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>Gửi</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
