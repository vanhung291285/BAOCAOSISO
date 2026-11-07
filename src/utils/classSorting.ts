/** Sắp xếp lớp THCS theo tên: 6A1, 6A2, ..., 6A10, 7B1, ..., 9D10.
 * Không phụ thuộc vào sort_order của Supabase vì giá trị này có thể sai hoặc trùng.
 * Không thay đổi dữ liệu đầu vào hay ghi ngược lên máy chủ.
 */
export interface SchoolClassSortable {
  class_name?: string | null;
  grade?: number | string | null;
  id?: string | null;
}

const collator = new Intl.Collator('vi-VN', { numeric: true, sensitivity: 'base' });

const parseClass = (value: SchoolClassSortable) => {
  const name = String(value?.class_name || '').normalize('NFKC')
    .replace(/^\s*(?:lớp|lop)\s*/iu, '').trim().toLocaleUpperCase('vi-VN')
    .replace(/[\s_\-–—]+/g, '');
  // Khối, chữ lớp, số thứ tự: 6A2, 6A10, 7B1, 8C9, 9D10, ...
  const match = name.match(/^(\d{1,2})([A-ZÀ-Ỵ]*)(\d+)?(.*)$/u);
  const gradeFromName = match ? Number(match[1]) : NaN;
  const gradeFromField = Number(value?.grade);
  const grade = Number.isFinite(gradeFromName) ? gradeFromName
    : Number.isFinite(gradeFromField) && gradeFromField > 0 ? gradeFromField : Number.POSITIVE_INFINITY;
  return {
    grade,
    group: match?.[2] || '',
    classNumber: match?.[3] === undefined ? Number.POSITIVE_INFINITY : Number(match[3]),
    suffix: match?.[4] || '',
    name,
  };
};

export const compareSchoolClasses = (a: SchoolClassSortable, b: SchoolClassSortable): number => {
  const x = parseClass(a);
  const y = parseClass(b);
  if (x.grade !== y.grade) return x.grade - y.grade;
  const groupOrder = collator.compare(x.group, y.group);
  if (groupOrder) return groupOrder;
  if (x.classNumber !== y.classNumber) return x.classNumber - y.classNumber;
  const suffixOrder = collator.compare(x.suffix, y.suffix);
  if (suffixOrder) return suffixOrder;
  const nameOrder = collator.compare(x.name, y.name);
  if (nameOrder) return nameOrder;
  return collator.compare(String(a.id || ''), String(b.id || ''));
};
