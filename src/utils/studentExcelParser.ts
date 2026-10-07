import * as XLSX from 'xlsx';
import { Student } from '../types/index';
import { resolveStudentGender, isValidStudentAddress, cleanStudentAddress } from './studentUtils';

/**
 * Chuẩn hóa chuỗi tiếng Việt để so sánh dung sai cao:
 * - Chuẩn hóa Unicode sang NFC (chống lỗi Unicode tổ hợp NFD từ Unikey/Vietkey)
 * - Loại bỏ dấu tiếng Việt để so khớp không dấu
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .trim()
    .toLowerCase();
}

export function cleanCellText(cell: any): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).normalize('NFC').trim();
}

/**
 * Kiểm tra xem một giá trị ô có phải là dấu hiệu học sinh BÁN TRÚ không
 */
export function isPositiveBoardingValue(rawVal: any): boolean {
  if (rawVal === null || rawVal === undefined) return false;
  const str = cleanCellText(rawVal).toLowerCase();
  if (!str) return false;

  // Ký tự đánh dấu checkbox phổ biến
  if (
    str === 'x' ||
    str === '✓' ||
    str === '✔' ||
    str === 'v' ||
    str === '+' ||
    str === '1' ||
    str === 'true' ||
    str === 'yes' ||
    str === 'y'
  ) {
    return true;
  }

  const noAccents = removeVietnameseAccents(str);
  if (
    noAccents === 'co' ||
    noAccents === 'c' ||
    noAccents === 'bt' ||
    noAccents === 'hsbt' ||
    noAccents === 'ban tru' ||
    noAccents === 'noi tru' ||
    noAccents === 'b.tru' ||
    noAccents === '116' ||
    noAccents.includes('ban tru') ||
    noAccents.includes('noi tru') ||
    noAccents.includes('dan nuoi') ||
    noAccents.includes('116') ||
    noAccents.includes('o truong') ||
    noAccents.includes('an com') ||
    noAccents.includes('an trua')
  ) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem một giá trị ô có phải là dấu hiệu học sinh NGOẠI TRÚ không
 */
export function isNegativeBoardingValue(rawVal: any): boolean {
  if (rawVal === null || rawVal === undefined) return false;
  const str = cleanCellText(rawVal).toLowerCase();
  if (!str) return false;

  if (
    str === '0' ||
    str === 'false' ||
    str === 'no' ||
    str === 'k' ||
    str === 'k0' ||
    str === '-' ||
    str === 'none'
  ) {
    return true;
  }

  const noAccents = removeVietnameseAccents(str);
  if (
    noAccents === 'khong' ||
    noAccents === 'ngoai tru' ||
    noAccents === 'o nha' ||
    noAccents === 'di ve' ||
    noAccents === 'tu tuc' ||
    noAccents.includes('ngoai tru') ||
    noAccents.includes('khong ban tru') ||
    noAccents.includes('o nha') ||
    noAccents.includes('di ve') ||
    noAccents.includes('khong an')
  ) {
    return true;
  }

  return false;
}

export interface ParsedStudentItem extends Omit<Student, 'id' | 'created_at'> {
  stt?: number;
  rawBoardingCellVal?: string;
  sourceRowIndex?: number;
}

export interface ExcelColumnInfo {
  index: number;
  name: string;
  sampleValues: string[];
  positiveBoardingMarks: number;
  negativeBoardingMarks: number;
  emptyCells: number;
  totalDataRows: number;
}

export interface ParseExcelRosterResult {
  students: ParsedStudentItem[];
  columns: ExcelColumnInfo[];
  detectedHeaderRowIndex: number;
  detectedBoardingColIndex: number;
  detectedDayColIndex: number;
  hasCheckboxBoardingCol: boolean;
  totalStudents: number;
  boardingCount: number;
  dayCount: number;
  warnings: string[];
}

/**
 * Hàm phân tích file Excel danh sách học sinh:
 * - Hỗ trợ tiêu đề 1 tầng, 2 tầng (multi-row header)
 * - Tự động nhận diện cột Họ và tên (hoặc Họ đệm + Tên)
 * - Tự động nhận diện cột Bán trú theo từ khóa (Bán trú, BT, 116, Chế độ,...)
 * - Tự động QUÉT TOÀN BỘ CÁC CỘT TRONG DỮ LIỆU THỰC TẾ:
 *   Nếu cột nào có 19/36 em đánh 'x', còn lại để trống -> Tự động nhận diện đây là cột Bán trú!
 * - Nhận diện chính xác ô để trống (blank/undefined) trong cột Bán trú là NGOẠI TRÚ!
 */
export function parseStudentExcelData(
  rawData: any[][],
  classId: string
): ParseExcelRosterResult {
  const warnings: string[] = [];

  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    return {
      students: [],
      columns: [],
      detectedHeaderRowIndex: -1,
      detectedBoardingColIndex: -1,
      detectedDayColIndex: -1,
      hasCheckboxBoardingCol: false,
      totalStudents: 0,
      boardingCount: 0,
      dayCount: 0,
      warnings: ['File Excel không có dữ liệu!'],
    };
  }

  // 1. Quét tìm dòng tiêu đề (Header row)
  let detectedHeaderRowIndex = -1;
  let detectedSubHeaderRowIndex = -1;

  let colIndexName = -1;
  let colIndexHoDem = -1;
  let colIndexTen = -1;
  let colIndexGender = -1;
  let colIndexVillage = -1;
  let colIndexCode = -1;
  let colIndexBirth = -1;
  let colIndexEthnicity = -1;
  let colIndexBoarding = -1;
  let colIndexDayStudent = -1;
  let colIndexNotes = -1;
  let colIndexSTT = -1;

  const maxHeaderSearchRows = Math.min(20, rawData.length);

  for (let r = 0; r < maxHeaderSearchRows; r++) {
    const row = rawData[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let headerScore = 0;
    let tempName = -1;
    let tempHoDem = -1;
    let tempTen = -1;
    let tempGender = -1;
    let tempVillage = -1;
    let tempCode = -1;
    let tempBirth = -1;
    let tempEthnicity = -1;
    let tempBoarding = -1;
    let tempDayStudent = -1;
    let tempNotes = -1;
    let tempSTT = -1;

    row.forEach((cell, idx) => {
      const cellText = cleanCellText(cell);
      if (!cellText) return;
      const noAcc = removeVietnameseAccents(cellText);

      if (noAcc === 'stt' || noAcc === 'so tt' || noAcc === 'tt' || noAcc === 'no.' || noAcc === 'no') {
        tempSTT = idx;
        headerScore += 2;
      }

      if (
        noAcc === 'ho va ten' ||
        noAcc === 'ho ten' ||
        noAcc === 'ho va ten hoc sinh' ||
        noAcc === 'ho ten hoc sinh' ||
        noAcc === 'ho va ten hs' ||
        noAcc === 'ten hoc sinh' ||
        noAcc.includes('ho va ten') ||
        noAcc.includes('ho ten')
      ) {
        tempName = idx;
        headerScore += 5;
      } else if (noAcc === 'ho dem' || noAcc === 'ho lot' || noAcc === 'ho va ten dem' || noAcc === 'ho') {
        tempHoDem = idx;
        headerScore += 3;
      } else if (noAcc === 'ten' || noAcc === 'ten hs') {
        tempTen = idx;
        headerScore += 3;
      }

      if (
        noAcc.includes('gioi tinh') ||
        noAcc === 'nam/nu' ||
        noAcc === 'nu' ||
        noAcc === 'nam' ||
        noAcc === 'phai'
      ) {
        tempGender = idx;
        headerScore += 2;
      }

      if (
        noAcc.includes('thon') ||
        (noAcc.includes('ban') && !noAcc.includes('ban tru') && !noAcc.includes('bt') && !noAcc.includes('hsbt') && !noAcc.includes('an ban')) ||
        noAcc.includes('dia chi') ||
        noAcc.includes('noi o') ||
        noAcc.includes('que quan') ||
        noAcc.includes('ho khau') ||
        noAcc.includes('cu tru')
      ) {
        tempVillage = idx;
        headerScore += 2;
      }

      if (
        noAcc.includes('ma hs') ||
        noAcc.includes('ma hoc sinh') ||
        noAcc.includes('ma dinh danh') ||
        noAcc.includes('ma so') ||
        noAcc === 'ma'
      ) {
        tempCode = idx;
        headerScore += 2;
      }

      if (
        noAcc.includes('ngay sinh') ||
        noAcc.includes('nam sinh') ||
        noAcc === 'ns' ||
        noAcc === 'dob' ||
        noAcc === 'd.o.b'
      ) {
        tempBirth = idx;
        headerScore += 2;
      }

      if (noAcc.includes('dan toc') || noAcc === 'dt') {
        tempEthnicity = idx;
        headerScore += 2;
      }

      // Nhận diện cột Bán trú
      if (
        noAcc.includes('ban tru') ||
        noAcc.includes('dien o') ||
        noAcc.includes('o noi tru') ||
        noAcc.includes('o ban tru') ||
        noAcc.includes('an ban tru') ||
        noAcc.includes('hs ban tru') ||
        noAcc.includes('dien bt') ||
        noAcc === 'bt' ||
        noAcc === 'hsbt' ||
        noAcc === 'dien' ||
        noAcc === 'che do' ||
        noAcc === 'doi tuong' ||
        noAcc.includes('hinh thuc') ||
        noAcc.includes('loai hs') ||
        noAcc.includes('116') ||
        noAcc.includes('nd 116') ||
        noAcc.includes('nghi dinh 116') ||
        noAcc.includes('an trua') ||
        noAcc.includes('suat an')
      ) {
        tempBoarding = idx;
        headerScore += 4;
      }

      // Nhận diện cột Ngoại trú riêng
      if (
        noAcc.includes('ngoai tru') ||
        noAcc.includes('o ngoai tru') ||
        noAcc.includes('khong ban tru') ||
        noAcc.includes('di ve') ||
        noAcc.includes('o nha')
      ) {
        tempDayStudent = idx;
        headerScore += 3;
      }

      if (noAcc.includes('ghi chu') || noAcc.includes('notes') || noAcc.includes('luu y')) {
        tempNotes = idx;
        headerScore += 1;
      }
    });

    // Dòng tiêu đề không thể là dòng dữ liệu học sinh (bắt đầu bằng STT = 1 và không có chữ "Họ và tên" hoặc "STT")
    const firstCell = cleanCellText(row[0]);
    const isFirstCellSttNum = !isNaN(Number(firstCell)) && Number(firstCell) > 0 && Number.isInteger(Number(firstCell));
    if (isFirstCellSttNum && tempName === -1 && tempSTT === -1 && (tempHoDem === -1 || tempTen === -1)) {
      continue;
    }

    if (headerScore >= 3 || tempName !== -1 || (tempHoDem !== -1 && tempTen !== -1)) {
      detectedHeaderRowIndex = r;
      colIndexName = tempName;
      colIndexHoDem = tempHoDem;
      colIndexTen = tempTen;
      colIndexGender = tempGender;
      colIndexVillage = tempVillage;
      colIndexCode = tempCode;
      colIndexBirth = tempBirth;
      colIndexEthnicity = tempEthnicity;
      colIndexBoarding = tempBoarding;
      colIndexDayStudent = tempDayStudent;
      colIndexNotes = tempNotes;
      colIndexSTT = tempSTT;

      // Kiểm tra dòng kế tiếp r + 1 xem có phải là dòng tiêu đề phụ (Sub-header / multi-row) không!
      // LƯU Ý: Nếu dòng r + 1 đã có STT số (1, 2...) hoặc tên học sinh, thì đó là dòng học sinh, KHÔNG PHẢI subheader!
      if (r + 1 < rawData.length) {
        const nextRow = rawData[r + 1];
        if (Array.isArray(nextRow) && nextRow.length > 0) {
          const sttCell = cleanCellText(nextRow[0]);
          const isSttNum = !isNaN(Number(sttCell)) && Number(sttCell) > 0;
          const nameCell = colIndexName !== -1 && nextRow[colIndexName] !== undefined ? cleanCellText(nextRow[colIndexName]) : '';
          const noAccName = removeVietnameseAccents(nameCell);
          const isPersonName = nameCell.length >= 3 && !['nam', 'nu', 'ban tru', 'ngoai tru', 'bt', 'hsbt'].includes(noAccName);

          if (!isSttNum && !isPersonName) {
            let foundSubHeaderLabel = false;
            nextRow.forEach((subCell, sIdx) => {
              const subText = cleanCellText(subCell);
              if (!subText) return;
              const subNoAcc = removeVietnameseAccents(subText);

              if (
                subNoAcc.includes('ban tru') ||
                subNoAcc === 'bt' ||
                subNoAcc === 'hsbt' ||
                subNoAcc.includes('116') ||
                subNoAcc.includes('an trua')
              ) {
                colIndexBoarding = sIdx;
                foundSubHeaderLabel = true;
              } else if (
                subNoAcc.includes('ngoai tru') ||
                subNoAcc.includes('o nha') ||
                subNoAcc.includes('di ve')
              ) {
                colIndexDayStudent = sIdx;
                foundSubHeaderLabel = true;
              } else if ((subNoAcc === 'nam' || subNoAcc === 'nu') && colIndexGender === -1) {
                colIndexGender = sIdx;
                foundSubHeaderLabel = true;
              }
            });

            if (foundSubHeaderLabel) {
              detectedSubHeaderRowIndex = r + 1;
            }
          }
        }
      }

      break;
    }
  }

  // Xác định dòng bắt đầu dữ liệu thực tế
  let startRow = 0;
  if (detectedSubHeaderRowIndex !== -1) {
    startRow = detectedSubHeaderRowIndex + 1;
  } else if (detectedHeaderRowIndex !== -1) {
    startRow = detectedHeaderRowIndex + 1;
  } else {
    // Không tìm thấy tiêu đề: kiểm tra nếu dòng 0 có STT + Tên
    startRow = 0;
    const firstRow = rawData[0] || [];
    if (firstRow.length > 1 && !isNaN(Number(firstRow[0])) && isNaN(Number(firstRow[1]))) {
      colIndexSTT = 0;
      colIndexName = 1;

      // Nhận diện kiểu dữ liệu các cột còn lại dựa vào giá trị thực tế của ô
      for (let c = 2; c < firstRow.length; c++) {
        const cVal = cleanCellText(firstRow[c]);
        const noAcc = removeVietnameseAccents(cVal);
        if ((noAcc === 'nam' || noAcc === 'nu') && colIndexGender === -1) {
          colIndexGender = c;
        } else if ((/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(cVal) || typeof firstRow[c] === 'number' && firstRow[c] > 25000 && firstRow[c] < 60000) && colIndexBirth === -1) {
          colIndexBirth = c;
        } else if ((noAcc === 'mong' || noAcc === 'thai' || noAcc === 'kinh' || noAcc === 'dao') && colIndexEthnicity === -1) {
          colIndexEthnicity = c;
        }
      }
    } else {
      colIndexName = firstRow.length > 1 ? 1 : 0;
    }
  }

  // Tìm độ rộng tối đa của các cột
  let maxColCount = 0;
  for (let i = 0; i < rawData.length; i++) {
    if (Array.isArray(rawData[i])) {
      maxColCount = Math.max(maxColCount, rawData[i].length);
    }
  }

  // 2. Thu thập danh sách học sinh hợp lệ trước
  interface TempStudentRow {
    rowIndex: number;
    stt: number;
    fullName: string;
    studentCode: string;
    gender: 'Nam' | 'Nữ';
    village: string;
    birthDate: string;
    ethnicity: string;
    rowCells: any[];
  }

  const validRows: TempStudentRow[] = [];
  let currentSTT = 1;

  for (let i = startRow; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let fullName = '';
    if (colIndexName !== -1 && row[colIndexName] !== undefined && row[colIndexName] !== null) {
      fullName = cleanCellText(row[colIndexName]);
    } else if (colIndexHoDem !== -1 && colIndexTen !== -1) {
      const ho = cleanCellText(row[colIndexHoDem]);
      const ten = cleanCellText(row[colIndexTen]);
      fullName = `${ho} ${ten}`.trim();
    } else {
      for (let c = 0; c < row.length; c++) {
        const cellStr = cleanCellText(row[c]);
        if (cellStr.length > 2 && isNaN(Number(cellStr))) {
          fullName = cellStr;
          break;
        }
      }
    }

    if (!fullName) continue;

    // Loại bỏ STT ở đầu ô tên nếu có (ví dụ "1. Lò Văn Nam")
    fullName = fullName.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').trim();
    if (!fullName) continue;

    const noAccName = removeVietnameseAccents(fullName);
    if (
      noAccName === 'stt' ||
      noAccName.includes('ho va ten') ||
      noAccName.includes('ho ten') ||
      noAccName.includes('tong so') ||
      noAccName.includes('tong cong') ||
      noAccName.includes('nguoi lap') ||
      noAccName.includes('hieu truong') ||
      noAccName.includes('danh sach hoc sinh') ||
      noAccName.includes('ban giam hieu') ||
      noAccName.includes('giao vien chu nhiem') ||
      noAccName.includes('chu ky') ||
      noAccName.includes('xac nhan')
    ) {
      continue;
    }

    let gender = resolveStudentGender('', fullName);
    if (colIndexGender !== -1 && row[colIndexGender] !== undefined) {
      const gClean = removeVietnameseAccents(cleanCellText(row[colIndexGender]));
      if (gClean === 'nu' || gClean === 'f' || gClean === 'female' || gClean === 'x' || gClean === '1') {
        gender = 'Nữ';
      } else if (gClean === 'nam' || gClean === 'm' || gClean === 'male' || gClean === '0') {
        gender = 'Nam';
      }
    }

    let village = '';
    if (colIndexVillage !== -1 && row[colIndexVillage] !== undefined) {
      village = cleanStudentAddress(cleanCellText(row[colIndexVillage]));
    }

    let studentCode = '';
    if (colIndexCode !== -1 && row[colIndexCode] !== undefined) {
      studentCode = cleanCellText(row[colIndexCode]);
    }

    let birthDate = '';
    if (colIndexBirth !== -1 && row[colIndexBirth] !== undefined) {
      const rawBirth = row[colIndexBirth];
      if (typeof rawBirth === 'number') {
        try {
          const d = new Date(Math.round((rawBirth - 25569) * 86400 * 1000));
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          birthDate = `${day}/${month}/${year}`;
        } catch {
          birthDate = String(rawBirth);
        }
      } else {
        birthDate = cleanCellText(rawBirth);
      }
    }

    let ethnicity = 'Mông';
    if (colIndexEthnicity !== -1 && row[colIndexEthnicity] !== undefined) {
      ethnicity = cleanCellText(row[colIndexEthnicity]) || 'Mông';
    }

    validRows.push({
      rowIndex: i,
      stt: currentSTT++,
      fullName,
      studentCode,
      gender,
      village,
      birthDate,
      ethnicity,
      rowCells: row,
    });
  }

  // 3. Phân tích thống kê từng cột trên toàn bộ các dòng học sinh hợp lệ
  const columnInfos: ExcelColumnInfo[] = [];

  for (let c = 0; c < maxColCount; c++) {
    // Tên cột từ dòng tiêu đề
    let headerName = '';
    if (detectedHeaderRowIndex !== -1 && rawData[detectedHeaderRowIndex]) {
      headerName = cleanCellText(rawData[detectedHeaderRowIndex][c]);
    }
    if (detectedSubHeaderRowIndex !== -1 && rawData[detectedSubHeaderRowIndex]) {
      const subName = cleanCellText(rawData[detectedSubHeaderRowIndex][c]);
      if (subName) {
        headerName = headerName ? `${headerName} - ${subName}` : subName;
      }
    }
    if (!headerName) {
      headerName = `Cột ${XLSX.utils.encode_col(c)}`;
    }

    let posCount = 0;
    let negCount = 0;
    let emptyCount = 0;
    const samples: string[] = [];

    validRows.forEach((vr) => {
      const cellVal = vr.rowCells[c];
      const text = cleanCellText(cellVal);

      if (samples.length < 3 && text) {
        samples.push(text);
      }

      if (!text) {
        emptyCount++;
      } else if (isPositiveBoardingValue(text)) {
        posCount++;
      } else if (isNegativeBoardingValue(text)) {
        negCount++;
      }
    });

    columnInfos.push({
      index: c,
      name: headerName,
      sampleValues: samples,
      positiveBoardingMarks: posCount,
      negativeBoardingMarks: negCount,
      emptyCells: emptyCount,
      totalDataRows: validRows.length,
    });
  }

  // 4. THUẬT TOÁN SUY LUẬN TỰ ĐỘNG CỘT BÁN TRÚ NẾU CHƯA XÁC ĐỊNH ĐƯỢC:
  // Nếu colIndexBoarding vẫn là -1 hoặc cột đã chọn không có dữ liệu bán trú,
  // tự động tìm trong tất cả các cột của dữ liệu:
  if (colIndexBoarding === -1 && validRows.length > 0) {
    let bestColIdx = -1;
    let bestScore = -1;

    columnInfos.forEach((info) => {
      // Không chọn cột họ tên, STT, ngày sinh, mã học sinh
      if (info.index === colIndexName || info.index === colIndexSTT || info.index === colIndexBirth || info.index === colIndexCode) {
        return;
      }

      // Điểm số cột: Càng có nhiều dấu bán trú chuẩn thì điểm càng cao
      let score = 0;
      if (info.positiveBoardingMarks > 0) {
        score += info.positiveBoardingMarks * 5;
      }
      if (info.negativeBoardingMarks > 0) {
        score += info.negativeBoardingMarks * 3;
      }

      // Tên cột có gợi ý
      const noAcc = removeVietnameseAccents(info.name);
      if (noAcc.includes('ban tru') || noAcc.includes('bt') || noAcc.includes('116') || noAcc.includes('che do')) {
        score += 50;
      }

      // Trường hợp cực kỳ phổ biến: 19 em có dấu 'x', 17 em để trống!
      if (
        info.positiveBoardingMarks > 0 &&
        info.positiveBoardingMarks < validRows.length &&
        info.emptyCells > 0 &&
        info.positiveBoardingMarks + info.emptyCells === validRows.length
      ) {
        score += 40;
      }

      if (score > bestScore && score > 0) {
        bestScore = score;
        bestColIdx = info.index;
      }
    });

    if (bestColIdx !== -1) {
      colIndexBoarding = bestColIdx;
    }
  }

  // Kiểm tra xem cột bán trú này có phải là kiểu Checkbox (đánh dấu em bán trú, để trống là ngoại trú)
  let isCheckboxBoardingCol = false;
  if (colIndexBoarding !== -1) {
    const colInfo = columnInfos[colIndexBoarding];
    if (colInfo) {
      const hasPos = colInfo.positiveBoardingMarks > 0;
      const hasEmptyOrNeg = colInfo.emptyCells > 0 || colInfo.negativeBoardingMarks > 0;
      isCheckboxBoardingCol = hasPos && hasEmptyOrNeg;
    }
  }

  // 5. Trích xuất danh sách học sinh với phân loại chuẩn xác 100%
  const parsedStudents: ParsedStudentItem[] = [];

  validRows.forEach((vr) => {
    let isBoarding = true;
    let rawBoardingVal = '';

    if (colIndexBoarding !== -1) {
      const rawCell = vr.rowCells[colIndexBoarding];
      rawBoardingVal = cleanCellText(rawCell);

      const isPos = isPositiveBoardingValue(rawCell);
      const isNeg = isNegativeBoardingValue(rawCell);

      if (isPos) {
        isBoarding = true;
      } else if (isNeg) {
        isBoarding = false;
      } else if (isCheckboxBoardingCol) {
        // QUAN TRỌNG NHẤT: Cột đánh dấu bán trú: Nếu ô để trống (blank/undefined/empty)
        // thì học sinh đó là NGOẠI TRÚ! (Ví dụ lớp 36 em có 19 em 'x' là bán trú, 17 em trống là ngoại trú)
        isBoarding = false;
      }
    }

    // Kiểm tra thêm cột ngoại trú riêng (nếu file có cột Ngoại trú)
    if (colIndexDayStudent !== -1) {
      const dayCell = vr.rowCells[colIndexDayStudent];
      if (isPositiveBoardingValue(dayCell) || cleanCellText(dayCell).toLowerCase().includes('ngoai')) {
        isBoarding = false;
      }
    }

    // Kiểm tra thêm cột ghi chú nếu chưa có cột Bán trú riêng
    if (colIndexNotes !== -1 && colIndexBoarding === -1) {
      const noteCell = cleanCellText(vr.rowCells[colIndexNotes]);
      if (isNegativeBoardingValue(noteCell)) {
        isBoarding = false;
      } else if (isPositiveBoardingValue(noteCell)) {
        isBoarding = true;
      }
    }

    parsedStudents.push({
      class_id: classId,
      full_name: vr.fullName,
      student_code: vr.studentCode || undefined,
      gender: vr.gender,
      village: vr.village || undefined,
      address: vr.village || undefined,
      birth_date: vr.birthDate || undefined,
      ethnicity: vr.ethnicity || undefined,
      isBoarding,
      notes: '',
      stt: vr.stt,
      rawBoardingCellVal: rawBoardingVal,
      sourceRowIndex: vr.rowIndex,
    });
  });

  const bCount = parsedStudents.filter((s) => s.isBoarding !== false).length;
  const dCount = parsedStudents.filter((s) => s.isBoarding === false).length;

  return {
    students: parsedStudents,
    columns: columnInfos,
    detectedHeaderRowIndex,
    detectedBoardingColIndex: colIndexBoarding,
    detectedDayColIndex: colIndexDayStudent,
    hasCheckboxBoardingCol: isCheckboxBoardingCol,
    totalStudents: parsedStudents.length,
    boardingCount: bCount,
    dayCount: dCount,
    warnings,
  };
}

/**
 * Tái tính toán lại phân loại Bán trú / Ngoại trú khi người dùng đổi cột trong modal
 */
export function recomputeStudentsWithBoardingColumn(
  rawData: any[][],
  students: ParsedStudentItem[],
  newColIndex: number,
  classId: string
): ParsedStudentItem[] {
  if (!rawData || newColIndex < 0) return students;

  // Kiểm tra xem cột mới có phải là checkbox column không
  let posCount = 0;
  let emptyCount = 0;
  let negCount = 0;

  students.forEach((st) => {
    if (st.sourceRowIndex === undefined) return;
    const row = rawData[st.sourceRowIndex] || [];
    const cell = row[newColIndex];
    const text = cleanCellText(cell);
    if (!text) emptyCount++;
    else if (isPositiveBoardingValue(text)) posCount++;
    else if (isNegativeBoardingValue(text)) negCount++;
  });

  const isCheckbox = posCount > 0 && (emptyCount > 0 || negCount > 0);

  return students.map((st) => {
    if (st.sourceRowIndex === undefined) return st;
    const row = rawData[st.sourceRowIndex] || [];
    const cell = row[newColIndex];
    const text = cleanCellText(cell);

    let isBoarding = true;
    if (isPositiveBoardingValue(cell)) {
      isBoarding = true;
    } else if (isNegativeBoardingValue(cell)) {
      isBoarding = false;
    } else if (isCheckbox) {
      isBoarding = false;
    }

    return {
      ...st,
      isBoarding,
      rawBoardingCellVal: text,
    };
  });
}
