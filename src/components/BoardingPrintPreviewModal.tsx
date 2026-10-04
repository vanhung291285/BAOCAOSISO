import React, { useState, useRef } from 'react';
import {
  Printer,
  FileDown,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { Student, BoardingSignatureConfig, BoardingMonthSignature } from '../types';
import { exportElementToPdf, exportElementsToMultiPagePdf } from '../utils/exportBoardingPdf';

interface DayInfo {
  dayNum: number;
  dateStr: string;
  dayOfWeekShort: string;
  isSchoolMealDay: boolean;
  allowedMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
}

interface BoardingPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  classNameStr: string;
  campusName: string;
  selectedMonth: string;
  monthNum: number;
  yearNum: number;
  daysInMonth: number;
  monthDays: DayInfo[];
  students: Student[];
  mealMatrix: Record<string, Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>>;
  studentSummaries: {
    standardBreakfastDays: number;
    standardLunchDays: number;
    standardDinnerDays: number;
    summaries: Record<
      string,
      {
        eatenBreakfast: number;
        eatenLunch: number;
        eatenDinner: number;
        missedBreakfast: number;
        missedLunch: number;
        missedDinner: number;
        actualDays: number;
      }
    >;
  };
  columnTotals: {
    dailyTotals: Record<string, { breakfast: number; lunch: number; dinner: number }>;
    totalEatenB: number;
    totalEatenL: number;
    totalEatenD: number;
    totalMissedB: number;
    totalMissedL: number;
    totalMissedD: number;
    totalActualDays: number;
  };
  effectiveTeacherName: string;
  effectiveSigningDateText: string;
  sigConfig?: BoardingSignatureConfig;
  monthSig?: BoardingMonthSignature | null;
  onExportExcel?: () => void;
}

export const BoardingPrintPreviewModal: React.FC<BoardingPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  classNameStr,
  campusName,
  selectedMonth,
  monthNum,
  yearNum,
  daysInMonth,
  monthDays,
  students,
  mealMatrix,
  studentSummaries,
  columnTotals,
  effectiveTeacherName,
  effectiveSigningDateText,
  sigConfig,
  monthSig,
  onExportExcel,
}) => {
  const [activeTab, setActiveTab] = useState<'page1' | 'page2' | 'both' | 'all'>('both');
  const [zoomLevel, setZoomLevel] = useState<number>(90);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const allRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const page1Days = monthDays.slice(0, 15);
  const page2Days = monthDays.slice(15);

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      if (activeTab === 'page1' && page1Ref.current) {
        await exportElementToPdf(page1Ref.current, {
          fileName: `So_Cham_An_${classNameStr}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}_Trang_1.pdf`,
          orientation: 'landscape',
          quality: 2,
        });
      } else if (activeTab === 'page2' && page2Ref.current) {
        await exportElementToPdf(page2Ref.current, {
          fileName: `So_Cham_An_${classNameStr}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}_Trang_2.pdf`,
          orientation: 'landscape',
          quality: 2,
        });
      } else if (activeTab === 'both') {
        const elements: HTMLElement[] = [];
        if (page1Ref.current) elements.push(page1Ref.current);
        if (page2Ref.current) elements.push(page2Ref.current);
        if (elements.length === 0) {
          throw new Error('Chưa tìm thấy phần tử hiển thị để xuất PDF.');
        }
        await exportElementsToMultiPagePdf(elements, {
          fileName: `So_Cham_An_${classNameStr}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}_2_Trang.pdf`,
          orientation: 'landscape',
          quality: 2,
        });
      } else if (allRef.current) {
        await exportElementToPdf(allRef.current, {
          fileName: `So_Cham_An_${classNameStr}_Thang_${String(monthNum).padStart(2, '0')}_${yearNum}_Ca_Thang.pdf`,
          orientation: 'landscape',
          quality: 2,
        });
      }
    } catch (e) {
      console.error('Export PDF error:', e);
      alert('Không thể tạo file PDF trực tiếp trên trình duyệt này. Hệ thống sẽ mở hộp thoại In để lưu ra file PDF chuẩn chất lượng cao!');
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const renderSheetTable = (days: DayInfo[], isPage2OrAll: boolean, showSummary = false) => {
    return (
      <div className="w-full bg-white text-slate-900 select-none">
        {/* Paper Top Title */}
        <div className="flex items-start justify-between pb-2 mb-3 text-left">
          <div>
            <div className="font-extrabold text-[11px] uppercase tracking-tight">
              TRƯỜNG PTDTBT THCS XA DUNG
            </div>
            <div className="font-bold text-[10px] uppercase text-slate-800">
              PHÂN HIỆU: {campusName.toUpperCase() || 'SUỐI LƯ'}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-[13px] font-black uppercase tracking-tight text-slate-900">
              SỔ CHẤM CƠM LỚP: {classNameStr} THÁNG {monthNum}/{yearNum}
            </h2>
            <div className="text-[10px] font-bold text-blue-900 uppercase">
              {days.length <= 15
                ? days[0]?.dayNum === 1
                  ? '(TRANG 1: NỬA ĐẦU THÁNG - TỪ NGÀY 01 ĐẾN NGÀY 15)'
                  : '(TRANG 2: NỬA CUỐI THÁNG - TỪ NGÀY 16 ĐẾN CUỐI THÁNG)'
                : '(TOÀN BỘ CÁC NGÀY TRONG THÁNG)'}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <table className="w-full text-center border-collapse text-[10px] border border-black border-spacing-0">
          <thead>
            {/* Header Row 1: STT, Thứ - Ngày, Day numbers */}
            <tr className="bg-slate-100 font-bold text-slate-900 h-[26px]">
              <th rowSpan={3} className="py-0.5 px-1 w-8 border border-black text-center font-bold">
                STT
              </th>
              <th className="py-0.5 px-1.5 min-w-[140px] border border-black font-bold">
                <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-900">
                  <span>Thứ</span>
                  <span>Ngày</span>
                </div>
              </th>
              {days.map((d) => (
                <th key={d.dayNum} colSpan={3} className="py-0.5 px-0.5 border border-black font-bold text-center">
                  <span className="text-[10px] font-bold">{d.dayNum}</span>
                </th>
              ))}
              {showSummary && (
                <>
                  <th colSpan={6} className="py-0.5 px-1 border border-black bg-slate-100 font-bold text-[10px]">
                    Số ngày ăn trong tháng
                  </th>
                  <th rowSpan={3} className="py-1 px-1 w-12 border border-black bg-slate-100 font-bold text-[10px]">
                    Ngày thực
                  </th>
                </>
              )}
            </tr>

            {/* Header Row 2: Họ và tên, Day of week */}
            <tr className="bg-slate-100 font-bold text-slate-800 h-[22px]">
              <th rowSpan={2} className="py-0.5 px-1.5 min-w-[140px] text-center border border-black font-bold text-slate-900">
                Họ và tên
              </th>
              {days.map((d) => (
                <th key={d.dayNum} colSpan={3} className="py-0.5 px-0.5 border border-black font-bold text-center">
                  <span className="text-[10px] font-bold">{d.dayOfWeekShort}</span>
                </th>
              ))}
              {showSummary && (
                <>
                  <th colSpan={3} className="py-0.5 px-1 border border-black bg-slate-100 font-bold text-[9px]">
                    Số ngày báo ăn
                  </th>
                  <th colSpan={3} className="py-0.5 px-1 border border-black bg-slate-100 font-bold text-[9px]">
                    Số ngày không báo ăn
                  </th>
                </>
              )}
            </tr>

            {/* Header Row 3: S, T, T */}
            <tr className="bg-slate-100 font-bold text-slate-800 h-[20px]">
              {days.map((d) => (
                <React.Fragment key={d.dayNum}>
                  <th className="py-0.5 w-[20px] border border-black font-bold text-[9px]">S</th>
                  <th className="py-0.5 w-[20px] border border-black font-bold text-[9px]">T</th>
                  <th className="py-0.5 w-[20px] border border-black font-bold text-[9px]">T</th>
                </React.Fragment>
              ))}
              {showSummary && (
                <>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">S</th>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">T</th>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">T</th>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">S</th>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">T</th>
                  <th className="py-0.5 w-5 border border-black font-bold text-[9px]">T</th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {students.map((st, idx) => {
              const stDays = mealMatrix[st.id] || {};
              const sum = studentSummaries.summaries[st.id] || {
                eatenBreakfast: 0,
                eatenLunch: 0,
                eatenDinner: 0,
                missedBreakfast: 0,
                missedLunch: 0,
                missedDinner: 0,
                actualDays: 0,
              };

              return (
                <tr key={st.id} className="h-[22px]">
                  <td className="py-0.5 px-1 border border-black text-center font-medium text-[10px]">
                    {idx + 1}
                  </td>
                  <td className="py-0.5 px-2 border border-black text-left font-medium whitespace-nowrap text-[10px]">
                    {st.full_name}
                  </td>
                  {days.map((d) => {
                    const dMeal = stDays[d.dateStr] || { breakfast: false, lunch: false, dinner: false };
                    return (
                      <React.Fragment key={d.dayNum}>
                        <td className="py-0.5 w-[20px] border border-black text-center font-black text-[11px]">
                          {dMeal.breakfast ? '+' : ''}
                        </td>
                        <td className="py-0.5 w-[20px] border border-black text-center font-black text-[11px]">
                          {dMeal.lunch ? '+' : ''}
                        </td>
                        <td className="py-0.5 w-[20px] border border-black text-center font-black text-[11px]">
                          {dMeal.dinner ? '+' : ''}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {showSummary && (
                    <>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.eatenBreakfast}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.eatenLunch}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.eatenDinner}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.missedBreakfast}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.missedLunch}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.missedDinner}</td>
                      <td className="py-0.5 px-0.5 border border-black font-bold text-[10px]">{sum.actualDays}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Footer CỘNG */}
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-black h-[24px]">
              <td colSpan={2} className="py-1 px-2 text-center border border-black font-bold uppercase text-[10px]">
                CỘNG
              </td>
              {days.map((d) => {
                const totals = columnTotals.dailyTotals[d.dateStr] || { breakfast: 0, lunch: 0, dinner: 0 };
                return (
                  <React.Fragment key={d.dayNum}>
                    <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">
                      {totals.breakfast > 0 ? totals.breakfast : ''}
                    </td>
                    <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">
                      {totals.lunch > 0 ? totals.lunch : ''}
                    </td>
                    <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">
                      {totals.dinner > 0 ? totals.dinner : ''}
                    </td>
                  </React.Fragment>
                );
              })}
              {showSummary && (
                <>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalEatenB}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalEatenL}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalEatenD}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalMissedB}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalMissedL}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalMissedD}</td>
                  <td className="py-0.5 px-0.5 border border-black font-bold text-[9px]">{columnTotals.totalActualDays}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>

        {/* Signatures for Page 2 or All */}
        {isPage2OrAll && (
          <div className="mt-4 flex justify-end pr-8">
            <div className="flex flex-col items-center w-64 text-center">
              <div className="text-[10px] text-slate-700 italic mb-0.5">
                {`${sigConfig?.location_name?.trim() || 'Xa Dung'}, ngày ${daysInMonth} tháng ${String(monthNum).padStart(2, '0')} năm ${yearNum}`}
              </div>
              <div className="text-[11px] font-bold text-slate-900 uppercase">
                {sigConfig?.teacher_title || 'GIÁO VIÊN CHỦ NHIỆM'}
              </div>

              {/* Digital Signature Image / Badge */}
              {sigConfig?.enable_digital_signature && (monthSig?.is_signed || sigConfig?.signature_image_url || sigConfig?.stamp_image_url) ? (
                <div className="my-1 py-1 flex flex-col items-center justify-center relative min-h-[44px]">
                  {sigConfig?.signature_image_url && (
                    <img src={sigConfig.signature_image_url} alt="Chữ ký" className="h-9 object-contain" />
                  )}
                  {sigConfig?.stamp_image_url && (
                    <img src={sigConfig.stamp_image_url} alt="Con dấu" className="h-11 object-contain absolute opacity-85 pointer-events-none" />
                  )}
                  {monthSig?.is_signed && (
                    <div className="border border-emerald-600 bg-emerald-50/90 rounded px-1.5 py-0.5 text-[8px] font-bold text-emerald-800 flex items-center gap-1 shadow-2xs mt-0.5">
                      <span>✓ ĐÃ KÝ ĐIỆN TỬ</span>
                      {monthSig.certificate_hash && (
                        <span className="font-mono text-[7px] text-emerald-700">({monthSig.certificate_hash})</span>
                      )}
                    </div>
                  )}
                  {!sigConfig?.signature_image_url && !monthSig?.is_signed && (
                    <div className="text-[9px] text-slate-500 italic py-2">(Chữ ký điện tử)</div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-slate-600 italic mb-12">
                  (Ký và ghi rõ họ tên)
                </div>
              )}

              <div className="text-[11px] font-bold text-slate-900">
                {effectiveTeacherName || sigConfig?.teacher_name || 'Giáo viên chủ nhiệm'}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-xs text-slate-100 overflow-hidden select-none print:fixed print:inset-0 print:bg-white print:text-black print:overflow-visible print:z-[9999]">
      {/* Top Controls Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3 shadow-lg shrink-0 no-print">
        {/* Title & Page Switcher */}
        <div className="flex flex-wrap items-center justify-between md:justify-start gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs sm:text-base">
            <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0" />
            <span className="truncate">Xem trước bản in (Print Preview)</span>
          </div>

          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 sm:p-1 border border-slate-700 text-[11px] sm:text-xs overflow-x-auto no-scrollbar touch-pan-x">
            <button
              type="button"
              onClick={() => setActiveTab('page1')}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'page1'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Trang 1 (1-15)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('page2')}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'page2'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Trang 2 (16-{daysInMonth})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('both')}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'both'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              2 trang A4
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Cả tháng
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 sm:p-1 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(40, z - 10))}
              className="p-1 sm:p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <span className="px-1.5 sm:px-2 text-[11px] sm:text-xs font-mono font-bold text-slate-200">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="p-1 sm:p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(typeof window !== 'undefined' && window.innerWidth < 640 ? 55 : 90)}
              className="p-1 sm:p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              title="Vừa màn hình"
            >
              <Maximize className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          {/* Export PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/30 flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Tải về file PDF sắc nét đúng chuẩn khổ A4 ngang"
          >
            <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{isExportingPdf ? 'Tạo PDF...' : 'Xuất PDF'}</span>
          </button>

          {/* Direct Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer"
            title="Mở hộp thoại in trình duyệt (In máy in hoặc Lưu dưới dạng PDF)"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>In PDF</span>
          </button>

          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="hidden sm:flex px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 items-center gap-1.5 transition-all cursor-pointer"
              title="Xuất file Excel chuẩn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Excel</span>
            </button>
          )}

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-all flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Đóng</span>
          </button>
        </div>
      </div>

      {/* Main Preview Scroll Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center gap-8 bg-slate-950 print:bg-white print:p-0 print:m-0 print:overflow-visible">
        {/* Style applied based on zoom */}
        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-150 flex flex-col items-center gap-8 print:transform-none print:m-0 print:p-0 print:gap-0 print:w-full"
        >
          {activeTab === 'page1' && (
            <div
              ref={page1Ref}
              className="w-[297mm] min-h-[210mm] max-w-[1120px] bg-white p-[10mm] shadow-2xl rounded-sm border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 print:w-full print:max-w-none"
            >
              {renderSheetTable(page1Days, false, false)}
            </div>
          )}

          {activeTab === 'page2' && (
            <div
              ref={page2Ref}
              className="w-[297mm] min-h-[210mm] max-w-[1120px] bg-white p-[10mm] shadow-2xl rounded-sm border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 print:w-full print:max-w-none"
            >
              {renderSheetTable(page2Days, true, true)}
            </div>
          )}

          {activeTab === 'both' && (
            <>
              <div
                ref={page1Ref}
                className="w-[297mm] min-h-[210mm] max-w-[1120px] bg-white p-[10mm] shadow-2xl rounded-sm border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 print:w-full print:max-w-none print:break-after-page relative"
              >
                <div className="absolute top-2 right-4 text-[10px] text-slate-400 font-bold uppercase no-print">
                  Trang 1 / 2
                </div>
                {renderSheetTable(page1Days, false, false)}
              </div>

              <div
                ref={page2Ref}
                className="w-[297mm] min-h-[210mm] max-w-[1120px] bg-white p-[10mm] shadow-2xl rounded-sm border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 print:w-full print:max-w-none relative"
              >
                <div className="absolute top-2 right-4 text-[10px] text-slate-400 font-bold uppercase no-print">
                  Trang 2 / 2
                </div>
                {renderSheetTable(page2Days, true, true)}
              </div>
            </>
          )}

          {activeTab === 'all' && (
            <div
              ref={allRef}
              className="w-[420mm] min-h-[297mm] max-w-[1550px] bg-white p-[10mm] shadow-2xl rounded-sm border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 print:w-full print:max-w-none"
            >
              {renderSheetTable(monthDays, true, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
