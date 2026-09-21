import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SchoolSettings, SchoolYear, Campus, ClassItem, IndicatorGroup, Student } from '../types';
import { StorageService, subscribeRealtime } from '../services/storage';

interface SchoolContextType {
  settings: SchoolSettings | null;
  years: SchoolYear[];
  activeYear: SchoolYear | null;
  campuses: Campus[];
  classes: ClassItem[];
  indicators: IndicatorGroup[];
  students: Student[];
  loading: boolean;
  refreshAll: () => Promise<void>;
  updateSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;
  updateSchoolSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;
  addClass: (cls: Omit<ClassItem, 'id' | 'created_at'>) => Promise<void>;
  updateClass: (clsOrId: ClassItem | string, partial?: Partial<ClassItem>) => Promise<void>;
  batchUpdateClasses: (updates: Array<{ id: string; class_name?: string; grade?: number; homeroom_teacher_id?: string; campus_id?: string; sort_order?: number }>) => Promise<void>;
  createTeacherAndAssign: (teacherData: { full_name: string; email: string; phone?: string }, classId?: string) => Promise<string>;
  deleteClass: (id: string) => Promise<void>;
  toggleLockClass: (id: string, lock: boolean) => Promise<void>;
  addIndicator: (ig: Omit<IndicatorGroup, 'id' | 'created_at'>) => Promise<void>;
  updateIndicator: (id: string, partial: Partial<IndicatorGroup>) => Promise<void>;
  deleteIndicator: (id: string) => Promise<void>;
  saveIndicator: (ig: IndicatorGroup) => Promise<void>;
  setActiveSchoolYear: (yearId: string) => Promise<void>;
  saveSchoolYear: (year: SchoolYear) => Promise<void>;
  deleteSchoolYear: (yearId: string) => Promise<void>;
  toggleLockSchoolYear: (yearId: string, locked: boolean) => Promise<void>;
  saveCampus: (campus: Campus) => Promise<void>;
  deleteCampus: (campusId: string) => Promise<void>;
  resetAllDataToEmpty: () => Promise<void>;
  addStudent: (student: Omit<Student, 'id' | 'created_at'>) => Promise<void>;
  updateStudent: (studentId: string, partial: Partial<Student>) => Promise<void>;
  deleteStudent: (studentId: string) => Promise<void>;
  importStudents: (students: Array<Omit<Student, 'id' | 'created_at'>>) => Promise<void>;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SchoolSettings | null>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_settings_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return null;
  });
  const [years, setYears] = useState<SchoolYear[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_years_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [activeYear, setActiveYear] = useState<SchoolYear | null>(() => {
    if (typeof window !== 'undefined') {
      try { 
        const raw = localStorage.getItem('sso_school_years_v1'); 
        if (raw) {
          const arr = JSON.parse(raw);
          return arr.find((y: any) => y.is_active) || arr[0] || null;
        }
      } catch {}
    }
    return null;
  });
  const [campuses, setCampuses] = useState<Campus[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_campuses_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [classes, setClasses] = useState<ClassItem[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_classes_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [indicators, setIndicators] = useState<IndicatorGroup[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_indicator_groups_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [students, setStudents] = useState<Student[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_students_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const cData = await StorageService.getCampuses(); // Call this first to ensure it seeds settings if necessary
      const [sData, yData, clData, iData, stData] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getSchoolYears(),
        StorageService.getClasses(),
        StorageService.getIndicatorGroups(),
        StorageService.getStudents(),
      ]);
      setSettings(sData);
      setYears(yData);
      const curYear = yData.find((y) => y.is_active) || yData[0] || null;
      setActiveYear(curYear);
      setCampuses(cData);
      setClasses(clData);
      setIndicators(iData);
      setStudents(stData);
    } catch (err) {
      console.error('Failed to load school context data:', err);
    }
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));

    // Subscribe to realtime changes - ONLY for school configuration tables, NEVER for daily_reports
    const SCHOOL_CONTEXT_TABLES = new Set([
      'school_settings',
      'school_years',
      'campuses',
      'classes',
      'indicator_groups',
      'students',
      'all_reset',
      'all'
    ]);

    let refreshTimeout: any = null;
    const unsubscribe = subscribeRealtime((event) => {
      if (event?.table && SCHOOL_CONTEXT_TABLES.has(event.table)) {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => {
          refreshAll();
        }, 350);
      }
    });

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      unsubscribe();
    };
  }, [refreshAll]);

  const updateSettings = async (newSettings: Partial<SchoolSettings>) => {
    const updated = await StorageService.updateSettings(newSettings);
    setSettings(updated);
  };

  const syncTeacherAssignment = async (classId: string, teacherId?: string) => {
    try {
      const profiles = await StorageService.getProfiles();
      for (const p of profiles) {
        if (teacherId && p.id === teacherId) {
          if (p.assigned_class_id !== classId) {
            p.assigned_class_id = classId;
            await StorageService.saveProfile(p);
          }
        } else if (p.assigned_class_id === classId && (!teacherId || p.id !== teacherId)) {
          p.assigned_class_id = undefined;
          await StorageService.saveProfile(p);
        }
      }
    } catch (e) {
      console.error('Error syncing teacher assignment:', e);
    }
  };

  const addClass = async (cls: Omit<ClassItem, 'id' | 'created_at'>) => {
    const classId = `cls_${Date.now()}_${cls.class_name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newClass: ClassItem = {
      ...cls,
      id: classId,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveClass(newClass);
    if (newClass.homeroom_teacher_id) {
      await syncTeacherAssignment(newClass.id, newClass.homeroom_teacher_id);
    }
    await refreshAll();
  };

  const updateClass = async (clsOrId: ClassItem | string, partial?: Partial<ClassItem>) => {
    let targetClass: ClassItem | undefined;
    if (typeof clsOrId === 'string') {
      const currentList = await StorageService.getClasses();
      const existing = currentList.find((c) => c.id === clsOrId);
      if (existing) {
        targetClass = { ...existing, ...(partial || {}) };
      }
    } else {
      targetClass = clsOrId;
    }

    if (targetClass) {
      await StorageService.saveClass(targetClass);
      await syncTeacherAssignment(targetClass.id, targetClass.homeroom_teacher_id);
      await refreshAll();
    }
  };

  const batchUpdateClasses = async (
    updates: Array<{ id: string; class_name?: string; grade?: number; homeroom_teacher_id?: string; campus_id?: string; sort_order?: number }>
  ) => {
    const currentList = await StorageService.getClasses();
    for (const item of updates) {
      const existing = currentList.find((c) => c.id === item.id);
      if (existing) {
        const updated: ClassItem = {
          ...existing,
          class_name: item.class_name !== undefined ? item.class_name.trim().toUpperCase() : existing.class_name,
          grade: item.grade !== undefined ? item.grade : existing.grade,
          homeroom_teacher_id: item.homeroom_teacher_id !== undefined ? (item.homeroom_teacher_id || undefined) : existing.homeroom_teacher_id,
          campus_id: item.campus_id !== undefined ? (item.campus_id || undefined) : existing.campus_id,
          sort_order: item.sort_order !== undefined ? item.sort_order : existing.sort_order,
        };
        await StorageService.saveClass(updated);
        await syncTeacherAssignment(updated.id, updated.homeroom_teacher_id);
      }
    }
    await refreshAll();
  };

  const createTeacherAndAssign = async (
    teacherData: { full_name: string; email: string; phone?: string },
    classId?: string
  ): Promise<string> => {
    const teacherId = `u_teacher_${Date.now()}`;
    const newProfile = {
      id: teacherId,
      full_name: teacherData.full_name.trim(),
      email: teacherData.email.trim().toLowerCase(),
      role: 'GVCN' as const,
      active: true,
      phone: teacherData.phone?.trim() || '',
      assigned_class_id: classId,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveProfile(newProfile);

    if (classId) {
      const currentList = await StorageService.getClasses();
      const existing = currentList.find((c) => c.id === classId);
      if (existing) {
        existing.homeroom_teacher_id = teacherId;
        await StorageService.saveClass(existing);
      }
    }

    await refreshAll();
    return teacherId;
  };

  const deleteClass = async (id: string) => {
    await StorageService.deleteClass(id);
    await syncTeacherAssignment(id, undefined);
    await refreshAll();
  };

  const toggleLockClass = async (id: string, lock: boolean) => {
    await StorageService.toggleClassLock(id, lock);
    await refreshAll();
  };

  const addIndicator = async (ig: Omit<IndicatorGroup, 'id'>) => {
    const newIg: IndicatorGroup = {
      ...ig,
      id: `ig_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveIndicatorGroup(newIg);
    await refreshAll();
  };

  const updateIndicator = async (id: string, partial: Partial<IndicatorGroup>) => {
    const list = await StorageService.getIndicatorGroups();
    const existing = list.find((i) => i.id === id);
    if (existing) {
      await StorageService.saveIndicatorGroup({ ...existing, ...partial });
      await refreshAll();
    }
  };

  const saveIndicator = async (ig: IndicatorGroup) => {
    await StorageService.saveIndicatorGroup(ig);
    await refreshAll();
  };

  const deleteIndicator = async (id: string) => {
    await StorageService.deleteIndicatorGroup(id);
    await refreshAll();
  };

  const setActiveSchoolYear = async (yearId: string) => {
    await StorageService.setActiveSchoolYear(yearId);
    await refreshAll();
  };

  const saveSchoolYear = async (year: SchoolYear) => {
    await StorageService.saveSchoolYear(year);
    await refreshAll();
  };

  const deleteSchoolYear = async (yearId: string) => {
    await StorageService.deleteSchoolYear(yearId);
    await refreshAll();
  };

  const toggleLockSchoolYear = async (yearId: string, locked: boolean) => {
    await StorageService.toggleLockSchoolYear(yearId, locked);
    await refreshAll();
  };

  const saveCampus = async (campus: Campus) => {
    await StorageService.saveCampus(campus);
    await refreshAll();
  };

  const deleteCampus = async (campusId: string) => {
    await StorageService.deleteCampus(campusId);
    await refreshAll();
  };

  const resetAllDataToEmpty = async () => {
    await StorageService.resetAllDataToEmpty();
    await refreshAll();
  };

  const addStudent = async (student: Omit<Student, 'id' | 'created_at'>) => {
    const newStudent: Student = {
      ...student,
      id: `std_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    await StorageService.saveStudent(newStudent);
    await refreshAll();
  };

  const updateStudent = async (studentId: string, partial: Partial<Student>) => {
    const list = await StorageService.getStudents();
    const existing = list.find((s) => s.id === studentId);
    if (existing) {
      const updated = { ...existing, ...partial };
      await StorageService.saveStudent(updated);
      await refreshAll();
    }
  };

  const deleteStudent = async (studentId: string) => {
    await StorageService.deleteStudent(studentId);
    await refreshAll();
  };

  const importStudents = async (newStudents: Array<Omit<Student, 'id' | 'created_at'>>) => {
    const studentsToSave: Student[] = newStudents.map((s, idx) => ({
      ...s,
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
    }));
    await StorageService.saveStudents(studentsToSave);
    await refreshAll();
  };

  return (
    <SchoolContext.Provider
      value={{
        settings,
        years,
        activeYear,
        campuses,
        classes,
        indicators,
        students,
        loading,
        refreshAll,
        updateSettings,
        updateSchoolSettings: updateSettings,
        addClass,
        updateClass,
        batchUpdateClasses,
        createTeacherAndAssign,
        deleteClass,
        toggleLockClass,
        addIndicator,
        updateIndicator,
        saveIndicator,
        deleteIndicator,
        setActiveSchoolYear,
        saveSchoolYear,
        deleteSchoolYear,
        toggleLockSchoolYear,
        saveCampus,
        deleteCampus,
        resetAllDataToEmpty,
        addStudent,
        updateStudent,
        deleteStudent,
        importStudents,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};
