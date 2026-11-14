import React, { useEffect, useRef, useState } from 'react';
import { readDraft, writeDraft, removeDraft, type AttendanceDraft } from '../services/attendanceDrafts';
interface Props { draft:AttendanceDraft; dirty:boolean; ready:boolean; onRestore:(d:AttendanceDraft)=>void; onReload:()=>void; conflict:boolean; }
export function AttendanceDraftPanel({draft,dirty,ready,onRestore,onReload,conflict}:Props) {
  const [pending,setPending] = useState<AttendanceDraft>();
  const [message,setMessage] = useState('');
  const [online,setOnline] = useState(navigator.onLine);
  const generation = useRef(0);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online',update); window.addEventListener('offline',update);
    return () => { window.removeEventListener('online',update); window.removeEventListener('offline',update); };
  },[]);
  useEffect(() => {
    const id = ++generation.current;
    setPending(undefined); setMessage('');
    void readDraft(draft.key).then(d => { if (id===generation.current) setPending(d); })
      .catch(() => { if(id===generation.current) setMessage('Không đọc được bản nháp trên thiết bị này.'); });
    return () => { ++generation.current; };
  },[draft.key]);
  useEffect(() => {
    if (!ready || !dirty) return;
    const id = generation.current;
    const timer=setTimeout(() => {
      void writeDraft(draft).then(() => { if(id===generation.current) setMessage('Đã giữ bản nháp trên thiết bị — chưa gửi máy chủ.'); })
        .catch(()=> { if(id===generation.current) setMessage('Không lưu được bản nháp. Giữ màn hình mở và kiểm tra bộ nhớ thiết bị.'); });
    },500);
    return () => clearTimeout(timer);
  },[draft.key, draft.values, draft.notes, draft.absentStudents, draft.baseVersion, dirty, ready]);
  useEffect(() => {
    const warn = (e:BeforeUnloadEvent) => { if(dirty) { e.preventDefault(); e.returnValue=''; } };
    window.addEventListener('beforeunload',warn); return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  return <section className="mx-auto my-3 max-w-5xl rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm" aria-live="polite">
    <div className="font-bold text-blue-950">{online ? 'Đang có mạng' : 'Đang mất mạng — bản nháp chưa được gửi'}</div>
    <p className="mt-1 text-blue-800">{message || (dirty ? 'Đang giữ bản nháp…' : 'Chỉ hiển thị đã gửi sau khi máy chủ xác nhận.')}</p>
    {pending && ready && !dirty && <div className="mt-2 flex flex-wrap items-center gap-2">
      <span>Có bản nháp ngày {pending.date} lúc {new Date(pending.updatedAt).toLocaleTimeString('vi-VN')}.</span>
      <button type="button" className="rounded-lg bg-blue-800 px-3 py-2 font-bold text-white" onClick={()=>{onRestore(pending);setPending(undefined);}}>Khôi phục bản nháp</button>
      <button type="button" className="rounded-lg border px-3 py-2" onClick={()=>{ void removeDraft(draft.key).then(()=>setPending(undefined)).catch(()=>setMessage('Chưa xóa được bản nháp.')); }}>Bỏ bản nháp</button>
    </div>}
    {conflict && <div className="mt-2 text-rose-800"><p>Bản máy chủ đã thay đổi. Bản nháp của bạn vẫn được giữ; tải bản máy chủ để đối chiếu trước khi nhập lại phần cần sửa.</p><button type="button" className="mt-2 rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-rose-300" onClick={onReload}>Tải bản máy chủ để đối chiếu</button></div>}
  </section>;
}
