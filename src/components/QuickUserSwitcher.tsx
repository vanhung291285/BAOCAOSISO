import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { UserCheck, ChevronDown, ShieldCheck, Award, GraduationCap } from 'lucide-react';

export const QuickUserSwitcher: React.FC = () => {
  const { currentUser, switchUser, allUsers } = useAuth();
  const { classes } = useSchool();
  const [isOpen, setIsOpen] = useState(false);

  // Group key personas
  const adminUser = allUsers.find((u) => u.role === 'ADMIN');
  const bghUser = allUsers.find((u) => u.role === 'BGH');
  const gvcn6A9 = allUsers.find((u) => {
    const cls = classes.find((c) => c.id === u.assigned_class_id);
    return cls?.class_name === '6A9';
  }) || allUsers.find((u) => u.email.includes('6a9'));
  const gvcn7A1 = allUsers.find((u) => {
    const cls = classes.find((c) => c.id === u.assigned_class_id);
    return cls?.class_name === '7A1';
  }) || allUsers.find((u) => u.email.includes('7a1'));

  const getClassName = (classId?: string) => {
    if (!classId) return '';
    const c = classes.find((item) => item.id === classId);
    return c ? `(Lớp ${c.class_name})` : '';
  };

  const selectUser = (userId: string) => {
    switchUser(userId);
    setIsOpen(false);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">ADMIN</span>;
      case 'BGH':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">BGH</span>;
      default:
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">GVCN</span>;
    }
  };

  return (
    <div className="relative no-print">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors flex-shrink-0"
        title="Chuyển đổi vai trò nhanh để kiểm tra tính năng"
      >
        <UserCheck className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <span className="hidden md:inline text-slate-500">Chuyển:</span>
        <span className="hidden sm:inline font-bold text-slate-900 truncate max-w-[130px]">
          {currentUser?.full_name || 'Chọn'}
        </span>
        <span className="sm:hidden font-bold text-slate-800 text-[11px] truncate max-w-[55px]">
          {currentUser?.full_name ? currentUser.full_name.split(' ').slice(-1)[0] : 'Chọn'}
        </span>
        {currentUser && getRoleBadge(currentUser.role)}
        <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-24px)] rounded-xl bg-white shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-1.5 border-b border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Chọn vai trò kiểm thử</p>
            </div>

            <div className="py-1">
              {adminUser && (
                <button
                  type="button"
                  onClick={() => selectUser(adminUser.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    currentUser?.id === adminUser.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-red-600" />
                    <div>
                      <div className="font-medium text-slate-900">{adminUser.full_name}</div>
                      <div className="text-[10px] text-slate-500">Toàn quyền hệ thống & cài đặt</div>
                    </div>
                  </div>
                  {getRoleBadge('ADMIN')}
                </button>
              )}

              {bghUser && (
                <button
                  type="button"
                  onClick={() => selectUser(bghUser.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    currentUser?.id === bghUser.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <div>
                      <div className="font-medium text-slate-900">{bghUser.full_name}</div>
                      <div className="text-[10px] text-slate-500">Xem toàn trường, xuất Excel, in</div>
                    </div>
                  </div>
                  {getRoleBadge('BGH')}
                </button>
              )}

              <div className="my-1 border-t border-slate-100 px-3 pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Giáo viên chủ nhiệm</p>
              </div>

              {gvcn6A9 && (
                <button
                  type="button"
                  onClick={() => selectUser(gvcn6A9.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    currentUser?.id === gvcn6A9.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-medium text-slate-900">{gvcn6A9.full_name}</div>
                      <div className="text-[10px] text-emerald-600 font-semibold">GVCN Lớp 6A9 (Đã báo cáo mẫu)</div>
                    </div>
                  </div>
                  {getRoleBadge('GVCN')}
                </button>
              )}

              {gvcn7A1 && (
                <button
                  type="button"
                  onClick={() => selectUser(gvcn7A1.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    currentUser?.id === gvcn7A1.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-amber-600" />
                    <div>
                      <div className="font-medium text-slate-900">{gvcn7A1.full_name}</div>
                      <div className="text-[10px] text-amber-600 font-semibold">GVCN Lớp 7A1 (Chưa báo cáo)</div>
                    </div>
                  </div>
                  {getRoleBadge('GVCN')}
                </button>
              )}
            </div>

            <div className="pt-2 px-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Đang có {allUsers.length} tài khoản</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
