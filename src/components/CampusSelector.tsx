import React from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { MapPin, School } from 'lucide-react';

interface CampusSelectorProps {
  selectedCampusId: string;
  onChange: (campusId: string) => void;
  className?: string;
}

export const CampusSelector: React.FC<CampusSelectorProps> = ({
  selectedCampusId,
  onChange,
  className = '',
}) => {
  const { settings, campuses } = useSchool();

  if (!settings?.enable_campuses || campuses.length === 0) {
    return null;
  }

  const activeCampuses = campuses.filter((c) => c.active);
  if (activeCampuses.length === 0) return null;

  const getCampusColor = (index: number) => {
    const activeColors = [
      'bg-indigo-600 text-white shadow-md',
      'bg-fuchsia-600 text-white shadow-md',
      'bg-teal-600 text-white shadow-md',
      'bg-orange-600 text-white shadow-md',
      'bg-pink-600 text-white shadow-md',
    ];
    return activeColors[index % activeColors.length];
  };

  return (
    <div className={`flex items-center bg-slate-100 p-1.5 rounded-xl overflow-x-auto hide-scrollbar border border-slate-200 shadow-inner ${className}`}>
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all duration-200 ${
          selectedCampusId === 'all'
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
        }`}
      >
        <School className="w-3.5 h-3.5" />
        Toàn trường
      </button>
      {activeCampuses.map((campus, idx) => (
        <button
          key={campus.id}
          type="button"
          onClick={() => onChange(campus.id)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all duration-200 ${
            selectedCampusId === campus.id
              ? getCampusColor(idx)
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          {campus.name}
        </button>
      ))}
    </div>
  );
};
