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
