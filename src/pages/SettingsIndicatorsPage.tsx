import React, { useState } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { IndicatorGroup } from '../types';
import { SettingsNavTabs } from '../components/SettingsNavTabs';
import {
  Layers,
  Plus,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Save,
  X,
  Sparkles,
} from 'lucide-react';

export const SettingsIndicatorsPage: React.FC = () => {
  const { indicators, addIndicator, updateIndicator, deleteIndicator } = useSchool();
  const [editingItem, setEditingItem] = useState<IndicatorGroup | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formHeaderOverride, setFormHeaderOverride] = useState('');
  const [formShowTotal, setFormShowTotal] = useState(true);
  const [formShowPresent, setFormShowPresent] = useState(true);
  const [formShowAbsent, setFormShowAbsent] = useState(true);
  const [formShowPercentage, setFormShowPercentage] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(1);

  const handleOpenEdit = (ig: IndicatorGroup) => {
    setEditingItem(ig);
    setFormName(ig.name);
    setFormCode(ig.code);
    setFormHeaderOverride(ig.column_header_override || '');
    setFormShowTotal(ig.show_total);
    setFormShowPresent(ig.show_present);
    setFormShowAbsent(ig.show_absent);
    setFormShowPercentage(ig.show_percentage);
    setFormSortOrder(ig.sort_order);
    setIsCreating(false);
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormCode('');
    setFormHeaderOverride('');
    setFormShowTotal(true);
    setFormShowPresent(true);
    setFormShowAbsent(true);
    setFormShowPercentage(true);
    setFormSortOrder(indicators.length + 1);
    setIsCreating(true);
  };

  const handleToggleEnabled = async (ig: IndicatorGroup) => {
    await updateIndicator(ig.id, { enabled: !ig.enabled });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (isCreating) {
      await addIndicator({
        name: formName.trim(),
        code: formCode.trim().toUpperCase() || formName.trim().toUpperCase(),
        column_header_override: formHeaderOverride.trim() || undefined,
        enabled: true,
        show_total: formShowTotal,
        show_present: formShowPresent,
        show_absent: formShowAbsent,
        show_percentage: formShowPercentage,
        sort_order: Number(formSortOrder),
      });
    } else if (editingItem) {
      await updateIndicator(editingItem.id, {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        column_header_override: formHeaderOverride.trim() || undefined,
        show_total: formShowTotal,
        show_present: formShowPresent,
        show_absent: formShowAbsent,
        show_percentage: formShowPercentage,
        sort_order: Number(formSortOrder),
      });
    }

    setIsCreating(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">
      <SettingsNavTabs currentPath="/settings/indicators" />

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            QUẢN LÝ NHÓM CHỈ TIÊU BÁO CÁO
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cấu hình linh hoạt: Toàn trường, Bán trú, Nội trú hoặc bổ sung chỉ tiêu mới không cần sửa mã nguồn
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm nhóm chỉ tiêu</span>
        </button>
      </div>

      {/* Indicators List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {indicators.map((ig) => (
          <div
            key={ig.id}
            className={`bg-white rounded-2xl p-5 border transition-all ${
              ig.enabled ? 'border-slate-200 shadow-xs' : 'border-slate-200 bg-slate-50/60 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                  ig.enabled ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-500'
                }`}>
                  #{ig.sort_order}
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">{ig.name}</h3>
                  <span className="font-mono text-[10px] text-slate-400">Mã: {ig.code}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleEnabled(ig)}
                className={`p-1 rounded-lg transition-colors ${
                  ig.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
                }`}
                title={ig.enabled ? 'Đang bật - Nhấn để tắt' : 'Đang tắt - Nhấn để bật'}
              >
                {ig.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Tiêu đề cột báo cáo:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {ig.column_header_override || ig.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cột hiển thị:</span>
                <span className="font-semibold text-slate-800">
                  {[
                    ig.show_total && 'Tổng',
                    ig.show_present && 'Có mặt',
                    ig.show_absent && 'Vắng',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tính tỷ lệ %:</span>
                <span className="font-semibold text-slate-800">{ig.show_percentage ? 'Có' : 'Không'}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                ig.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {ig.enabled ? 'Đang áp dụng' : 'Đã tạm tắt'}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(ig)}
                  className="p-1 text-slate-500 hover:text-blue-600 rounded"
                  title="Chỉnh sửa"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {ig.code !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc chắn muốn xóa nhóm chỉ tiêu "${ig.name}"?`)) {
                        deleteIndicator(ig.id);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal edit/create */}
      {(isCreating || editingItem) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-base">
                {isCreating ? 'THÊM NHÓM CHỈ TIÊU MỚI' : `SỬA CHỈ TIÊU: ${editingItem?.name}`}
              </h3>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingItem(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tên nhóm chỉ tiêu (Ví dụ: Học sinh bán trú)
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Học sinh bán trú"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mã hệ thống
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="BOARDING_HALF"
                    className="w-full px-3 py-2 font-mono text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tiêu đề cột trên báo cáo (Tùy chọn ghi đè)
                </label>
                <input
                  type="text"
                  value={formHeaderOverride}
                  onChange={(e) => setFormHeaderOverride(e.target.value)}
                  placeholder="Học sinh bán trú"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider block">
                  Tùy chọn cột & tỷ lệ
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowTotal}
                    onChange={(e) => setFormShowTotal(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Hiển thị cột "Tổng số"</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowPresent}
                    onChange={(e) => setFormShowPresent(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Hiển thị cột "Có mặt"</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowAbsent}
                    onChange={(e) => setFormShowAbsent(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Hiển thị cột "Vắng"</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowPercentage}
                    onChange={(e) => setFormShowPercentage(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Tính và hiển thị Tỷ lệ phần trăm (%)</span>
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu nhóm chỉ tiêu</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingItem(null);
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
