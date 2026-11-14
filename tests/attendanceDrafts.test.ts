import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftKey,writeDraft,readDraft,removeDraft,type AttendanceDraft} from '../src/services/attendanceDrafts';
test('drafts survive reload and retain base version and retry token',async()=>{
 const key=draftKey('project','year','teacher','class','2026-11-14');
 const draft:AttendanceDraft={key,userId:'teacher',classId:'class',date:'2026-11-14',updatedAt:new Date().toISOString(),baseVersion:'old-version',requestId:'same-request',values:{all:{total:30,present:29,absent:1}},notes:'Bản nháp',absentStudents:[{full_name:'Học sinh thử',reason:'Ốm'}]};
 await writeDraft(draft);assert.deepEqual(await readDraft(key),draft);
 assert.equal(await readDraft(draftKey('project','year','another-teacher','class','2026-11-14')),undefined);
 assert.equal(await readDraft(draftKey('project','next-year','teacher','class','2026-11-14')),undefined);
 assert.equal(await readDraft(draftKey('other-project','year','teacher','class','2026-11-14')),undefined);
 await removeDraft(key);assert.equal(await readDraft(key),undefined);
});
