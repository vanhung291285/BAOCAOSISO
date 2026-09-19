import React, { useState, useEffect } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { InputCalculationMode } from '../types';
import { SettingsNavTabs } from '../components/SettingsNavTabs';
import { FileSpreadsheet, Save, CheckCircle, Calculator, Sliders, Code2 } from 'lucide-react';

export const SettingsReportTemplatePage: React.FC = () => {
  const { settings, updateSchoolSettings } = useSchool();
  const [reportTitle, setReportTitle] = useState(settings?.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH');
  const [inputMode, setInputMode] = useState<InputCalculationMode>(settings?.input_mode || 'MODE_1_TOTAL_PRESENT');
  const [footerText, setFooterText] = useState(settings?.footer_text || 'Số liệu được tổng hợp tự động từ phần mềm báo cáo sĩ số hàng ngày.');
  const [developerName, setDeveloperName] = useState(settings?.developer_name || 'Nguyễn Hùng');
  const [developerContact, setDeveloperContact] = useState(settings?.developer_contact || 'hungthcsnongu@gmail.com');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setReportTitle(settings.report_title || 'BÁO CÁO SĨ SỐ HỌC SINH');
      setInputMode(settings.input_mode || 'MODE_1_TOTAL_PRESENT');
      setFooterText(settings.footer_text || 'Số liệu được tổng hợp tự động từ phần mềm báo cáo sĩ số hàng ngày.');
      setDeveloperName(settings.developer_name || 'Nguyễn Hùng');
      setDeveloperContact(settings.developer_contact || 'hungthcsnongu@gmail.com');
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSchoolSettings({
      report_title: reportTitle,
      input_mode: inputMode,
      footer_text: footerText,
      developer_name: developerName,
      developer_contact: developerContact,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <SettingsNavTabs currentPath="/settings/report-template" />

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            THIẾT LẬP BIỂU MẪU & CÔNG THỨC TÍNH
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tùy biến tiêu đề báo cáo in ấn và cơ chế nhập liệu dành cho Giáo viên chủ nhiệm
          </p>
        </div>

        {savedSuccess && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Đã lưu thành công!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        {/* Input Mode Selector */}
        <div>
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4" /> 1. CƠ CHẾ TÍNH TOÁN KHI GVCN NHẬP SĨ SỐ
          </h2>

          <div className="grid grid-cols-1 gap-3">
            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                inputMode === 'MODE_1_TOTAL_PRESENT'
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="calcMode"
                value="MODE_1_TOTAL_PRESENT"
                checked={inputMode === 'MODE_1_TOTAL_PRESENT'}
                onChange={() => setInputMode('MODE_1_TOTAL_PRESENT')}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-sm text-slate-900">
                  Chế độ 1: Nhập Tổng số + Có mặt (Khuyên dùng)
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Hệ thống tự động tính <span className="font-bold text-red-600">Vắng = Tổng số - Có mặt</span>. Tránh sai sót và giảm thao tác nhập cho GVCN.
                </div>
              </div>
            </label>

            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                inputMode === 'MODE_2_TOTAL_ABSENT'
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="calcMode"
                value="MODE_2_TOTAL_ABSENT"
                checked={inputMode === 'MODE_2_TOTAL_ABSENT'}
                onChange={() => setInputMode('MODE_2_TOTAL_ABSENT')}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-sm text-slate-900">
                  Chế độ 2: Nhập Tổng số + Vắng
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Hệ thống tự động tính <span className="font-bold text-emerald-700">Có mặt = Tổng số - Vắng</span>. Phù hợp khi lớp ít học sinh vắng.
                </div>
              </div>
            </label>

            <label
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                inputMode === 'MODE_3_STRICT_ALL'
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="calcMode"
                value="MODE_3_STRICT_ALL"
                checked={inputMode === 'MODE_3_STRICT_ALL'}
                onChange={() => setInputMode('MODE_3_STRICT_ALL')}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-sm text-slate-900">
                  Chế độ 3: Nhập cả 3 số (Kiểm tra nghiêm ngặt)
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  GVCN nhập cả Tổng số, Có mặt và Vắng. Hệ thống kiểm tra chặt chẽ điều kiện: <span className="font-bold text-blue-700">Có mặt + Vắng = Tổng số</span>. Nếu sai sẽ không cho lưu.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Report Title & Subtitle */}
        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> 2. TIÊU ĐỀ VÀ GHI CHÚ CHÂN TRANG BÁO CÁO IN
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tiêu đề chính trên báo cáo (Viết hoa)
              </label>
              <input
                type="text"
                required
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ví dụ: "BÁO CÁO SĨ SỐ HỌC SINH" hoặc "BÁO CÁO THEO DÕI CHUYÊN CẦN HẰNG NGÀY"
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ghi chú chân trang báo cáo
              </label>
              <textarea
                rows={2}
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Developer / Application Creator Config */}
        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Code2 className="w-4 h-4" /> 3. TÊN NHÀ PHÁT TRIỂN ỨNG DỤNG (CHÂN TRANG)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tên nhà phát triển ứng dụng / Tác giả
              </label>
              <input
                type="text"
                value={developerName}
                onChange={(e) => setDeveloperName(e.target.value)}
                placeholder="Ví dụ: Thầy Nguyễn Hùng hoặc Tổ CNTT"
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Hiển thị tại thanh chân trang ứng dụng và cuối các biểu mẫu báo cáo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Thông tin liên hệ / Hỗ trợ (Tùy chọn)
              </label>
              <input
                type="text"
                value={developerContact}
                onChange={(e) => setDeveloperContact(e.target.value)}
                placeholder="Email hoặc SĐT hỗ trợ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <span className="text-slate-500 font-semibold">Xem trước chân trang:</span>
            <div className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200">
              <Code2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Phát triển bởi: <strong className="text-slate-900">{developerName || '(Chưa đặt)'}</strong></span>
              {developerContact && <span className="text-slate-500">({developerContact})</span>}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <button
            type="submit"
            className="w-full sm:w-auto px-8 py-3 rounded-xl font-black text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>LƯU CẤU HÌNH BIỂU MẪU</span>
          </button>
        </div>
      </form>
    </div>
  );
};
