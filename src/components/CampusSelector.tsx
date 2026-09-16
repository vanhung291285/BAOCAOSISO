import React from 'react';
import { useSchool } from '../contexts/SchoolContext';

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

  return (
    <div className={`flex items-center bg-slate-100 p-1 rounded-xl overflow-x-auto hide-scrollbar ${className}`}>
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
          selectedCampusId === 'all'
            ? 'bg-white text-blue-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
        }`}
      >
        Toàn trường
      </button>
      {activeCampuses.map((campus) => (
        <button
          key={campus.id}
          type="button"
          onClick={() => onChange(campus.id)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
            selectedCampusId === campus.id
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          {campus.name}
        </button>
      ))}
    </div>
  );
};
