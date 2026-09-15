import React from 'react';
import { School, Layers, FileSpreadsheet, Database, MapPin } from 'lucide-react';

interface SettingsNavTabsProps {
  currentPath: string;
}

export const SettingsNavTabs: React.FC<SettingsNavTabsProps> = ({ currentPath }) => {
  const tabs = [
    {
      path: '/settings/school',
      label: 'Cấu hình trường & Năm học',
      icon: School,
    },
    {
      path: '/settings/campuses',
      label: 'Phân hiệu / Điểm trường',
      icon: MapPin,
    },
    {
      path: '/settings/indicators',
      label: 'Nhóm chỉ tiêu (Bán trú / Lớp)',
      icon: Layers,
    },
    {
      path: '/settings/report-template',
      label: 'Thiết lập biểu mẫu báo cáo',
      icon: FileSpreadsheet,
    },
    {
      path: '/settings/supabase',
      label: 'Kết nối Supabase & CSDL Đám mây',
      icon: Database,
    },
  ];

  const handleNav = (path: string) => {
    window.location.hash = path;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs mb-6 overflow-x-auto no-print">
      <div className="flex items-center gap-1.5 min-w-max">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentPath === tab.path;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => handleNav(tab.path)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
