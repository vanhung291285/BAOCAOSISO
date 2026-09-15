import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { User, GraduationCap, ShieldCheck, Award, Mail, Phone, School, Calendar } from 'lucide-react';

interface ProfilePageProps {
  onNavigate?: (path: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { classes, settings, activeYear } = useSchool();

  const assignedClass = classes.find((c) => c.id === currentUser?.assigned_class_id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
          <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
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
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700"
              >
                Nhập sĩ số ngay
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
