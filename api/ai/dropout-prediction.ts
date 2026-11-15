import { structuredHandler } from '../../server/ai/structured';
export default structuredHandler(b=>typeof b.schoolName==='string'&&b.stats&&Array.isArray(b.highRiskStudents)&&Array.isArray(b.recentAbsentRecords), {
 summary:'Tóm tắt dữ liệu thực tế; nêu giới hạn dữ liệu',overallRiskLevel:'LOW',keyPatterns:[{patternName:'Mẫu có bằng chứng',description:'Căn cứ',affectedGroups:'Nhóm có dữ liệu'}],topRiskFactors:['Chỉ các yếu tố được ghi nhận'],villageHotspots:[{villageName:'Địa danh trong dữ liệu',riskAssessment:'Căn cứ'}],recommendationsForBGH:['Đề xuất'],recommendationsForGVCN:['Đề xuất'],fourWeekForecast:'Chưa đủ căn cứ dự báo định lượng; nêu kịch bản cần theo dõi'
},d=>{if(!['LOW','MODERATE','HIGH','CRITICAL'].includes(d.overallRiskLevel))throw new Error('INVALID_LEVEL');return d;});
