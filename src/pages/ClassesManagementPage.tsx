import React, { useState, useMemo } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { ClassItem, Profile } from '../types';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Save,
  X,
  Search,
  Check,
  UserPlus,
  SlidersHorizontal,
  TableProperties,
  FileInput,
  ArrowUpDown,
  Sparkles,
  School,
  Phone,
  Mail,
} from 'lucide-react';

export const ClassesManagementPage: React.FC = () => {
  const { classes, campuses, activeYear, addClass, updateClass, batchUpdateClasses, createTeacherAndAssign, deleteClass, toggleLockClass } = useSchool();
  const { allUsers, currentUser, isAdmin, isBGH, reloadUsers } = useAuth();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | 'ALL'>('ALL');
  const [teacherFilter, setTeacherFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');

  // View modes: 'STANDARD' (card/table with modal) or 'INLINE_EDIT' (fast direct edit on table)
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);

  // Modal states
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // Form states for single edit/create
  const [formName, setFormName] = useState('');
  const [formGrade, setFormGrade] = useState<number>(6);
  const [formTeacherId, setFormTeacherId] = useState<string>('');
  const [formCampusId, setFormCampusId] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState<number>(1);
  const [formError, setFormError] = useState('');
  const [showQuickNewTeacherForm, setShowQuickNewTeacherForm] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');

  // States for Quick Inline Edit mode
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, { class_name: string; homeroom_teacher_id: string; grade: number }>>({});
  const [inlineSaveSuccess, setInlineSaveSuccess] = useState(false);

  // State for Bulk Import Text
  const [bulkText, setBulkText] = useState('');
  const [bulkResultMsg, setBulkResultMsg] = useState<string | null>(null);

  // Filter GVCN accounts
  const gvcnList = useMemo(() => {
    return allUsers.filter((u) => u.role === 'GVCN' || u.role === 'ADMIN' || u.role === 'BGH');
  }, [allUsers]);

  // Statistics
  const stats = useMemo(() => {
    const total = classes.length;
    const assigned = classes.filter((c) => !!c.homeroom_teacher_id).length;
    const unassigned = total - assigned;
    const locked = classes.filter((c) => !!c.is_locked).length;
    const byGrade = {
      6: classes.filter((c) => c.grade === 6).length,
      7: classes.filter((c) => c.grade === 7).length,
      8: classes.filter((c) => c.grade === 8).length,
      9: classes.filter((c) => c.grade === 9).length,
    };
    return { total, assigned, unassigned, locked, byGrade };
  }, [classes]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      // Grade filter
      if (selectedGrade !== 'ALL' && c.grade !== selectedGrade) return false;

      // Teacher assigned filter
      if (teacherFilter === 'ASSIGNED' && !c.homeroom_teacher_id) return false;
      if (teacherFilter === 'UNASSIGNED' && c.homeroom_teacher_id) return false;

      // Search query (matches class name or teacher name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const teacher = allUsers.find((u) => u.id === c.homeroom_teacher_id);
        const matchName = c.class_name.toLowerCase().includes(q);
        const matchTeacher = teacher ? teacher.full_name.toLowerCase().includes(q) : false;
        if (!matchName && !matchTeacher) return false;
      }

      return true;
    });
  }, [classes, selectedGrade, teacherFilter, searchQuery, allUsers]);

  // Initialize or reset inline edit draft
  const handleToggleInlineEdit = () => {
    if (!isQuickEditMode) {
      // Load current values into drafts
      const initial: Record<string, { class_name: string; homeroom_teacher_id: string; grade: number }> = {};
      classes.forEach((c) => {
        initial[c.id] = {
          class_name: c.class_name,
          homeroom_teacher_id: c.homeroom_teacher_id || '',
          grade: c.grade,
        };
      });
      setInlineDrafts(initial);
    }
    setIsQuickEditMode(!isQuickEditMode);
  };

  const handleInlineChange = (classId: string, field: 'class_name' | 'homeroom_teacher_id' | 'grade', value: any) => {
    setInlineDrafts((prev) => ({
      ...prev,
      [classId]: {
        ...prev[classId],
        [field]: value,
      },
    }));
  };

  const countChangedInline = useMemo(() => {
    let count = 0;
    classes.forEach((c) => {
      const draft = inlineDrafts[c.id];
      if (draft) {
        if (
          draft.class_name !== c.class_name ||
          (draft.homeroom_teacher_id || '') !== (c.homeroom_teacher_id || '') ||
          draft.grade !== c.grade
        ) {
          count++;
        }
      }
    });
    return count;
  }, [classes, inlineDrafts]);

  const handleSaveInlineChanges = async () => {
    const updates: Array<{ id: string; class_name?: string; grade?: number; homeroom_teacher_id?: string }> = [];

    classes.forEach((c) => {
      const draft = inlineDrafts[c.id];
      if (draft) {
        if (
          draft.class_name !== c.class_name ||
          (draft.homeroom_teacher_id || '') !== (c.homeroom_teacher_id || '') ||
          draft.grade !== c.grade
        ) {
          updates.push({
            id: c.id,
            class_name: draft.class_name.trim().toUpperCase(),
            grade: Number(draft.grade),
            homeroom_teacher_id: draft.homeroom_teacher_id || undefined,
          });
        }
      }
    });

    if (updates.length > 0) {
      await batchUpdateClasses(updates);
      await reloadUsers();
      setInlineSaveSuccess(true);
      setTimeout(() => {
        setInlineSaveSuccess(false);
        setIsQuickEditMode(false);
      }, 1500);
    } else {
      setIsQuickEditMode(false);
    }
  };

  // Open Edit modal
  const handleOpenEdit = (c: ClassItem) => {
    setEditingClass(c);
    setFormName(c.class_name);
    setFormGrade(c.grade);
    setFormTeacherId(c.homeroom_teacher_id || '');
    setFormCampusId(c.campus_id || '');
    setFormSortOrder(c.sort_order || 1);
    setIsCreating(false);
    setFormError('');
    setShowQuickNewTeacherForm(false);
  };

  // Open Create modal
  const handleOpenCreate = () => {
    setEditingClass(null);
    setFormName('');
    setFormGrade(selectedGrade === 'ALL' ? 6 : selectedGrade);
    setFormTeacherId('');
    setFormCampusId(campuses[0]?.id || '');
    setFormSortOrder(classes.length + 1);
    setIsCreating(true);
    setFormError('');
    setShowQuickNewTeacherForm(false);
  };

  // Handle Quick Create new Teacher inside modal
  const handleCreateNewTeacher = async () => {
    if (!newTeacherName.trim()) {
      setFormError('Vui lòng nhập họ và tên giáo viên.');
      return;
    }

    try {
      const email = newTeacherEmail.trim() || `gv_${Date.now()}@db.edu.vn`;
      const teacherId = await createTeacherAndAssign(
        {
          full_name: newTeacherName.trim(),
          email,
          phone: newTeacherPhone.trim(),
        },
        editingClass ? editingClass.id : undefined
      );

      await reloadUsers();
      setFormTeacherId(teacherId);
      setShowQuickNewTeacherForm(false);
      setNewTeacherName('');
      setNewTeacherEmail('');
      setNewTeacherPhone('');
      setFormError('');
    } catch (err) {
      setFormError('Có lỗi khi tạo tài khoản giáo viên mới.');
    }
  };

  // Save single class
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Tên lớp không được để trống.');
      return;
    }

    try {
      if (isCreating) {
        await addClass({
          school_year_id: 'year_2026_2027',
          campus_id: formCampusId || undefined,
          class_name: formName.trim().toUpperCase(),
          grade: Number(formGrade),
          homeroom_teacher_id: formTeacherId || undefined,
          sort_order: Number(formSortOrder),
          active: true,
          is_locked: false,
        });
      } else if (editingClass) {
        await updateClass(editingClass.id, {
          class_name: formName.trim().toUpperCase(),
          grade: Number(formGrade),
          homeroom_teacher_id: formTeacherId || undefined,
          campus_id: formCampusId || undefined,
          sort_order: Number(formSortOrder),
        });
      }

      await reloadUsers();
      setIsCreating(false);
      setEditingClass(null);
    } catch (err) {
      setFormError('Có lỗi xảy ra khi lưu thông tin lớp.');
    }
  };

  // Lock toggle
  const handleToggleLock = async (c: ClassItem) => {
    await toggleLockClass(c.id, !c.is_locked);
  };

  // Delete class
  const handleDelete = async (classId: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa lớp ${name}? Hành động này sẽ gỡ phân công GVCN của lớp.`)) {
      await deleteClass(classId);
      await reloadUsers();
    }
  };

  // Bulk import processor
  const handleProcessBulkImport = async () => {
    if (!bulkText.trim()) return;

    // Parse lines: e.g.
    // 6A1, Thầy Nguyễn Văn A
    // 6A2 - Cô Trần Thị B
    // 7A1: Lê Văn C
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    let updatedCount = 0;
    let createdCount = 0;

    for (const line of lines) {
      const parts = line.split(/[,;\-\t|]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      const rawClassName = parts[0].toUpperCase();
      const rawTeacherName = parts.length > 1 ? parts[1] : '';

      // Match grade from class name: 6A1 -> 6, 7A3 -> 7...
      const gradeMatch = rawClassName.match(/^(\d)/);
      const grade = gradeMatch ? parseInt(gradeMatch[1], 10) : 6;

      // Find or create teacher if name provided
      let teacherId: string | undefined = undefined;
      if (rawTeacherName) {
        const existingTeacher = allUsers.find(
          (u) => u.full_name.toLowerCase().includes(rawTeacherName.toLowerCase()) ||
                 rawTeacherName.toLowerCase().includes(u.full_name.toLowerCase())
        );
        if (existingTeacher) {
          teacherId = existingTeacher.id;
        } else {
          // Auto create teacher
          const cleanEmail = `gv_${rawClassName.toLowerCase()}@db.edu.vn`;
          teacherId = await createTeacherAndAssign({
            full_name: rawTeacherName,
            email: cleanEmail,
          });
        }
      }

      // Check if class exists
      const existingClass = classes.find((c) => c.class_name.toUpperCase() === rawClassName);
      if (existingClass) {
        await updateClass(existingClass.id, {
          grade,
          ...(teacherId ? { homeroom_teacher_id: teacherId } : {}),
        });
        updatedCount++;
      } else {
        await addClass({
          school_year_id: activeYear?.id || 'year_2026_2027',
          class_name: rawClassName,
          grade,
          homeroom_teacher_id: teacherId,
          active: true,
          is_locked: false,
          sort_order: classes.length + 1,
        });
        createdCount++;
      }
    }

    await reloadUsers();
    setBulkResultMsg(`Đã xử lý xong: Cập nhật ${updatedCount} lớp, thêm mới ${createdCount} lớp.`);
    setTimeout(() => {
      setIsBulkImportOpen(false);
      setBulkResultMsg(null);
      setBulkText('');
    }, 2000);
  };

  const canManage = isAdmin || isBGH;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                CẤU HÌNH TÊN LỚP VÀ GIÁO VIÊN CHỦ NHIỆM (GVCN)
              </h1>
              <p className="text-xs text-slate-500">
                Quản lý danh sách 28 lớp học, phân khối (6, 7, 8, 9) và phân công Giáo viên chủ nhiệm phụ trách
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Inline Edit Toggle */}
            <button
              type="button"
              onClick={handleToggleInlineEdit}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                isQuickEditMode
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <TableProperties className="w-4 h-4" />
              <span>{isQuickEditMode ? 'Thoát sửa nhanh' : 'Sửa nhanh trên bảng'}</span>
            </button>

            {/* Bulk text import */}
            <button
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              <FileInput className="w-4 h-4 text-blue-600" />
              <span>Dán danh sách nhanh</span>
            </button>

            {/* Create class */}
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm lớp mới</span>
            </button>
          </div>
        )}
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng số lớp học</div>
          <div className="text-2xl font-black text-slate-900 mt-1 flex items-baseline gap-2">
            <span>{stats.total}</span>
            <span className="text-xs font-bold text-slate-500">lớp</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
            <span>K6: <strong>{stats.byGrade[6]}</strong></span>
            <span>•</span>
            <span>K7: <strong>{stats.byGrade[7]}</strong></span>
            <span>•</span>
            <span>K8: <strong>{stats.byGrade[8]}</strong></span>
            <span>•</span>
            <span>K9: <strong>{stats.byGrade[9]}</strong></span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Đã phân công GVCN</div>
          <div className="text-2xl font-black text-emerald-600 mt-1 flex items-baseline gap-2">
            <span>{stats.assigned}</span>
            <span className="text-xs font-bold text-slate-500">/{stats.total} lớp</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.assigned / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div
          onClick={() => setTeacherFilter(stats.unassigned > 0 ? 'UNASSIGNED' : 'ALL')}
          className={`bg-white rounded-2xl p-4 border shadow-xs cursor-pointer transition-colors ${
            stats.unassigned > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Chưa phân công GVCN</div>
          <div className="text-2xl font-black text-amber-600 mt-1 flex items-baseline gap-2">
            <span>{stats.unassigned}</span>
            <span className="text-xs font-bold text-slate-500">lớp</span>
          </div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1.5 flex items-center gap-1">
            {stats.unassigned > 0 ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Nhấp để lọc lớp cần gán GVCN</span>
              </>
            ) : (
              <span className="text-emerald-600">100% lớp đã có GVCN</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trạng thái khóa nhập</div>
          <div className="text-2xl font-black text-slate-800 mt-1 flex items-baseline gap-2">
            <span>{stats.total - stats.locked}</span>
            <span className="text-xs font-bold text-slate-500">mở / {stats.locked} khóa</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">
            GVCN có thể nhập báo cáo hằng ngày
          </div>
        </div>
      </div>

      {/* Quick Edit Mode Notification Bar */}
      {isQuickEditMode && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-amber-600" />
            <div>
              <div className="text-sm font-bold text-amber-900">
                Đang bật Chế độ sửa nhanh trực tiếp trên bảng
              </div>
              <div className="text-xs text-amber-700">
                Bạn có thể sửa trực tiếp Tên lớp hoặc chọn lại Giáo viên chủ nhiệm ngay trên từng dòng.
                {countChangedInline > 0 && (
                  <span className="ml-1 font-bold text-red-600">
                    (Có {countChangedInline} lớp đã thay đổi)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {inlineSaveSuccess ? (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                <Check className="w-4 h-4" /> Đã lưu thành công!
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSaveInlineChanges}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>LƯU TẤT CẢ ({countChangedInline})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickEditMode(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300"
                >
                  Hủy bỏ
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Grade tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 6, 7, 8, 9] as const).map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedGrade === g
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {g === 'ALL'
                ? `Tất cả (${classes.length})`
                : `Khối ${g} (${classes.filter((c) => c.grade === g).length})`}
            </button>
          ))}
        </div>

        {/* Teacher filter and Search */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden"
          >
            <option value="ALL">Tất cả GVCN</option>
            <option value="ASSIGNED">Đã có GVCN ({stats.assigned})</option>
            <option value="UNASSIGNED">Chưa có GVCN ({stats.unassigned})</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tên lớp hoặc GVCN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Classes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4 w-36">Tên lớp</th>
                <th className="py-3 px-4 w-28">Khối</th>
                <th className="py-3 px-4">Giáo viên chủ nhiệm (GVCN)</th>
                <th className="py-3 px-4 w-40">Phân hiệu</th>
                <th className="py-3 px-4 text-center w-28">Trạng thái khóa</th>
                <th className="py-3 px-4 text-center w-36">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">Không tìm thấy lớp học nào phù hợp</p>
                    <p className="text-[11px] mt-1">Thử thay đổi bộ lọc khối hoặc từ khóa tìm kiếm</p>
                  </td>
                </tr>
              ) : (
                filteredClasses.map((c, idx) => {
                  const teacher = allUsers.find((u) => u.id === c.homeroom_teacher_id);
                  const campus = campuses.find((cp) => cp.id === c.campus_id);
                  const draft = inlineDrafts[c.id];

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        !c.homeroom_teacher_id ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-semibold">{idx + 1}</td>

                      {/* Class Name */}
                      <td className="py-3 px-4">
                        {isQuickEditMode && draft ? (
                          <input
                            type="text"
                            value={draft.class_name}
                            onChange={(e) => handleInlineChange(c.id, 'class_name', e.target.value.toUpperCase())}
                            className="w-24 px-2 py-1 font-black text-sm text-slate-900 border border-blue-400 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900">{c.class_name}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              K{c.grade}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Grade */}
                      <td className="py-3 px-4">
                        {isQuickEditMode && draft ? (
                          <select
                            value={draft.grade}
                            onChange={(e) => handleInlineChange(c.id, 'grade', Number(e.target.value))}
                            className="px-2 py-1 text-xs font-bold border border-blue-400 bg-white rounded-lg"
                          >
                            <option value={6}>Khối 6</option>
                            <option value={7}>Khối 7</option>
                            <option value={8}>Khối 8</option>
                            <option value={9}>Khối 9</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-700">Khối {c.grade}</span>
                        )}
                      </td>

                      {/* Homeroom Teacher */}
                      <td className="py-3 px-4">
                        {isQuickEditMode && draft ? (
                          <select
                            value={draft.homeroom_teacher_id}
                            onChange={(e) => handleInlineChange(c.id, 'homeroom_teacher_id', e.target.value)}
                            className="w-full max-w-xs px-2.5 py-1 text-xs border border-blue-400 bg-white rounded-lg font-medium"
                          >
                            <option value="">-- Chưa phân công --</option>
                            {gvcnList.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name} {u.phone ? `(${u.phone})` : `(${u.email})`}
                              </option>
                            ))}
                          </select>
                        ) : teacher ? (
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center">
                              {teacher.full_name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{teacher.full_name}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>{teacher.email}</span>
                                {teacher.phone && <span>• {teacher.phone}</span>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              Chưa phân công
                            </span>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(c)}
                                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline"
                              >
                                Phân công ngay
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Campus */}
                      <td className="py-3 px-4 text-slate-500">
                        {campus?.name || 'Phân hiệu chính'}
                      </td>

                      {/* Lock Status */}
                      <td className="py-3 px-4 text-center">
                        {c.is_locked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                            <Lock className="w-3 h-3" /> Đã khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <Unlock className="w-3 h-3" /> Mở nhập
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg hover:bg-slate-100"
                            title="Chỉnh sửa chi tiết"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleLock(c)}
                                className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                                  c.is_locked
                                    ? 'text-red-600 hover:text-emerald-600'
                                    : 'text-slate-400 hover:text-amber-600'
                                }`}
                                title={c.is_locked ? 'Mở khóa nhập cho lớp' : 'Khóa nhập báo cáo'}
                              >
                                {c.is_locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(c.id, c.class_name)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                title="Xóa lớp học"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit / Create Class */}
      {(isCreating || editingClass) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isCreating ? 'THÊM LỚP HỌC MỚI' : `CẤU HÌNH LỚP ${editingClass?.class_name}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Đổi tên lớp, phân khối và phân công Giáo viên chủ nhiệm
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingClass(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Class Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tên lớp (Ví dụ: 6A1, 6A9, 8C2, 9D1...)
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.toUpperCase())}
                  placeholder="6A9"
                  className="w-full px-3.5 py-2.5 text-sm font-black tracking-wide border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                />
              </div>

              {/* Grade and Sort Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Khối học
                  </label>
                  <select
                    value={formGrade}
                    onChange={(e) => setFormGrade(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:outline-hidden"
                  >
                    <option value={6}>Khối 6</option>
                    <option value={7}>Khối 7</option>
                    <option value={8}>Khối 8</option>
                    <option value={9}>Khối 9</option>
                  </select>
                </div>

              </div>

              {/* Homeroom Teacher Selector with quick create */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Giáo viên chủ nhiệm (GVCN)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickNewTeacherForm(!showQuickNewTeacherForm)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{showQuickNewTeacherForm ? 'Chọn từ danh sách' : '+ Thêm GVCN mới'}</span>
                  </button>
                </div>

                {!showQuickNewTeacherForm ? (
                  <select
                    value={formTeacherId}
                    onChange={(e) => setFormTeacherId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden"
                  >
                    <option value="">-- Chưa phân công GVCN --</option>
                    {gvcnList.map((u) => {
                      const alreadyAssigned = classes.find(
                        (c) => c.homeroom_teacher_id === u.id && c.id !== editingClass?.id
                      );
                      return (
                        <option key={u.id} value={u.id}>
                          {u.full_name} {alreadyAssigned ? `(Đang CN lớp ${alreadyAssigned.class_name})` : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  /* Quick Teacher Creation Sub-form */
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-in fade-in">
                    <div className="text-xs font-bold text-blue-900">
                      Tạo tài khoản GVCN mới cho trường
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Họ và tên giáo viên (Ví dụ: Thầy Trần Văn Nam)"
                        value={newTeacherName}
                        onChange={(e) => setNewTeacherName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-hidden"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="email"
                        placeholder="Email (Tùy chọn)"
                        value={newTeacherEmail}
                        onChange={(e) => setNewTeacherEmail(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-hidden"
                      />
                      <input
                        type="text"
                        placeholder="Số điện thoại"
                        value={newTeacherPhone}
                        onChange={(e) => setNewTeacherPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-hidden"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={handleCreateNewTeacher}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Tạo & Chọn GVCN này
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Campus */}
              {campuses.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phân hiệu trường
                  </label>
                  <select
                    value={formCampusId}
                    onChange={(e) => setFormCampusId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden"
                  >
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{isCreating ? 'Thêm lớp mới' : 'Lưu thay đổi'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingClass(null);
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

      {/* Modal Bulk Text Import */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <FileInput className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    DÁN DANH SÁCH LỚP VÀ GVCN HÀNG LOẠT
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sao chép từ Excel hoặc văn bản rồi dán vào đây để cập nhật nhanh
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mt-4">
              {bulkResultMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{bulkResultMsg}</span>
                </div>
              )}

              <div className="text-xs text-slate-600">
                Nhập mỗi dòng gồm: <code className="font-bold text-blue-700">Tên lớp, Họ tên GVCN</code> (hoặc cách nhau bằng dấu gạch ngang, dấu phẩy, tab).
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-500 border border-slate-200">
                Ví dụ:<br />
                6A1, Thầy Nguyễn Văn A<br />
                6A2, Cô Quàng Thị Lan<br />
                7A1, Thầy Lò Văn Hùng
              </div>

              <textarea
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Dán nội dung danh sách lớp và giáo viên vào đây..."
                className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleProcessBulkImport}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>XỬ LÝ VÀ LƯU DANH SÁCH</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkImportOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
