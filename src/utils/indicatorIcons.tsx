import React from 'react';
import {
  Users,
  Utensils,
  Home,
  Bed,
  Backpack,
  GraduationCap,
  Layers,
  LucideIcon,
} from 'lucide-react';
import { IndicatorGroup } from '../types';

export interface IndicatorMeta {
  Icon: LucideIcon;
  badgeClass: string;
  cardBorderClass?: string;
  description: string;
  typeKey: 'home' | 'utensils' | 'users' | 'bed' | 'backpack' | 'graduation-cap' | 'default';
  isNgoaiTru: boolean;
  isBoarding: boolean;
}

export const INDICATOR_ICON_OPTIONS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
  desc: string;
  colorClass: string;
}> = [
  {
    id: 'home',
    label: 'Ngôi nhà (HS ngoại trú không ăn bán trú)',
    shortLabel: 'Ngoại trú',
    Icon: Home,
    desc: 'Học sinh ngoại trú, không ăn bán trú tại trường',
    colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'utensils',
    label: 'Dao thìa nĩa (HS bán trú ăn cơm)',
    shortLabel: 'Bán trú / Ăn cơm',
    Icon: Utensils,
    desc: 'Học sinh bán trú, phục vụ ăn uống trưa tại trường',
    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'users',
    label: 'Nhóm học sinh (Toàn trường / Cả lớp)',
    shortLabel: 'Sĩ số chung / Lớp',
    Icon: Users,
    desc: 'Tổng số sĩ số học sinh hiện diện và vắng mặt của toàn lớp',
    colorClass: 'bg-blue-600 text-white border-blue-600',
  },
  {
    id: 'bed',
    label: 'Giường ngủ (HS nội trú ở lại trường)',
    shortLabel: 'Nội trú / Ký túc',
    Icon: Bed,
    desc: 'Học sinh nội trú ăn ở sinh hoạt tại ký túc xá nhà trường',
    colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    id: 'backpack',
    label: 'Cặp sách (Học sinh đi về hàng ngày)',
    shortLabel: 'Cặp sách / Đi về',
    Icon: Backpack,
    desc: 'Học sinh đi học và về trong ngày',
    colorClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    id: 'graduation-cap',
    label: 'Mũ cử nhân (Chuyên cần / Học tập)',
    shortLabel: 'Chuyên cần',
    Icon: GraduationCap,
    desc: 'Theo dõi chỉ tiêu chuyên cần, thi đua nề nếp',
    colorClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

/**
 * Phân tích và trả về Icon, Badge màu và Mô tả phù hợp cho từng nhóm chỉ tiêu
 * Đảm bảo:
 * - "HS ngoại trú không ăn" / "Ngoại trú" -> Biểu tượng Ngôi nhà (Home)
 * - "Học sinh bán trú" -> Biểu tượng Dao thìa nĩa (Utensils)
 * - "Chỉ tiêu chính" / "Toàn trường" -> Biểu tượng Nhóm học sinh (Users)
 */
export function getIndicatorMeta(indicator: IndicatorGroup, isPrimary: boolean): IndicatorMeta {
  const customIcon = indicator.icon?.toLowerCase();

  // 1. Kiểm tra nếu có gán icon cụ thể
  if (customIcon === 'home') {
    return {
      Icon: Home,
      badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
      description: 'Theo dõi sĩ số học sinh ngoại trú (không ăn bán trú tại trường)',
      typeKey: 'home',
      isNgoaiTru: true,
      isBoarding: false,
    };
  }
  if (customIcon === 'utensils') {
    return {
      Icon: Utensils,
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      description: 'Theo dõi sĩ số phục vụ ăn uống bán trú hằng ngày tại trường',
      typeKey: 'utensils',
      isNgoaiTru: false,
      isBoarding: true,
    };
  }
  if (customIcon === 'bed') {
    return {
      Icon: Bed,
      badgeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      description: 'Theo dõi sĩ số học sinh nội trú ở lại ký túc xá trường',
      typeKey: 'bed',
      isNgoaiTru: false,
      isBoarding: true,
    };
  }
  if (customIcon === 'backpack') {
    return {
      Icon: Backpack,
      badgeClass: 'bg-teal-50 text-teal-700 border border-teal-200',
      description: 'Theo dõi sĩ số học sinh đi về hằng ngày',
      typeKey: 'backpack',
      isNgoaiTru: true,
      isBoarding: false,
    };
  }
  if (customIcon === 'graduation-cap') {
    return {
      Icon: GraduationCap,
      badgeClass: 'bg-purple-50 text-purple-700 border border-purple-200',
      description: 'Theo dõi chuyên cần và nề nếp học tập',
      typeKey: 'graduation-cap',
      isNgoaiTru: false,
      isBoarding: false,
    };
  }
  if (customIcon === 'users') {
    return {
      Icon: Users,
      badgeClass: 'bg-blue-600 text-white shadow-xs',
      description: 'Tổng sĩ số học sinh hiện diện và vắng mặt của toàn lớp',
      typeKey: 'users',
      isNgoaiTru: false,
      isBoarding: false,
    };
  }

  // 2. Nhận diện tự động thông minh dựa trên tên & mã chỉ tiêu
  const text = `${indicator.name} ${indicator.code} ${indicator.column_header_override || ''}`.toLowerCase();

  // Nhận diện HS ngoại trú / không ăn
  const isNgoaiTruMatch =
    text.includes('ngoại trú') ||
    text.includes('ngoai tru') ||
    text.includes('không ăn') ||
    text.includes('khong an') ||
    text.includes('về nhà') ||
    text.includes('ve nha') ||
    text.includes('non_boarding') ||
    text.includes('day_student');

  if (isNgoaiTruMatch) {
    return {
      Icon: Home,
      badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
      description: 'Theo dõi sĩ số học sinh ngoại trú (không ăn bán trú tại trường)',
      typeKey: 'home',
      isNgoaiTru: true,
      isBoarding: false,
    };
  }

  // Nhận diện Học sinh nội trú
  const isNoiTruMatch =
    text.includes('nội trú') ||
    text.includes('noi tru') ||
    text.includes('ký túc') ||
    text.includes('ky tuc') ||
    text.includes('ở lại') ||
    text.includes('dorm') ||
    indicator.code === 'BOARDING_FULL';

  if (isNoiTruMatch) {
    return {
      Icon: Bed,
      badgeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      description: 'Theo dõi sĩ số học sinh nội trú ở lại ký túc xá trường',
      typeKey: 'bed',
      isNgoaiTru: false,
      isBoarding: true,
    };
  }

  // Nhận diện Học sinh bán trú (báo ăn)
  const isBanTruMatch =
    text.includes('bán trú') ||
    text.includes('ban tru') ||
    text.includes('báo ăn') ||
    text.includes('bao an') ||
    text.includes('ăn trưa') ||
    text.includes('meal') ||
    indicator.code === 'BOARDING_HALF';

  if (isBanTruMatch) {
    return {
      Icon: Utensils,
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      description: 'Theo dõi sĩ số phục vụ ăn uống bán trú hằng ngày tại trường',
      typeKey: 'utensils',
      isNgoaiTru: false,
      isBoarding: true,
    };
  }

  // Nhận diện Chỉ tiêu chính / Toàn trường / Học sinh của lớp
  if (isPrimary || indicator.code === 'ALL' || text.includes('toàn trường') || text.includes('của lớp')) {
    return {
      Icon: Users,
      badgeClass: 'bg-blue-600 text-white shadow-xs',
      description: 'Tổng sĩ số học sinh hiện diện và vắng mặt của toàn lớp',
      typeKey: 'users',
      isNgoaiTru: false,
      isBoarding: false,
    };
  }

  // Mặc định
  return {
    Icon: Layers,
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
    description: 'Theo dõi sĩ số học sinh theo cấu hình chỉ tiêu',
    typeKey: 'default',
    isNgoaiTru: false,
    isBoarding: false,
  };
}
