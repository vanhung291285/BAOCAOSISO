import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { Profile, UserRole } from '../types';
import { StorageService } from '../services/storage';
import {
  Users,
  ShieldCheck,
  Award,
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
} from 'lucide-react';

export const UsersManagementPage: React.FC = () => {
  const { allUsers, currentUser, isAdmin, isBGH, switchUser, reloadUsers } = useAuth();
  const { classes, updateClass, refreshAll } = useSchool();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');

  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('GVCN');
  const [formClassId, setFormClassId] = useState<string>('');
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const canManage = isAdmin || isBGH;

  const handleOpenEdit = (user: Profile) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormFullName(user.full_name);
    setFormPhone(user.phone || '');
    setFormRole(user.role);
    setFormClassId(user.assigned_class_id || '');
    setFormActive(user.active);
    setIsCreating(false);
    setFormError('');
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormEmail('');
    setFormFullName('');
    setFormPhone('');
    setFormRole('GVCN');
    setFormClassId('');
    setFormActive(true);
    setIsCreating(true);
    setFormError('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName.trim()) {
      setFormError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!formEmail.trim()) {
      setFormError('Vui lòng nhập email đăng nhập.');
      return;
    }

    try {
      let targetUserId = editingUser?.id;

      if (isCreating) {
        targetUserId = `u_${Date.now()}`;
        const newProfile: Profile = {
          id: targetUserId,
          full_name: formFullName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
          role: formRole,
          assigned_class_id: formRole === 'GVCN' && formClassId ? formClassId : undefined,
          active: formActive,
          created_at: new Date().toISOString(),
        };
        await StorageService.saveProfile(newProfile);
      } else if (editingUser) {
        const updatedProfile: Profile = {
          ...editingUser,
          full_name: formFullName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
          role: formRole,
          assigned_class_id: formRole === 'GVCN' && formClassId ? formClassId : undefined,
          active: formActive,
        };
        await StorageService.saveProfile(updatedProfile);
      }

      // Sync with class
      if (targetUserId) {
        if (formRole === 'GVCN' && formClassId) {
          // Assign this user as homeroom teacher to target class
          const targetClass = classes.find((c) => c.id === formClassId);
          if (targetClass) {
            await updateClass(targetClass.id, { homeroom_teacher_id: targetUserId });
          }
        } else if (editingUser?.assigned_class_id && editingUser.assigned_class_id !== formClassId) {
          // If previous class was unlinked
          const prevClass = classes.find((c) => c.id === editingUser.assigned_class_id);
          if (prevClass && prevClass.homeroom_teacher_id === targetUserId) {
            await updateClass(prevClass.id, { homeroom_teacher_id: undefined });
          }
        }
      }

      await reloadUsers();
      await refreshAll();

      setIsCreating(false);
      setEditingUser(null);
      setSuccessMsg('Đã lưu thông tin tài khoản thành công!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setFormError('Có lỗi xảy ra khi lưu thông tin người dùng.');
    }
  };

  const handleDeleteUser = async (user: Profile) => {
    if (user.id === currentUser?.id) {
      alert('Không thể xóa tài khoản bạn đang sử dụng.');
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn xóa tài khoản ${user.full_name} (${user.email})?`)) {
      await StorageService.deleteProfile(user.id);
      // Unlink class if was assigned
      if (user.assigned_class_id) {
        const cls = classes.find((c) => c.id === user.assigned_class_id);
        if (cls && cls.homeroom_teacher_id === user.id) {
          await updateClass(cls.id, { homeroom_teacher_id: undefined });
        }
      }
      await reloadUsers();
      await refreshAll();
    }
  };

  // Filtered user list
  const filteredUsers = allUsers.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = u.full_name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchPhone = u.phone ? u.phone.includes(q) : false;
      const assignedClass = classes.find((c) => c.id === u.assigned_class_id);
      const matchClass = assignedClass ? assignedClass.class_name.toLowerCase().includes(q) : false;
      if (!matchName && !matchEmail && !matchPhone && !matchClass) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                QUẢN LÝ TÀI KHOẢN VÀ PHÂN QUYỀN
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Danh sách cán bộ quản lý, giáo viên chủ nhiệm và gán lớp phụ trách
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo tài khoản mới</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Role Tabs */}
        <div className="flex items-center gap-1.5">
          {(['ALL', 'GVCN', 'BGH', 'ADMIN'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                roleFilter === r
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {r === 'ALL' ? `Tất cả (${allUsers.length})` : `${r} (${allUsers.filter((u) => u.role === r).length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, email, lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Email đăng nhập</th>
                <th className="py-3 px-4">Vai trò (Role)</th>
                <th className="py-3 px-4">Lớp chủ nhiệm</th>
                <th className="py-3 px-4">Số điện thoại</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-center">Đăng nhập nhanh</th>
                <th className="py-3 px-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const assignedClass = classes.find((c) => c.id === u.assigned_class_id);
                const isCurrent = currentUser?.id === u.id;

                return (
                  <tr key={u.id} className={`hover:bg-slate-50 ${isCurrent ? 'bg-blue-50/40 font-medium' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center">
                          {u.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{u.full_name}</div>
                          {isCurrent && <span className="text-[10px] text-blue-600 font-bold">(Bạn)</span>}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>

                    <td className="py-3 px-4">
                      {u.role === 'ADMIN' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                          <ShieldCheck className="w-3 h-3" /> ADMIN
                        </span>
                      )}
                      {u.role === 'BGH' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                          <Award className="w-3 h-3" /> BAN GIÁM HIỆU
                        </span>
                      )}
                      {u.role === 'GVCN' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          <GraduationCap className="w-3 h-3" /> GVCN
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {assignedClass ? (
                        <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                          Lớp {assignedClass.class_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-500">{u.phone || '-'}</td>

                    <td className="py-3 px-4 text-center">
                      {u.active ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          Đang hoạt động
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Tạm ngưng
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => switchUser(u.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                          isCurrent
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isCurrent ? 'Đang dùng' : 'Chuyển đổi'}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg hover:bg-slate-100"
                          title="Sửa thông tin"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {canManage && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit / Create User */}
      {(isCreating || editingUser) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">
                {isCreating ? 'TẠO TÀI KHOẢN MỚI' : `SỬA TÀI KHOẢN: ${editingUser?.full_name}`}
              </h3>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingUser(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 mt-4">
              {formError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Họ và tên
                </label>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="Thầy/Cô Nguyễn Văn A"
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email đăng nhập
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="teacher@db.edu.vn"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0912 345 678"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Vai trò (Role)
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:outline-hidden"
                  >
                    <option value="GVCN">GVCN (Giáo viên chủ nhiệm)</option>
                    <option value="BGH">BGH (Ban Giám Hiệu)</option>
                    <option value="ADMIN">ADMIN (Quản trị hệ thống)</option>
                  </select>
                </div>
              </div>

              {formRole === 'GVCN' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Lớp chủ nhiệm phụ trách
                  </label>
                  <select
                    value={formClassId}
                    onChange={(e) => setFormClassId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden font-semibold"
                  >
                    <option value="">-- Chưa phân công lớp --</option>
                    {classes.map((c) => {
                      const currentTeacher = allUsers.find(
                        (u) => u.id === c.homeroom_teacher_id && u.id !== editingUser?.id
                      );
                      return (
                        <option key={c.id} value={c.id}>
                          Lớp {c.class_name} (Khối {c.grade}) {currentTeacher ? `[Hiện tại: ${currentTeacher.full_name}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="activeCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Tài khoản đang hoạt động (Cho phép đăng nhập)
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{isCreating ? 'Tạo tài khoản' : 'Lưu thay đổi'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
