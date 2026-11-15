export const normalizeQuestion=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function isSchoolDataQuestion(text:string) {
  const q=normalizeQuestion(text);
  return /mat khau.*(so|com|an)|so cham com|si so|bao an|suat an|cham (an|com)|ban tru|gvcn|giao vien chu nhiem|lop nao|danh sach.*(lop|hoc sinh)|hoc sinh.*(vang|nghi|co mat)|ai.*(vang|nghi hoc)|chua.*bao|bao cao.*(hom nay|hom qua|ngay|lop)|supabase|han chot|thi dua|dong bo|hotline|tac gia|diem danh|\b\d{1,2}[a-z]\d+\b/.test(q);
}
