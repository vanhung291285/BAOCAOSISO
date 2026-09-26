import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { useNotifications } from '../contexts/NotificationContext';
import { StorageService } from '../services/storage';
import {
  User,
  GraduationCap,
  ShieldCheck,
  Award,
  Mail,
  Phone,
  School,
  Calendar,
  ExternalLink,
  Globe,
  FileCheck2,
  Volume2,
  VolumeX,
  Code2,
  CheckCircle2,
  BellRing,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface ProfilePageProps {
  onNavigate?: (path: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { classes, settings, activeYear } = useSchool();
  const { isSoundEnabled, toggleSound, testSound, isAudioBlocked } = useNotifications();
  const [testingSound, setTestingSound] = useState(false);
  const [reportStats, setReportStats] = useState<{
    todayReminders: number;
    totalReminders: number;
    unreportedDays: number;
    reportedDays: number;
    totalSchoolDays: number;
  }>({ todayReminders: 0, totalReminders: 0, unreportedDays: 0, reportedDays: 0, totalSchoolDays: 0 });

  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  useEffect(() => {
    if (currentUser) {
      StorageService.getClassUnreportedStats(currentUser.assigned_class_id, currentUser.id)
        .then((res) => setReportStats(res))
        .catch(console.error);
    }
  }, [currentUser]);

  const handleTestSound = async () => {
    setTestingSound(true);
    await testSound();
    setTimeout(() => setTestingSound(false), 1200);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Thông tin tài khoản người dùng */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl shadow-sm">
            {currentUser?.full_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">{currentUser?.full_name}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                currentUser?.role === 'ADMIN'
                  ? 'bg-red-100 text-red-800'
                  : currentUser?.role === 'BGH'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {currentUser?.role}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {currentUser?.role === 'ADMIN'
                ? 'Quản trị viên toàn hệ thống'
                : currentUser?.role === 'BGH'
                ? 'Ban Giám Hiệu nhà trường'
                : assignedClass
                ? `Giáo viên chủ nhiệm Lớp ${assignedClass.class_name}`
                : 'Giáo viên'}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <Mail className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Email đăng nhập</div>
              <div className="font-semibold text-slate-800">{currentUser?.email}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <Phone className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Số điện thoại</div>
              <div className="font-semibold text-slate-800">{currentUser?.phone || 'Chưa cập nhật'}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <School className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Trường công tác</div>
              <div className="font-semibold text-slate-800">{settings?.school_name}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Năm học</div>
              <div className="font-semibold text-slate-800">{activeYear?.name || '2026-2027'}</div>
            </div>
          </div>
        </div>

        {assignedClass && (
          <div className="mt-4 space-y-3">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-blue-700" />
                <div>
                  <div className="text-xs font-bold text-blue-950">
                    Lớp chủ nhiệm: Lớp {assignedClass.class_name}
                  </div>
                  <div className="text-[11px] text-blue-700">Khối {assignedClass.grade}</div>
                </div>
              </div>

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('/attendance')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-xs"
                >
                  Nhập sĩ số ngay
                </button>
              )}
            </div>

            {/* Thống kê số lần thông báo và số lần không báo cáo của GVCN */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200">
                <div className="flex items-center gap-1.5 text-rose-700 text-[11px] font-bold">
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Số lần thông báo</span>
                </div>
                <div className="mt-1 text-lg font-black text-rose-900">
                  {reportStats.totalReminders} <span className="text-xs font-semibold text-rose-700">lần</span>
                </div>
                <div className="text-[10px] text-rose-600 mt-0.5">
                  Hôm nay: {reportStats.todayReminders} lần
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200">
                <div className="flex items-center gap-1.5 text-amber-800 text-[11px] font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Số lần chưa báo</span>
                </div>
                <div className="mt-1 text-lg font-black text-amber-900">
                  {reportStats.unreportedDays} <span className="text-xs font-semibold text-amber-700">lần</span>
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">
                  Cần đôn đốc kịp thời
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
                <div className="flex items-center gap-1.5 text-emerald-800 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Đã nộp báo cáo</span>
                </div>
                <div className="mt-1 text-lg font-black text-emerald-900">
                  {reportStats.reportedDays} <span className="text-xs font-semibold text-emerald-700">ngày</span>
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">
                  Đã hoàn thành đúng hạn
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-700 text-[11px] font-bold">
                  <Award className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tỷ lệ hoàn thành</span>
                </div>
                <div className="mt-1 text-lg font-black text-slate-900">
                  {reportStats.totalSchoolDays > 0
                    ? `${Math.round((reportStats.reportedDays / reportStats.totalSchoolDays) * 100)}%`
                    : '100%'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Tổng {reportStats.totalSchoolDays} ngày học
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cổng Liên kết Tiện ích dành cho GVCN & Cán bộ giáo viên */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Cổng Liên Kết Tiện Ích Nhà Trường & Học Sinh</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đường dẫn nhanh đến trang thông tin điện tử và hệ thống kết quả học tập
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Link 1: Trang thông tin điện tử nhà trường */}
          <a
            href="https://thcsxadung.db.edu.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border border-blue-200/80 hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <School className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-bold text-blue-700 bg-white/90 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <span>Mở trang</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Trang Thông Tin Điện Tử Nhà Trường
              </h3>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                Cổng thông tin chính thức của Trường THCS Xà Dũng, tin tức, thông báo, kế hoạch giáo dục.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-blue-200/60 text-[11px] font-mono text-blue-700 font-semibold truncate">
              https://thcsxadung.db.edu.vn
            </div>
          </a>

          {/* Link 2: Trang Kết quả học tập của HS */}
          <a
            href="https://kqht.db.edu.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-4 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-teal-50/80 border border-emerald-200/80 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <FileCheck2 className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-white/90 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <span>Mở trang</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                Trang Kết Quả Học Tập Học Sinh
              </h3>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                Hệ thống tra cứu điểm số, xếp loại học lực, rèn luyện và kết quả học tập của học sinh.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-emerald-200/60 text-[11px] font-mono text-emerald-700 font-semibold truncate">
              https://kqht.db.edu.vn
            </div>
          </a>
        </div>
      </div>

      {/* Cài đặt âm thanh chuông báo trên thiết bị / điện thoại */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Cài Đặt Âm Thanh & Chuông Báo Trên Điện Thoại
              </h2>
              <p className="text-xs text-slate-500">
                Phát âm thanh chuông nhắc nhở và rung điện thoại khi chưa báo cáo sĩ số
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleSound(!isSoundEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isSoundEnabled ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isSoundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-2">
              <span>Trạng thái âm thanh:</span>
              {isSoundEnabled ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đang bật
                </span>
              ) : (
                <span className="text-slate-500 font-bold">Đang tắt</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">
              {isAudioBlocked
                ? '⚠️ Trình duyệt đang chờ thao tác chạm đầu tiên để mở khóa âm thanh tự động.'
                : '✅ Âm thanh đã sẵn sàng phát chuông khi có thông báo từ BGH hoặc nhắc nhở tự động.'}
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestSound}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap ${
              testingSound
                ? 'bg-emerald-600 text-white animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{testingSound ? 'Đang phát chuông...' : 'Thử chuông & Rung'}</span>
          </button>
        </div>
      </div>

      {/* Thông tin nhà phát triển ứng dụng */}
      <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-2xl p-5 border border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 font-bold shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">
                ỨNG DỤNG BÁO CÁO SĨ SỐ HỌC SINH
              </div>
              <div className="text-sm font-black text-white mt-0.5">
                Ứng dụng được phát triển bởi <span className="text-amber-300">Vũ Văn Hùng</span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                Điện thoại liên hệ: <a href="tel:0984246993" className="text-amber-300 font-bold hover:underline">0984246993</a>
              </div>
            </div>
          </div>

          <div className="self-end sm:self-auto">
            <a
              href="tel:0984246993"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-amber-300" />
              <span>Gọi 0984246993</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
