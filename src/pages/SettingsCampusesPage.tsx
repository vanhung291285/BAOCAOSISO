import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { Campus } from '../types';
import { SettingsNavTabs } from '../components/SettingsNavTabs';
import { ShieldAlert, Plus, Trash2, MapPin, Check, AlertCircle, Edit2, X, Save } from 'lucide-react';

export const SettingsCampusesPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { campuses, saveCampus, deleteCampus } = useSchool();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({ 
    name: '', 
    active: true,
    principal_name: '',
    principal_title: '',
    reporter_name: '',
    reporter_title: ''
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // If user is not an administrator, deny access
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
          QUYỀN TRUY CẬP BỊ GIỚI HẠN
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          Chức năng cấu hình phân hiệu chỉ dành riêng cho tài khoản <strong>Quản trị viên (ADMIN)</strong>.
        </p>
        <p className="text-xs text-slate-500">
          Tài khoản hiện tại: <strong className="text-slate-800">{currentUser?.full_name}</strong> ({currentUser?.role})
        </p>
      </div>
    );
  }

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setFormData({ 
      name: '', 
      active: true,
      principal_name: '',
      principal_title: '',
      reporter_name: '',
      reporter_title: ''
    });
    setErrorMsg('');
  };

  const handleStartEdit = (campus: Campus) => {
    setIsAdding(false);
    setEditingId(campus.id);
    setFormData({ 
      name: campus.name, 
      active: campus.active,
      principal_name: campus.principal_name || '',
      principal_title: campus.principal_title || '',
      reporter_name: campus.reporter_name || '',
      reporter_title: campus.reporter_title || ''
    });
    setErrorMsg('');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ 
      name: '', 
      active: true,
      principal_name: '',
      principal_title: '',
      reporter_name: '',
      reporter_title: ''
    });
    setErrorMsg('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập tên phân hiệu/điểm trường.');
      return;
    }

    const isDuplicate = campuses.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingId
    );

    if (isDuplicate) {
      setErrorMsg('Tên phân hiệu đã tồn tại.');
      return;
    }

    setIsSaving(true);
    try {
      if (isAdding) {
        const newCampus: Campus = {
          id: `campus_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: trimmedName,
          active: formData.active,
          principal_name: formData.principal_name.trim(),
          principal_title: formData.principal_title.trim(),
          reporter_name: formData.reporter_name.trim(),
          reporter_title: formData.reporter_title.trim(),
          created_at: new Date().toISOString(),
        };
        await saveCampus(newCampus);
        setSuccessMsg('Đã thêm phân hiệu mới thành công!');
      } else if (editingId) {
        const existing = campuses.find((c) => c.id === editingId);
        if (existing) {
          const updated: Campus = {
            ...existing,
            name: trimmedName,
            active: formData.active,
            principal_name: formData.principal_name.trim(),
            principal_title: formData.principal_title.trim(),
            reporter_name: formData.reporter_name.trim(),
            reporter_title: formData.reporter_title.trim(),
          };
          await saveCampus(updated);
          setSuccessMsg('Đã cập nhật phân hiệu thành công!');
        }
      }
      handleCancel();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg('Có lỗi xảy ra khi lưu dữ liệu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (campusId: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa phân hiệu này? Hệ thống sẽ báo lỗi nếu có lớp học đang thuộc phân hiệu này.')) {
      try {
        await deleteCampus(campusId);
        setSuccessMsg('Đã xóa phân hiệu thành công!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        alert('Không thể xóa. Vui lòng kiểm tra lại!');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SettingsNavTabs currentPath="/settings/campuses" />

      {/* Page Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200">
              Dành riêng cho Quản trị viên
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            QUẢN LÝ PHÂN HIỆU / ĐIỂM TRƯỜNG
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thêm, sửa, xóa danh sách các điểm trường phụ thuộc nhà trường
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-800 flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Edit / Add Form */}
      {(isAdding || editingId) && (
        <form onSubmit={handleSave} className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 uppercase tracking-wider">
              {isAdding ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {isAdding ? 'Thêm phân hiệu mới' : 'Cập nhật phân hiệu'}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Tên phân hiệu / Điểm trường
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Phân hiệu Nà Sản..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                autoFocus
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Người lập biểu (Báo cáo)
              </label>
              <input
                type="text"
                value={formData.reporter_name}
                onChange={(e) => setFormData({ ...formData, reporter_name: e.target.value })}
                placeholder="VD: Tòng Văn A"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Chức danh lập biểu
              </label>
              <input
                type="text"
                value={formData.reporter_title}
                onChange={(e) => setFormData({ ...formData, reporter_title: e.target.value })}
                placeholder="VD: GIÁO VIÊN"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Người ký duyệt (BGH phụ trách)
              </label>
              <input
                type="text"
                value={formData.principal_name}
                onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                placeholder="VD: Lò Thị B"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Chức danh ký duyệt
              </label>
              <input
                type="text"
                value={formData.principal_title}
                onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                placeholder="VD: PHÓ HIỆU TRƯỞNG"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1.5 flex flex-col justify-center pt-2 md:col-span-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                />
                <span className="text-sm font-semibold text-slate-700">Trạng thái hoạt động</span>
              </label>
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu thông tin'}</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            DANH SÁCH PHÂN HIỆU ({campuses.length})
          </h2>
          
          {!isAdding && !editingId && (
            <button
              onClick={handleStartAdd}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm mới</span>
            </button>
          )}
        </div>

        {campuses.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Chưa có phân hiệu nào được thiết lập. Vui lòng thêm phân hiệu mới.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Tên phân hiệu</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campuses.map((campus) => (
                  <tr key={campus.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {campus.name}
                    </td>
                    <td className="px-4 py-3">
                      {campus.active ? (
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                          Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                          Tạm khóa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleStartEdit(campus)}
                          disabled={isAdding || editingId !== null}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(campus.id)}
                          disabled={isAdding || editingId !== null}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Xóa phân hiệu"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
