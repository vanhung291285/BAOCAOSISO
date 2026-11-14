import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useSchool} from '../contexts/SchoolContext';
import {useAuth} from '../contexts/AuthContext';
import {loadOperationsData} from '../services/operationsData';
import {buildOperationsSnapshot,operationsBrief,answerOperationsQuestion,type OperationsSnapshot} from '../services/operationsInsights';
import {getTodayDateStr,formatDateVN} from '../utils/schoolWeeks';
import {matchClassReport} from '../utils/studentUtils';
import {RefreshCw,Sparkles,ClipboardCheck,ArrowRight,Copy,AlertTriangle,CheckCircle2,Search} from 'lucide-react';
interface Props {onSelectClass:(classId:string,date:string)=>void;}
export function OperationsCenterPage({onSelectClass}:Props) {
  const {classes,indicators,campuses,activeYear,settings}=useSchool();
  const {currentUser,isGVCN}=useAuth();
  const [date,setDate]=useState(getTodayDateStr);
  const [campus,setCampus]=useState('all');
  const [classFilter,setClassFilter]=useState('all');
  const [snapshot,setSnapshot]=useState<OperationsSnapshot>();
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const [revision,setRevision]=useState(0);
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [tab,setTab]=useState<'overview'|'assistant'|'report'>('overview');
  const [copied,setCopied]=useState('');
  const request=useRef(0);
  const scope=useMemo(()=>classes.filter(c=>c.active && (!activeYear || c.school_year_id===activeYear.id) &&
    (!isGVCN || c.homeroom_teacher_id===currentUser?.id || !!currentUser?.assigned_class_id && matchClassReport(currentUser.assigned_class_id,c)) &&
    (campus==='all'||c.campus_id===campus) && (classFilter==='all'||c.id===classFilter)),[classes,activeYear?.id,isGVCN,currentUser?.id,currentUser?.assigned_class_id,campus,classFilter]);
  useEffect(()=>{
    const id=++request.current;
    setLoading(true);setError('');setWarning('');setSnapshot(undefined);setAnswer('');
    if(!currentUser) {setLoading(false);return;}
    void loadOperationsData(date,scope).then(data=>{
      if(id!==request.current)return;
      setSnapshot(buildOperationsSnapshot(date,scope,data.reports,data.values,indicators,data.boarding));
      setWarning(data.boardingWarning);
    }).catch(e=>{if(id===request.current)setError(e.message||'Không tải được dữ liệu.');})
      .finally(()=>{if(id===request.current)setLoading(false);});
    return ()=>{++request.current;};
  },[date,scope,indicators,revision,currentUser?.id]);
  const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  const calendarNotice = weekday === 0 || weekday === 6 && settings?.allow_gvcn_report_saturday !== true ? 'Ngày cuối tuần: kiểm tra lịch học thực tế. Danh sách chưa báo là thông tin tra cứu, không tự kết luận lớp chậm nộp hoặc trừ thi đua.' : '';
  const brief=snapshot?operationsBrief(snapshot,settings?.school_name||'Nhà trường'):'';
  const copy=async()=>{try{await navigator.clipboard.writeText(brief);setCopied('Đã sao chép dự thảo.');}catch{setCopied('Không sao chép được. Có thể chọn và sao chép nội dung bên dưới.');}};
  const ask=(q:string)=>{setQuestion(q);setAnswer(snapshot?answerOperationsQuestion(q,snapshot):'Chưa có dữ liệu máy chủ để trả lời.');setTab('assistant');};
  const t=snapshot?.totals;
  const visibleClasses=classes.filter(c=>c.active&&(!isGVCN||c.homeroom_teacher_id===currentUser?.id||!!currentUser?.assigned_class_id&&matchClassReport(currentUser.assigned_class_id,c))&&(!activeYear||c.school_year_id===activeYear.id));
  return <div className="space-y-5 pb-8">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-800 p-5 text-white shadow-lg sm:p-8">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-200"><Sparkles size={16}/> TRỢ LÝ DỮ LIỆU NHÀ TRƯỜNG</div>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Nắm tình hình. Kiểm tra đúng. Xử lý kịp thời.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">Sĩ số, lớp chưa báo và các chênh lệch được đối chiếu từ máy chủ. Mỗi kết quả gắn với ngày và phạm vi dữ liệu đang chọn.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold">Ngày báo cáo<input aria-label="Ngày báo cáo" type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} className="mt-1 block rounded-xl bg-white px-3 py-2.5 text-sm text-slate-900"/></label>
        {!isGVCN&&<label className="text-xs font-bold">Phân hiệu<select aria-label="Phân hiệu" value={campus} onChange={e=>setCampus(e.target.value)} className="mt-1 block max-w-56 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-900"><option value="all">Tất cả phân hiệu</option>{campuses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label className="text-xs font-bold">Lớp<select aria-label="Lớp" value={classFilter} onChange={e=>setClassFilter(e.target.value)} className="mt-1 block rounded-xl bg-white px-3 py-2.5 text-sm text-slate-900"><option value="all">{isGVCN?'Lớp được giao':'Tất cả lớp'}</option>{visibleClasses.map(c=><option key={c.id} value={c.id}>{c.class_name}</option>)}</select></label>
        <button type="button" disabled={loading} onClick={()=>setRevision(x=>x+1)} className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading?'animate-spin':''}/>Làm mới</button>
      </div>
    </section>
    <nav aria-label="Chức năng trợ lý" className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">
      {([['overview','Tình hình & đối chiếu'],['assistant','Hỏi dữ liệu'],['report','Dự thảo báo cáo']] as const).map(([id,label])=><button type="button" key={id} onClick={()=>setTab(id)} aria-pressed={tab===id} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold ${tab===id?'bg-blue-900 text-white':'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
    </nav>
    {calendarNotice&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{calendarNotice}</p>}
    {error&&<div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error} <button type="button" className="ml-2 underline" onClick={()=>setRevision(x=>x+1)}>Thử lại</button></div>}
    {loading&&<div role="status" className="rounded-2xl bg-white p-10 text-center text-slate-600">Đang đối chiếu dữ liệu máy chủ…</div>}
    {snapshot&&!loading&&<>
      <p className="text-xs text-slate-500">Nguồn: daily_reports, daily_report_values{!warning?' và boarding_reports':''} · Ngày {formatDateVN(snapshot.date)} · {snapshot.rows.length} lớp · Kiểm tra {new Date(snapshot.checkedAt).toLocaleTimeString('vi-VN')} · Năm học {activeYear?.name||'theo cấu hình lớp'}</p>
      {warning&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      {tab==='overview'&&<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Đã báo hợp lệ',`${t!.reported}/${t!.classes}`,'text-blue-800'],['Chưa báo / cần kiểm tra',`${t!.missing+t!.incomplete} lớp`,'text-amber-700'],['Học sinh vắng',String(t!.absent),'text-rose-700'],['Tỷ lệ có mặt',t!.rate===null?'Chưa có':`${t!.rate}%`,'text-emerald-700']].map(([label,value,color])=><div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</p></div>)}
        </div>
        <p className="text-sm text-slate-600">Có mặt {t!.present} / tổng {t!.total} học sinh <strong>trong các lớp đã báo hợp lệ</strong>. Lớp chưa báo không được tính là có mặt đủ.</p>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b p-4 font-bold text-slate-900"><ClipboardCheck size={20}/>Theo dõi từng lớp</div>
          {!snapshot.rows.length&&<p className="p-6 text-slate-500">Chưa có lớp thuộc phạm vi này.</p>}
          <div className="divide-y">{snapshot.rows.map(r=><article key={r.classItem.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 px-3 py-2 font-extrabold text-slate-800">{r.classItem.class_name}</span><div><p className={`text-sm font-bold ${r.state==='valid'?'text-emerald-700':'text-amber-700'}`}>{r.state==='valid'?'Đã báo hợp lệ':r.state==='missing'?'Chưa báo cáo':'Chưa hoàn chỉnh'}</p><p className="text-xs text-slate-500">{r.state==='valid'?`Tổng ${r.total} · Có mặt ${r.present} · Vắng ${r.absent}`:'Chưa đưa vào tổng hợp chuyên cần'}</p></div></div><button type="button" onClick={()=>onSelectClass(r.classItem.id,date)} className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Mở báo cáo<ArrowRight size={14}/></button></div>
            {r.issues.map(issue=><p key={issue} className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{issue}</p>)}
          </article>)}</div>
        </section>
      </>}
      {tab==='assistant'&&<section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Sparkles size={20}/>Hỏi nhanh, trả lời từ dữ liệu đã xác nhận</h2>
        <div className="my-4 flex flex-wrap gap-2">{['Lớp nào chưa báo?','Kiểm tra sai lệch','Danh sách học sinh vắng','Tổng hợp sĩ số hôm nay'].map(q=><button type="button" key={q} onClick={()=>ask(q)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{q}</button>)}</div>
        <form onSubmit={e=>{e.preventDefault();ask(question);}} className="flex gap-2"><input aria-label="Câu hỏi về dữ liệu" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ví dụ: lớp nào chưa báo sĩ số?" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm"/><button aria-label="Gửi câu hỏi" className="rounded-xl bg-blue-900 px-4 text-white"><Search size={18}/></button></form>
        {answer&&<div aria-live="polite" className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-800">{answer}</div>}
        <p className="mt-4 text-xs leading-5 text-slate-500">Trợ lý nhận diện nhóm câu hỏi và diễn giải số liệu bằng quy tắc. Không gửi tên học sinh sang dịch vụ AI bên ngoài. Chưa hỗ trợ câu hỏi mọi chủ đề hoặc kỳ chưa được tải.</p>
      </section>}
      {tab==='report'&&<section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-slate-900">Dự thảo báo cáo ngày</h2><button type="button" onClick={()=>void copy()} className="flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white"><Copy size={16}/>Sao chép / chia sẻ Zalo</button></div>{copied&&<p role="status" className="mt-3 text-sm text-blue-800">{copied}</p>}<textarea aria-label="Dự thảo báo cáo" readOnly value={brief} rows={16} className="mt-4 w-full resize-y rounded-xl border bg-slate-50 p-4 text-sm leading-7 text-slate-800"/><p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14}/>Giáo viên kiểm tra nội dung trước khi gửi. Chức năng này không tự gửi tin nhắn.</p></section>}
    </>}
  </div>;
}
