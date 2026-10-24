/**
 * Tiện ích suy luận và chuẩn hóa thông tin học sinh
 */

/**
 * Tự động nhận diện giới tính học sinh từ họ và tên
 * (Đặc biệt tối ưu hóa cho tên học sinh dân tộc thiểu số và tên phổ thông)
 */
export function inferGenderFromName(fullName?: string): 'Nam' | 'Nữ' | '' {
  if (!fullName) return '';
  const clean = fullName.trim().toLowerCase();
  if (!clean) return '';

  const words = clean.split(/\s+/);
  if (words.length === 0) return '';

  // 1. Dấu hiệu chắc chắn là NỮ: chứa từ đệm "thị" / "thi"
  if (
    words.includes('thị') ||
    words.includes('thi') ||
    clean.includes(' thị ') ||
    clean.includes(' thi ') ||
    clean.endsWith(' thị') ||
    clean.endsWith(' thi')
  ) {
    return 'Nữ';
  }

  // 2. Dấu hiệu chắc chắn là NAM: chứa từ đệm "văn", "a" (đặc trưng người Mông: Vàng A..., Giàng A..., Thào A...)
  if (words.includes('văn') || words.includes('van') || words.includes('a')) {
    return 'Nam';
  }

  // 3. Các tên / từ đệm đặc trưng của Nữ (đồng bào Mông, Thái, Kinh...)
  const femaleNames = new Set([
    'dếnh', 'dùa', 'mỷ', 'mỹ', 'lan', 'hoa', 'mai', 'hương', 'hường', 'linh', 
    'nga', 'thảo', 'trang', 'hà', 'ngọc', 'huyền', 'phương', 'nhi', 'oanh', 'thu', 
    'châu', 'cúc', 'đào', 'diệp', 'dung', 'duyên', 'giang', 'hằng', 'hạnh', 'hiền', 
    'yến', 'liên', 'loan', 'ly', 'mơ', 'ngân', 'nhung', 'nhâm', 'quỳnh', 'sen', 
    'tuyết', 'thắm', 'thủy', 'tiên', 'trâm', 'vân', 'xuyến', 'pang', 'bầu', 'cú', 'song',
    'mua', 'nụ', 'bích', 'diễm', 'trang', 'mộc'
  ]);

  const lastWord = words[words.length - 1];
  if (femaleNames.has(lastWord)) {
    return 'Nữ';
  }

  // 4. Các tên / từ đệm đặc trưng của Nam
  const maleNames = new Set([
    'dính', 'đăng', 'chứ', 'vừ', 'tráng', 'sùng', 'thào', 'lầu', 'lý',
    'hùng', 'cường', 'dũng', 'nam', 'tuấn', 'long', 'đức', 'minh', 'hoàng',
    'quân', 'khánh', 'sơn', 'tùng', 'bách', 'kiên', 'hiếu', 'phúc', 'thành',
    'đạt', 'bình', 'việt', 'toàn', 'thắng', 'trọng', 'vinh', 'khoa', 'duy',
    'huy', 'an', 'bảo', 'lâm', 'thái', 'phong', 'thịnh', 'nghĩa', 'trí',
    'hưng', 'nhật', 'trường', 'quang', 'tiến', 'hải', 'hải đăng'
  ]);

  if (maleNames.has(lastWord)) {
    return 'Nam';
  }

  return '';
}

/**
 * Lấy giới tính chuẩn xác của học sinh:
 * Ưu tiên giá trị đã lưu, nếu để trống tự động suy luận từ họ tên, mặc định là Nam
 */
export function resolveStudentGender(gender?: string, fullName?: string): 'Nam' | 'Nữ' {
  if (gender === 'Nữ' || gender === 'Nam') {
    return gender;
  }
  const inferred = inferGenderFromName(fullName);
  if (inferred === 'Nữ' || inferred === 'Nam') {
    return inferred;
  }
  return 'Nam';
}

/**
 * Kiểm tra xem chuỗi địa chỉ / bản thôn có hợp lệ hay không.
 * Tự động loại bỏ các giá trị nhầm lẫn từ cột Bán trú hoặc đánh dấu như "Có", "Không", "x", "1", "-" v.v.
 */
export function isValidStudentAddress(addr?: string | null): boolean {
  if (!addr) return false;
  const trimmed = addr.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return false;

  const noAcc = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const invalidTokens = new Set([
    'co', 'khong', 'x', 'k', 'true', 'false', '1', '0', 'dung', 'sai',
    'cophep', 'khongphep', 'bantru', 'ngoaitru', 'bt', 'hsbt', 'yes', 'no'
  ]);

  if (invalidTokens.has(noAcc)) return false;
  return true;
}

/**
 * Chuẩn hóa địa chỉ học sinh:
 * Nếu là giá trị rác như "Có", "Không", "x" -> trả về rỗng '' để ô mặc định để trống cho GVCN gõ địa chỉ.
 */
export function cleanStudentAddress(addr?: string | null): string {
  if (!isValidStudentAddress(addr)) return '';
  return addr!.trim();
}

/**
 * So khớp học sinh thuộc lớp với độ chịu lỗi cao (chấp nhận "6A", "c_6a", "Lớp 6A", "6a", ...)
 */
export function isStudentInClass(
  studentClassId: string | undefined | null,
  targetClassId: string | undefined | null,
  targetClassName?: string | undefined | null
): boolean {
  if (!studentClassId || !targetClassId) return false;
  
  const s = String(studentClassId).trim().toLowerCase();
  
  // Normalize class name for comparison
  const normalize = (val: string) => {
    return String(val)
      .trim()
      .toLowerCase()
      .replace(/^c_/, '')
      .replace(/^lớp\s*/i, '');
  };

  const sNorm = normalize(s);
  const targets = [targetClassId, targetClassName].filter(Boolean) as string[];
  
  for (const t of targets) {
    const tNorm = normalize(t);
    // Exact match after normalization or if the target matches the raw class ID
    if (s === tNorm || sNorm === tNorm || s === String(t).trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Danh sách 35 tên học sinh mẫu tự sinh ban đầu (đặc thù Xa Dung)
 */
export const DEFAULT_BOARDING_STUDENTS_SEED_NAMES = new Set<string>([
  'vừ a lềnh', 'sùng thị mỷ', 'mùa a tủa', 'giàng a chống', 'thào thị dợ',
  'hờ a cháng', 'cứ thị dế', 'lầu a lầu', 'vừ thị sinh', 'mùa thị pa',
  'giàng thị hoa', 'sùng a dơ', 'thào a lử', 'hờ thị dở', 'cứ a sùng',
  'lầu thị mai', 'vừ a tủa', 'sùng thị dua', 'mùa a súa', 'giàng a vừ',
  'thào thị sua', 'hờ a tủa', 'cứ thị mỷ', 'lầu a chống', 'lý a lềnh',
  'khang thị dợ', 'lò văn inh', 'quàng thị lan', 'cà văn bun', 'tòng thị duyên',
  'vừ a cháng', 'sùng thị chi', 'mùa thị say', 'giàng a tế', 'thào a phềnh'
]);

/**
 * Nhận diện học sinh mẫu tự sinh ra đời cũ (để dọn dẹp theo yêu cầu, TUYỆT ĐỐI KHÔNG ẢNH HƯỞNG học sinh do GVCN upload/nhập tay)
 */
export function isAutoGeneratedSeedStudent(s: {
  id?: string;
  student_code?: string;
  full_name?: string;
}): boolean {
  if (!s) return false;
  const sId = String(s.id || '').trim();

  // 1. Nếu ID có định dạng timestamp (std_17..., std_18..., std_19..., std_2...) -> CHẮC CHẮN 100% LÀ HỌC SINH THỰC DO GVCN UPLOAD/THÊM TAY
  if (/^std_1[6-9]\d{10,}/.test(sId) || /^std_2\d{11,}/.test(sId)) {
    return false;
  }

  // 2. Chỉ nhận diện ID mẫu tự sinh đời cũ: std_seed_..., seed_..., hoặc std_6A_01 đến std_6A_35 (với tên lớp ngắn <= 6 ký tự và số đuôi 1-2 chữ số)
  if (sId.startsWith('std_seed_') || sId.startsWith('seed_')) {
    return true;
  }

  // Khớp chính xác ID sinh tự động dạng `std_${class}_${index}` (ví dụ std_6A_01, std_c6a_15)
  // Lưu ý: Tên lớp trong seed cũ chỉ có 1-6 ký tự (6A, 6B, c6a...), không phải chuỗi timestamp dài
  const isOldSeedId = /^std_[a-zA-Z0-9]{1,6}_\d{1,2}$/i.test(sId);
  if (isOldSeedId) {
    return true;
  }

  return false;
}

/**
 * Chuẩn hóa mã lớp / tên lớp để so sánh chịu lỗi (bỏ tiền tố c_, cls_, lớp, chuyển chữ thường)
 */
export function normalizeClassKey(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/^c_/, '')
    .replace(/^cls_/, '')
    .replace(/^lớp\s*/i, '');
}

/**
 * Kiểm tra xem một báo cáo hoặc classId có tương ứng với lớp học hay không
 * Chấp nhận mọi biến thể ID: "6A1", "c_6a1", "cls_6a1", "Lớp 6A1", UUID, v.v.
 */
export function matchClassReport(
  reportOrClassId: any,
  classItemOrId: any,
  className?: string | null
): boolean {
  if (!reportOrClassId || !classItemOrId) return false;

  const rawR = typeof reportOrClassId === 'object' ? (reportOrClassId.class_id || reportOrClassId.id) : reportOrClassId;
  const rawCId = typeof classItemOrId === 'object' ? classItemOrId.id : classItemOrId;
  const rawCName = typeof classItemOrId === 'object' ? classItemOrId.class_name : (className || '');
  const rawCCode = typeof classItemOrId === 'object' ? (classItemOrId as any).code : '';

  if (!rawR || !rawCId) return false;

  const rStr = String(rawR).trim().toLowerCase();
  const cIdStr = String(rawCId).trim().toLowerCase();
  const cNameStr = String(rawCName).trim().toLowerCase();
  const cCodeStr = String(rawCCode || '').trim().toLowerCase();

  // 1. Khớp chính xác (không phân biệt hoa thường)
  if (rStr === cIdStr || rStr === cNameStr || (cCodeStr && rStr === cCodeStr)) {
    return true;
  }

  // 2. Khớp sau khi chuẩn hóa tiền tố c_, cls_, lớp
  const normR = normalizeClassKey(rStr);
  const normCId = normalizeClassKey(cIdStr);
  const normCName = normalizeClassKey(cNameStr);
  const normCCode = normalizeClassKey(cCodeStr);

  if (normR && (normR === normCId || normR === normCName || (normCCode && normR === normCCode))) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem học sinh có thuộc diện Bán trú hay không.
 * Tương thích linh hoạt với cả camelCase (isBoarding) và snake_case (is_boarding),
 * và các dạng dữ liệu boolean, number (1/0), hay string ("true"/"1"/"có"/"bán trú"/"bt").
 */
export function isStudentBoarding(s?: any): boolean {
  if (!s) return false;
  const val = s.isBoarding ?? s.is_boarding ?? s.boarding;
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return (
      trimmed === 'true' ||
      trimmed === '1' ||
      trimmed === 'có' ||
      trimmed === 'co' ||
      trimmed === 'bán trú' ||
      trimmed === 'ban tru' ||
      trimmed === 'bt'
    );
  }
  return false;
}




