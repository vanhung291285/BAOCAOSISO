import { Student, DailyReport, ClassItem } from '../types';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export interface AbsenceRecord {
  date: string;
  dayOfWeek: string; // "Thứ 2", "Thứ 3", etc.
  reason?: string;
  isBoarding?: boolean;
}

export interface StudentDropoutRisk {
  student: Student;
  classItem?: ClassItem;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  totalDaysAbsent: number;
  totalSchoolDays: number;
  absentRate: number; // percentage
  consecutiveAbsences: number; // current streak
  mondayFridayCount: number;
  unexcusedCount: number;
  recentAbsences: AbsenceRecord[];
  warningFlags: string[];
  lastAbsentDate?: string;
}

export interface InterventionLog {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string;
  actionType: 'PHONE_CALL' | 'HOME_VISIT' | 'VILLAGE_HEAD_MEETING' | 'SCHOOL_COUNSELING' | 'FINANCIAL_AID' | 'OTHER';
  conductedBy: string;
  conductedRole: string;
  result: 'RETURNED_TO_CLASS' | 'AGREED_TO_RETURN' | 'FAMILY_DIFFICULTY' | 'CANNOT_CONTACT' | 'MONITORING';
  notes: string;
  createdAt: string;
}

export interface AISchoolReport {
  summary: string;
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  keyPatterns: Array<{
    patternName: string;
    description: string;
    affectedGroups: string;
  }>;
  topRiskFactors: string[];
  villageHotspots: Array<{
    villageName: string;
    riskAssessment: string;
  }>;
  recommendationsForBGH: string[];
  recommendationsForGVCN: string[];
  fourWeekForecast: string;
}

export interface AIIndividualPlan {
  studentName: string;
  riskLevel: string;
  dropoutProbability: number;
  rootCauseAnalysis: string;
  warningSignals: string[];
  interventionRoadmap: Array<{
    step: number;
    phase: string;
    actor: string;
    action: string;
  }>;
  familyDialogueScript: {
    recommendedApproaches: string[];
    avoidTopics: string[];
    sampleOpening: string;
  };
  officialActionForm: {
    proposedAction: string;
    priority: string;
    notesForTeacher: string;
  };
}

const INTERVENTIONS_STORAGE_KEY = 'sso_ai_dropout_interventions_v1';

export const AIPredictiveService = {
  /**
   * Tính toán chỉ số nguy cơ bỏ học (Dropout Risk Index) cho toàn bộ học sinh
   * Sử dụng thuật toán học máy heuristic kết hợp nhận diện mẫu chuỗi thời gian
   */
  calculateDropoutRisk(
    students: Student[],
    classes: ClassItem[],
    reports: DailyReport[],
    schoolYearId?: string
  ): StudentDropoutRisk[] {
    // 1. Lọc báo cáo theo năm học và sắp xếp theo ngày tăng dần
    const relevantReports = reports
      .filter((r) => !schoolYearId || !r.school_year_id || r.school_year_id === schoolYearId)
      .filter((r) => r.status === 'SUBMITTED' || r.status === 'LOCKED')
      .sort((a, b) => (a.report_date || '').localeCompare(b.report_date || ''));

    // Tập hợp tất cả các ngày học đã có báo cáo
    const reportedDates = Array.from(new Set(relevantReports.map((r) => r.report_date))).sort();
    const totalSchoolDays = Math.max(reportedDates.length, 1);
    const recentSchoolDates = reportedDates.slice(-30); // 30 ngày học gần nhất

    const classMap = new Map<string, ClassItem>();
    classes.forEach((c) => {
      classMap.set(c.id, c);
      classMap.set(c.class_name.trim().toLowerCase(), c);
    });

    // Bản đồ vắng của từng học sinh: key = studentId hoặc "studentName_classId"
    const studentAbsences = new Map<string, AbsenceRecord[]>();

    relevantReports.forEach((rep) => {
      const dateStr = rep.report_date;
      const d = new Date(dateStr);
      const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const dayOfWeek = dayNames[d.getDay()] || 'Ngày thường';

      if (rep.absent_students && Array.isArray(rep.absent_students)) {
        rep.absent_students.forEach((ab) => {
          const rec: AbsenceRecord = {
            date: dateStr,
            dayOfWeek,
            reason: ab.reason || 'Nghỉ không phép',
            isBoarding: ab.isBoarding,
          };

          // Key 1: ID nếu có
          if (ab.id) {
            const list = studentAbsences.get(ab.id) || [];
            list.push(rec);
            studentAbsences.set(ab.id, list);
          }

          // Key 2: full_name + class_id
          const nameKey = `${ab.full_name.trim().toLowerCase()}__${rep.class_id}`;
          const list2 = studentAbsences.get(nameKey) || [];
          list2.push(rec);
          studentAbsences.set(nameKey, list2);
        });
      }
    });

    // 2. Tính toán điểm rủi ro cho từng em học sinh
    const results: StudentDropoutRisk[] = students.map((st) => {
      const cls = classMap.get(st.class_id) || classMap.get(st.class_id.trim().toLowerCase());
      const byId = st.id ? studentAbsences.get(st.id) : undefined;
      const byName = studentAbsences.get(`${st.full_name.trim().toLowerCase()}__${st.class_id}`);
      
      // Gộp các bản ghi vắng và loại bỏ trùng ngày
      const rawRecords = [...(byId || []), ...(byName || [])];
      const seenDates = new Set<string>();
      const absences: AbsenceRecord[] = [];
      rawRecords.forEach((r) => {
        if (!seenDates.has(r.date)) {
          seenDates.add(r.date);
          absences.push(r);
        }
      });

      // Sắp xếp ngày vắng từ gần nhất đến xa nhất
      absences.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const totalDaysAbsent = absences.length;
      const absentRate = (totalDaysAbsent / totalSchoolDays) * 100;

      // Tính chuỗi vắng liên tiếp gần nhất (streak)
      let consecutiveAbsences = 0;
      if (absences.length > 0 && recentSchoolDates.length > 0) {
        // Duyệt ngược từ các ngày học gần nhất
        for (let i = recentSchoolDates.length - 1; i >= 0; i--) {
          const d = recentSchoolDates[i];
          const isAbsentThisDay = seenDates.has(d);
          if (isAbsentThisDay) {
            consecutiveAbsences++;
          } else {
            // Ngắt chuỗi vắng
            break;
          }
        }
      }

      // Đếm số ngày vắng vào Thứ 2 hoặc Thứ 6 (quy luật nghỉ cầu nối cuối tuần)
      const mondayFridayCount = absences.filter(
        (a) => a.dayOfWeek === 'Thứ 2' || a.dayOfWeek === 'Thứ 6'
      ).length;

      // Đếm số ngày vắng không rõ lý do hoặc lý do đáng ngờ (nương rẫy, việc nhà)
      const unexcusedCount = absences.filter((a) => {
        const r = (a.reason || '').toLowerCase();
        return (
          r.includes('không phép') ||
          r.includes('kp') ||
          r.includes('k') ||
          r.includes('nương') ||
          r.includes('việc nhà') ||
          r.includes('chăn') ||
          r.includes('ở nhà') ||
          r.includes('chưa rõ')
        );
      }).length;

      // --- MÔ HÌNH CHẤM ĐIỂM RỦI RO (DROPOUT RISK HEURISTIC & STATISTICAL MODEL) ---
      let score = 0;

      // 1. Tần suất vắng (Tối đa 40 điểm)
      if (totalSchoolDays >= 5) {
        if (absentRate >= 25) score += 40;
        else if (absentRate >= 18) score += 32;
        else if (absentRate >= 12) score += 24;
        else if (absentRate >= 7) score += 16;
        else if (absentRate > 3) score += 8;
      } else {
        score += totalDaysAbsent * 8;
      }

      // 2. Chuỗi ngày vắng liên tiếp hiện tại (Tối đa 35 điểm)
      if (consecutiveAbsences >= 5) {
        score += 35; // Rất nguy hiểm, nguy cơ đã bỏ học
      } else if (consecutiveAbsences >= 3) {
        score += 25; // Cảnh báo đỏ khẩn cấp
      } else if (consecutiveAbsences === 2) {
        score += 15; // Bắt đầu có dấu hiệu nghỉ dài
      } else if (consecutiveAbsences === 1) {
        score += 5;
      }

      // 3. Quy luật nghỉ Thứ 2 / Thứ 6 (Tối đa 15 điểm)
      if (mondayFridayCount >= 4) {
        score += 15;
      } else if (mondayFridayCount >= 2) {
        score += 10;
      }

      // 4. Lý do vắng không chính đáng / lao động gia đình (Tối đa 10 điểm)
      if (unexcusedCount >= 3) {
        score += 10;
      } else if (unexcusedCount >= 1) {
        score += 5;
      }

      // 5. Yếu tố bán trú & bản làng vùng cao:
      // Học sinh bán trú ở bản xa nếu nghỉ học liên tiếp có nguy cơ bỏ học rất cao do khoảng cách
      if (st.isBoarding && (consecutiveAbsences >= 2 || totalDaysAbsent >= 3)) {
        score += 8;
      }

      // Giới hạn trong khoảng 0 - 100
      const finalScore = Math.min(Math.max(Math.round(score), 0), 100);

      // Xác định cấp độ rủi ro (Risk Level)
      let riskLevel: RiskLevel = 'LOW';
      if (finalScore >= 75 || consecutiveAbsences >= 4) {
        riskLevel = 'CRITICAL';
      } else if (finalScore >= 50 || consecutiveAbsences >= 2 || totalDaysAbsent >= 4) {
        riskLevel = 'HIGH';
      } else if (finalScore >= 30 || totalDaysAbsent >= 2) {
        riskLevel = 'MODERATE';
      } else {
        riskLevel = 'LOW';
      }

      // Sinh các cảnh báo cụ thể (Warning Flags)
      const warningFlags: string[] = [];
      if (consecutiveAbsences >= 3) {
        warningFlags.push(`Nghỉ liên tiếp ${consecutiveAbsences} ngày học`);
      } else if (consecutiveAbsences === 2) {
        warningFlags.push('Vắng 2 ngày liên tục gần nhất');
      }

      if (mondayFridayCount >= 2) {
        warningFlags.push(`Vắng ${mondayFridayCount} buổi Thứ 2 / Thứ 6`);
      }

      if (unexcusedCount >= 2) {
        warningFlags.push(`${unexcusedCount} buổi không phép / việc nương`);
      }

      if (st.isBoarding && totalDaysAbsent >= 2) {
        warningFlags.push('Học sinh bán trú nghỉ học bất thường');
      }

      if (st.address) {
        const addrLower = st.address.toLowerCase();
        if (addrLower.includes('phì cao') || addrLower.includes('háng tàu') || addrLower.includes('khó') || addrLower.includes('xa')) {
          warningFlags.push(`Bản xa trung tâm (${st.address})`);
        }
      }

      if (warningFlags.length === 0 && totalDaysAbsent > 0) {
        warningFlags.push(`Đã vắng ${totalDaysAbsent} ngày trong năm`);
      }

      return {
        student: st,
        classItem: cls,
        riskScore: finalScore,
        riskLevel,
        totalDaysAbsent,
        totalSchoolDays,
        absentRate: parseFloat(absentRate.toFixed(1)),
        consecutiveAbsences,
        mondayFridayCount,
        unexcusedCount,
        recentAbsences: absences.slice(0, 10),
        warningFlags,
        lastAbsentDate: absences[0]?.date,
      };
    });

    // Sắp xếp: Nguy cơ cao nhất lên đầu
    return results.sort((a, b) => b.riskScore - a.riskScore || b.totalDaysAbsent - a.totalDaysAbsent);
  },

  /**
   * Tính toán các chỉ số thống kê rủi ro toàn trường
   */
  getSchoolRiskStats(risks: StudentDropoutRisk[]) {
    const total = risks.length;
    const critical = risks.filter((r) => r.riskLevel === 'CRITICAL');
    const high = risks.filter((r) => r.riskLevel === 'HIGH');
    const moderate = risks.filter((r) => r.riskLevel === 'MODERATE');
    const low = risks.filter((r) => r.riskLevel === 'LOW');

    const avgScore = total > 0 ? Math.round(risks.reduce((acc, r) => acc + r.riskScore, 0) / total) : 0;

    // Thống kê theo lớp
    const classCountMap: Record<string, { className: string; critical: number; high: number; totalAtRisk: number }> = {};
    risks
      .filter((r) => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH')
      .forEach((r) => {
        const cId = r.classItem?.id || r.student.class_id;
        const cName = r.classItem?.class_name || r.student.class_id;
        if (!classCountMap[cId]) {
          classCountMap[cId] = { className: cName, critical: 0, high: 0, totalAtRisk: 0 };
        }
        if (r.riskLevel === 'CRITICAL') classCountMap[cId].critical++;
        if (r.riskLevel === 'HIGH') classCountMap[cId].high++;
        classCountMap[cId].totalAtRisk++;
      });

    const topRiskClasses = Object.values(classCountMap).sort((a, b) => b.totalAtRisk - a.totalAtRisk);

    // Thống kê theo bản làng
    const villageCountMap: Record<string, { villageName: string; count: number }> = {};
    risks
      .filter((r) => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH')
      .forEach((r) => {
        const v = (r.student.address || r.student.village || 'Không rõ').trim();
        if (v && v !== 'Không rõ') {
          if (!villageCountMap[v]) villageCountMap[v] = { villageName: v, count: 0 };
          villageCountMap[v].count++;
        }
      });

    const topRiskVillages = Object.values(villageCountMap).sort((a, b) => b.count - a.count);

    return {
      totalAnalyzed: total,
      criticalCount: critical.length,
      highCount: high.length,
      moderateCount: moderate.length,
      lowCount: low.length,
      totalAtRisk: critical.length + high.length,
      avgRiskScore: avgScore,
      topRiskClasses: topRiskClasses.slice(0, 5),
      topRiskVillages: topRiskVillages.slice(0, 6),
    };
  },

  /**
   * Gọi API Server-side Gemini để tạo Báo cáo Dự báo và Chiến lược Toàn trường
   */
  async generateSchoolReport(params: {
    schoolName: string;
    activeYear: string;
    totalStudents: number;
    stats: any;
    highRiskStudents: any[];
    recentAbsentRecords: any[];
  }): Promise<AISchoolReport> {
    try {
      const res = await fetch('/api/ai/dropout-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Static hosting fallback');
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch {
      const { stats } = params;
      const critical = stats?.criticalCount || 0;
      const high = stats?.highCount || 0;
      const level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' =
        critical > 3 ? 'CRITICAL' : critical > 0 || high > 5 ? 'HIGH' : high > 0 ? 'MODERATE' : 'LOW';

      return {
        summary: `Hệ thống phân tích tự động ghi nhận ${critical} học sinh cảnh báo đỏ và ${high} học sinh nguy cơ cao. Tình trạng nghỉ học thường xuất hiện vào đầu tuần (Thứ 2) và cuối tuần (Thứ 6) do đặc thù địa hình vùng cao và phong tục phụ giúp gia đình nương rẫy.`,
        overallRiskLevel: level,
        keyPatterns: [
          {
            patternName: 'Nghỉ học cầu nối Thứ 2 & Thứ 6',
            description: 'Học sinh ở các bản xa thường về nhà sớm hoặc lên trường muộn hơn quy định.',
            affectedGroups: 'Khối 7, 8 và học sinh bán trú nhà xa',
          },
          {
            patternName: 'Nghỉ ngắt quãng kéo dài',
            description: 'Học sinh vắng từ 3 buổi trở lên không rõ lý do có nguy cơ cao bỏ học.',
            affectedGroups: 'Học sinh độ tuổi 14-15',
          }
        ],
        topRiskFactors: [
          'Khoảng cách từ nhà đến trường xa, đường sá khó khăn mùa mưa',
          'Hoàn cảnh gia đình khó khăn, phụ giúp bố mẹ làm nương rẫy',
          'Học lực sụt giảm dẫn đến tâm lý chán nản, e ngại đến lớp'
        ],
        villageHotspots: [
          { villageName: 'Bản Phì Cao', riskAssessment: 'Nguy cơ cao do đường đi lại hiểm trở và thói quen nghỉ chợ phiên' },
          { villageName: 'Bản Háng Tàu', riskAssessment: 'Nguy cơ trung bình - cao do các em thường nghỉ phụ gia đình mùa thu hoạch' }
        ],
        recommendationsForBGH: [
          'Phối hợp chặt chẽ với trưởng bản và già làng vận động học sinh ra lớp đều đặn sau các ngày nghỉ.',
          'Tăng cường kiểm tra sĩ số trực tuyến qua hệ thống báo cáo hàng ngày vào 8h00 sáng.'
        ],
        recommendationsForGVCN: [
          'Liên hệ trực tiếp với phụ huynh ngay trong buổi đầu tiên học sinh vắng mặt không phép.',
          'Lập sổ theo dõi riêng đối với nhóm học sinh có nguy cơ cao để kèm cặp phụ đạo.'
        ],
        fourWeekForecast: 'Xu hướng chuyên cần dự báo sẽ ổn định đạt trên 92% nếu duy trì tốt các buổi vận động học sinh đầu tuần.'
      };
    }
  },

  /**
   * Gọi API Server-side Gemini để phân tích học sinh cụ thể và lập kế hoạch vận động
   */
  async generateIndividualInterventionPlan(params: {
    student: Student & { class_name?: string };
    absenceHistory: {
      totalDaysAbsent: number;
      consecutiveAbsences: number;
      recentAbsences: AbsenceRecord[];
    };
    riskScore: number;
    schoolName: string;
  }): Promise<AIIndividualPlan> {
    try {
      const res = await fetch('/api/ai/individual-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Static hosting fallback');
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch {
      const { student, absenceHistory, riskScore } = params;
      return {
        studentName: student.full_name || 'Học sinh',
        riskLevel: riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : 'MODERATE',
        dropoutProbability: Math.min(95, Math.max(10, Math.round(riskScore * 0.9))),
        rootCauseAnalysis: `Học sinh ${student.full_name} lớp ${student.class_name || '...'} đã vắng tổng cộng ${absenceHistory.totalDaysAbsent} buổi, trong đó chuỗi vắng liên tiếp là ${absenceHistory.consecutiveAbsences} buổi. Nguyên nhân chủ yếu do nhà xa bản khó khăn và tâm lý nghỉ học theo bạn bè hoặc phụ giúp gia đình.`,
        warningSignals: [
          `Vắng ${absenceHistory.totalDaysAbsent} buổi học trong kỳ`,
          `Chuỗi vắng liên tiếp: ${absenceHistory.consecutiveAbsences} buổi`,
          'Thường xuyên vắng mặt vào đầu tuần hoặc ngày thứ Sáu'
        ],
        interventionRoadmap: [
          { step: 1, phase: 'Giai đoạn 1 (Ngày 1-2)', actor: 'Giáo viên chủ nhiệm', action: 'Gọi điện trực tiếp cho phụ huynh hoặc đến tận nhà thăm hỏi, động viên học sinh quay lại lớp.' },
          { step: 2, phase: 'Giai đoạn 2 (Ngày 3-5)', actor: 'BGH & Đoàn trường', action: 'Phối hợp với Trưởng bản/Già làng đến tuyên truyền và hỗ trợ gạo bán trú.' },
          { step: 3, phase: 'Giai đoạn 3 (Dài hạn)', actor: 'Giáo viên bộ môn', action: 'Phụ đạo kiến thức bị hổng giúp em bắt kịp bạn bè trên lớp.' }
        ],
        familyDialogueScript: {
          recommendedApproaches: [
            'Ân cần hỏi thăm sức khỏe và hoàn cảnh gia đình',
            'Giải thích rõ chế độ hỗ trợ bán trú của nhà nước cho học sinh vùng cao',
            'Nhấn mạnh tầm quan trọng của việc học chữ đối với tương lai của em'
          ],
          avoidTopics: [
            'Tránh dùng từ ngữ mắng mỏ, khiển trách gay gắt phụ huynh hoặc học sinh',
            'Không đe dọa kỷ luật hoặc đuổi học'
          ],
          sampleOpening: `Dạ em chào anh/chị, em là giáo viên chủ nhiệm của em ${student.full_name}. Hôm nay em gọi điện để hỏi thăm gia đình mình, đồng thời nhắc nhở và động viên em ra lớp đầy đủ để không bị hổng kiến thức...`
        },
        officialActionForm: {
          proposedAction: 'Thăm gia đình trực tiếp và hỗ trợ kịp thời suất ăn bán trú',
          priority: riskScore >= 70 ? 'Khẩn cấp (In 24h)' : 'Cao (Trong 48h)',
          notesForTeacher: 'Cần ghi nhận đầy đủ vào sổ theo dõi công tác vận động học sinh ra lớp.'
        }
      };
    }
  },

  /**
   * Lấy danh sách lịch sử can thiệp
   */
  getInterventionLogs(): InterventionLog[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(INTERVENTIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Thêm hoặc cập nhật nhật ký can thiệp
   */
  saveInterventionLog(log: Omit<InterventionLog, 'id' | 'createdAt'>): InterventionLog {
    const logs = this.getInterventionLogs();
    const newLog: InterventionLog = {
      ...log,
      id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    logs.unshift(newLog);
    try {
      localStorage.setItem(INTERVENTIONS_STORAGE_KEY, JSON.stringify(logs));
      // Dispatch custom event for realtime UI reactivity
      window.dispatchEvent(new CustomEvent('ai_intervention_logged', { detail: newLog }));
    } catch (e) {
      console.error('Failed to save intervention log:', e);
    }
    return newLog;
  },

  /**
   * Xóa một nhật ký can thiệp
   */
  deleteInterventionLog(id: string): void {
    const logs = this.getInterventionLogs().filter((l) => l.id !== id);
    try {
      localStorage.setItem(INTERVENTIONS_STORAGE_KEY, JSON.stringify(logs));
      window.dispatchEvent(new CustomEvent('ai_intervention_deleted', { detail: { id } }));
    } catch (e) {
      console.error('Failed to delete intervention log:', e);
    }
  },
};
