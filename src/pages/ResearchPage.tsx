import { useEffect, useState } from 'react';
import { StorageService, subscribeRealtime } from '../services/storage';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { attendanceRate, compareResearchWeeks, sampleResearchWeeks, toResearchRow } from '../services/researchEvidence';
import type { ResearchRow } from '../services/researchEvidence';

type ResearchData = { current: ResearchRow[]; baseline: ResearchRow[] };
const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const formatRate = (rate: number | null) => rate === null ? 'Chưa có dữ liệu' : numberFormat.format(rate) + '%';
const controlClass = 'rounded-lg border border-slate-300 bg-white p-2';

export function ResearchPage() {
  const { settings, classes } = useSchool();
  const { currentUser, isAdmin, isBGH } = useAuth();
  const [demo, setDemo] = useState(true);
  const [liveWeek, setLiveWeek] = useState(11);
  const [liveBaselineWeek, setLiveBaselineWeek] = useState(10);
  const [weekOrder, setWeekOrder] = useState<'11' | '10'>('11');
  const [threshold, setThreshold] = useState(90);
  const [minimumDays, setMinimumDays] = useState(3);
  const [live, setLive] = useState<{ key: string; data: ResearchData } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fullScope = isAdmin || isBGH;
  const scope = fullScope ? undefined : classes.find(item =>
    currentUser && (item.id === currentUser.assigned_class_id || item.homeroom_teacher_id === currentUser.id)
  )?.id;
  const week = demo ? Number(weekOrder) : liveWeek;
  const baselineWeek = demo ? 21 - week : liveBaselineWeek;
  const weekStart = settings.week1_start_date;
  const requestKey = JSON.stringify([currentUser?.id, fullScope, scope, week, baselineWeek, weekStart]);
  const liveAllowed = Boolean(currentUser && (fullScope || scope));

  useEffect(() => {
    if (demo || !liveAllowed || week === baselineWeek) return;

    let disposed = false;
    let running = false;
    let queued = false;
    async function load() {
      if (disposed) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      setLoading(true);
      try {
        const [current, baseline] = await Promise.all([
          StorageService.getWeeklyAggregate(week, weekStart, undefined, scope, true),
          StorageService.getWeeklyAggregate(baselineWeek, weekStart, undefined, scope, true),
        ]);
        if (!disposed) {
          setLive({
            key: requestKey,
            data: {
              current: current.classesSummary.map(toResearchRow),
              baseline: baseline.classesSummary.map(toResearchRow),
            },
          });
          setFailure(null);
        }
      } catch {
        if (!disposed) setFailure({ key: requestKey, message: 'Chưa tải được dữ liệu. Hệ thống sẽ tự thử lại.' });
      } finally {
        running = false;
        if (!disposed) {
          setLoading(false);
          if (queued) {
            queued = false;
            void load();
          }
        }
      }
    }

    void load();
    const stop = subscribeRealtime(event => {
      if (['daily_reports', 'daily_report_values'].includes(event.table)) void load();
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => {
      disposed = true;
      stop();
      window.clearInterval(timer);
    };
  }, [demo, liveAllowed, requestKey, week, baselineWeek, weekStart, scope]);

  const data = demo ? { current: sampleResearchWeeks[week], baseline: sampleResearchWeeks[baselineWeek] }
    : liveAllowed && week !== baselineWeek && live?.key === requestKey ? live.data : null;
  const error = demo ? ''
    : !liveAllowed ? 'Tài khoản chưa có phạm vi xem dữ liệu nghiên cứu.'
    : week === baselineWeek ? 'Hãy chọn hai tuần khác nhau.'
    : failure?.key === requestKey ? failure.message : '';
  const evidence = data ? compareResearchWeeks(data.current, data.baseline, minimumDays) : null;

  function exportData() {
    if (!data || !evidence || error) return;
    const lines = [[
      'Nguồn dữ liệu', 'Mã lớp', 'Vai trò tuần', 'Tuần', 'Ngày đã báo cáo',
      'Lượt có mặt', 'Lượt vắng', 'Chuyên cần (%)', 'Đủ điều kiện đối chiếu',
      'Ngưỡng cảnh báo (%)', 'Số ngày tối thiểu',
    ]];
    const baselineById = new Map(data.baseline.map(row => [row.id, row]));
    for (const [index, row] of data.current.entries()) {
      const other = baselineById.get(row.id);
      const append = (item: ResearchRow, period: number, label: string) => {
        const rate = attendanceRate(item.present, item.absent);
        lines.push([
          demo ? 'Mô phỏng' : 'Vận hành', 'L' + (index + 1), label, String(period),
          String(item.days), String(item.present), String(item.absent),
          rate === null ? '' : rate.toFixed(2),
          evidence.matchedIds.has(row.id) ? 'Có' : 'Không', String(threshold), String(minimumDays),
        ]);
      };
      append(row, week, 'Nghiên cứu');
      if (other) append(other, baselineWeek, 'Đối chiếu');
    }
    const csv = '\ufeff' + lines.map(line => line.join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = (demo ? 'mo-phong' : 'nghien-cuu') + '-tuan-' + week + '-' + baselineWeek + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header className="rounded-2xl bg-teal-900 p-6 text-white">
        <h1 className="text-2xl font-bold">Nghiên cứu chuyên cần học sinh vùng cao</h1>
        <p className="mt-2">Thử nghiệm cách chọn ngưỡng cảnh báo và đối chiếu tỷ lệ chuyên cần giữa hai tuần.</p>
      </header>

      <section className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-semibold">
            Nguồn dữ liệu{' '}
            <select className={controlClass} value={demo ? 'demo' : 'live'} onChange={event => {
              setLive(null);
              setFailure(null);
              setDemo(event.target.value === 'demo');
            }}>
              <option value="demo">Mô phỏng trình diễn</option>
              <option value="live">Báo cáo vận hành</option>
            </select>
          </label>
          {demo && <span className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Số liệu mô phỏng</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {demo ? (
            <label className="grid gap-1 sm:col-span-2">
              Hai tuần mô phỏng
              <select className={controlClass} value={weekOrder} onChange={event => setWeekOrder(event.target.value === '10' ? '10' : '11')}>
                <option value="11">Tuần 11 so với tuần 10</option>
                <option value="10">Tuần 10 so với tuần 11</option>
              </select>
            </label>
          ) : (
            <>
              <label className="grid gap-1">Tuần nghiên cứu
                <select className={controlClass} value={week} onChange={event => setLiveWeek(Number(event.target.value))}>
                  {Array.from({ length: 52 }, (_, index) => <option key={index}>{index + 1}</option>)}
                </select>
              </label>
              <label className="grid gap-1">Tuần đối chiếu
                <select className={controlClass} value={baselineWeek} onChange={event => setLiveBaselineWeek(Number(event.target.value))}>
                  {Array.from({ length: 52 }, (_, index) => <option key={index}>{index + 1}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="grid gap-1">Ngưỡng cảnh báo (%)
            <input className={controlClass} type="number" min={1} max={100} value={threshold}
              onChange={event => setThreshold(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
          </label>
          <label className="grid gap-1">Số ngày tối thiểu
            <select className={controlClass} value={minimumDays} onChange={event => setMinimumDays(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <button onClick={exportData} disabled={!data?.current.length || Boolean(error) || (!demo && loading)}
          className="rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
          Tải CSV theo mã lớp
        </button>
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
      {!demo && !error && (!data || loading) && <p role="status">Đang cập nhật báo cáo…</p>}
      {data && evidence && !error && (
        <>
          <section className="space-y-3 rounded-xl border bg-blue-50 p-5">
            <h2 className="font-bold">So sánh trên cùng nhóm lớp</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <p>Tuần {week}<br /><strong>{formatRate(evidence.currentRate)}</strong></p>
              <p>Tuần {baselineWeek}<br /><strong>{formatRate(evidence.baselineRate)}</strong></p>
              <p>Thay đổi<br /><strong>{evidence.change === null ? 'Chưa đủ dữ liệu' :
                (evidence.change > 0 ? '+' : '') + numberFormat.format(evidence.change) + ' điểm phần trăm'}</strong></p>
            </div>
            <p>{evidence.matched} lớp đủ điều kiện, {evidence.excluded} lớp nằm ngoài phép so sánh.</p>
            <p className="text-sm">Mỗi lớp cần có dữ liệu điểm danh ở cả hai tuần. Số ngày đã báo phải bằng nhau và đạt mức tối thiểu. Tỷ lệ chung bằng tổng lượt có mặt chia cho tổng lượt điểm danh của các lớp đủ điều kiện.</p>
          </section>
          <section className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="p-4 text-left font-bold">Theo dõi từng lớp trong tuần {week}</caption>
              <thead><tr>{['Lớp', 'Ngày đã báo', 'Lượt có mặt', 'Lượt vắng', 'Chuyên cần', 'Cảnh báo', 'Đối chiếu'].map(label =>
                <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
              <tbody>
                {data.current.map(row => {
                  const rate = attendanceRate(row.present, row.absent);
                  return <tr key={row.id} className="border-t">
                    <th scope="row" className="p-3">{row.name}</th>
                    <td>{row.days}</td><td>{row.present}</td><td>{row.absent}</td><td>{formatRate(rate)}</td>
                    <td>{row.days < minimumDays || rate === null ? 'Chưa đủ dữ liệu' : rate < threshold ? 'Cần xác minh' : 'Theo dõi'}</td>
                    <td>{evidence.matchedIds.has(row.id) ? 'Đủ điều kiện' : 'Thiếu điều kiện'}</td>
                  </tr>;
                })}
                {!data.current.length && <tr><td colSpan={7} className="p-4">Chưa có dữ liệu lớp trong tuần này.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold">Bài thực nghiệm cho nhóm học sinh</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Đặt câu hỏi liệu cảnh báo theo ngưỡng có giúp giáo viên xác minh trường hợp cần hỗ trợ sớm hơn.</li>
          <li>Thử số ngày tối thiểu lần lượt là 2, 3 và 5 với dữ liệu mô phỏng. Ghi lại số lớp đủ điều kiện và giải thích sự thay đổi.</li>
          <li>Thống nhất trước ngưỡng cảnh báo, tuần lấy số liệu và cách đo thời gian từ lúc có báo cáo đến khi giáo viên xác minh.</li>
          <li>Khi thử nghiệm thực tế, ghi lịch nghỉ, mức độ đầy đủ của báo cáo và số cảnh báo đã được giáo viên xác nhận. Dùng số liệu tổng hợp khi trình bày.</li>
        </ol>
        <p className="text-sm text-slate-700">Đây là cảnh báo theo quy tắc ở cấp lớp. So sánh hai tuần cho thấy mức thay đổi quan sát được. Để đánh giá tác động của giải pháp, nhóm cần ghi nhận thêm lịch nghỉ, thay đổi sĩ số và các biện pháp hỗ trợ đã áp dụng.</p>
      </section>
    </main>
  );
}
