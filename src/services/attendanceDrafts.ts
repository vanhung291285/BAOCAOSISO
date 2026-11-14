import type { AbsentStudent } from '../types';
export interface AttendanceDraft {
  key: string; userId: string; classId: string; date: string; updatedAt: string;
  baseVersion: string | null; requestId?: string;
  values: Record<string, {total: number | ''; present: number | ''; absent: number | ''}>;
  notes: string; absentStudents: AbsentStudent[];
}
export const draftKey = (project: string, year: string, user: string, cls: string, date: string) =>
  JSON.stringify([project, year, user, cls, date]);
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Thiết bị không hỗ trợ lưu bản nháp.'));
    const req = indexedDB.open('siso-attendance-drafts',1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts',{ keyPath:'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function access<T>(mode: IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest):Promise<T> {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('drafts',mode);
    const request = action(tx.objectStore('drafts'));
    tx.oncomplete = () => { db.close(); resolve(request.result as T); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Không lưu được bản nháp.')); };
  });
}
export const readDraft = (key:string) => access<AttendanceDraft | undefined>('readonly',s=>s.get(key));
export const writeDraft = (draft:AttendanceDraft) => access<IDBValidKey>('readwrite',s=>s.put(draft));
export const removeDraft = (key:string) => access<undefined>('readwrite',s=>s.delete(key));
