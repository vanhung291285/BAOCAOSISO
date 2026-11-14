import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveTeacherName} from '../src/utils/teacherNames';
test('reports never invent a teacher name when configuration is missing',()=>{
 assert.equal(resolveTeacherName('6A1','GVCN Lớp 6A1'),'Chưa phân công');
 assert.equal(resolveTeacherName('9D8',null),'Chưa phân công');
 assert.equal(resolveTeacherName('6A1',{full_name:'Lường Văn Hà'}),'Lường Văn Hà');
 assert.equal(resolveTeacherName('6A1',null,'Tên đã xác nhận'),'Tên đã xác nhận');
});
