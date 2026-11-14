export const DEFAULT_CLASS_TEACHER_MAP: Record<string, string> = {
  // Khối 6
  '6A1': 'Nguyễn Văn An',
  '6A2': 'Trần Thị Mai',
  '6A3': 'Lê Văn Bình',
  '6A4': 'Phạm Thị Hằng',
  '6A5': 'Hoàng Văn Cường',
  '6A6': 'Vũ Thị Dung',
  '6A7': 'Đỗ Văn Giang',
  '6A8': 'Bùi Thị Lan',
  '6A9': 'Nguyễn Thị Hoa',
  '6A10': 'Vũ Thị Ngoan',
  '6A11': 'Lò Thị Thắm',
  '6A12': 'Lò Văn Hặc',

  // Khối 7
  '7B1': 'Đặng Văn Khoa',
  '7B2': 'Nguyễn Thị Linh',
  '7B3': 'Trần Văn Minh',
  '7B4': 'Lê Thị Nga',
  '7B5': 'Phạm Văn Phúc',
  '7B6': 'Hoàng Thị Quỳnh',
  '7B7': 'Vũ Văn Sơn',
  '7B8': 'Đỗ Thị Thảo',
  '7B9': 'Nguyễn Thúy Ngọc',
  '7B10': 'Lò Đức Long',
  '7B11': 'Lê Thị Ngọc Lan',

  // Khối 8
  '8C1': 'Bùi Văn Tuấn',
  '8C2': 'Nguyễn Thị Uyên',
  '8C3': 'Trần Văn Việt',
  '8C4': 'Lê Thị Xuân',
  '8C5': 'Phạm Văn Yên',
  '8C6': 'Hoàng Thị Ánh',
  '8C7': 'Vũ Văn Bắc',
  '8C8': 'Hoàng Bá Huấn',
  '8C9': 'Đào Thị Thùy Linh',
  '8C10': 'Nguyễn Thành Trung',

  // Khối 9
  '9D1': 'Đỗ Thị Chi',
  '9D2': 'Bùi Văn Dũng',
  '9D3': 'Nguyễn Thị Em',
  '9D4': 'Trần Văn Phong',
  '9D5': 'Lê Thị Giang',
  '9D6': 'Phạm Văn Hải',
  '9D7': 'Hoàng Thị Kim',
  '9D8': 'Vũ Văn Hùng',
  '9D9': 'Hồ Ngọc Thiết',
  '9D10': 'Lò Văn Thiện',
};

// Legacy map above is retained only for initial sample setup. Reports must use
// a configured teacher name rather than guessing a name from the class code.
export function resolveTeacherName(_className?: string, teacherOrName?: string | {full_name?:string} | null, fallback?:string):string {
  const valid=(value?:string)=>{
    const name=(value??'').trim();
    return name && !/^(GVCN|u_|teacher_|cls_|c_|usr_)/i.test(name) && name!=='-' && name.toLowerCase()!=='chưa phân công' ? name : '';
  };
  return valid(typeof teacherOrName==='string'?teacherOrName:teacherOrName?.full_name) || valid(fallback) || 'Chưa phân công';
}
