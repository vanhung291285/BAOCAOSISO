import test from 'node:test';
import assert from 'node:assert/strict';
import {chatIdentity} from '../src/services/chatIdentity';
test('chat identity shows teacher name and assigned class, with explicit missing assignment',()=>{
 const teacher:any={id:'t1',full_name:'Trần Tho',role:'GVCN',assigned_class_id:'c1'};
 const classes:any=[{id:'c1',class_name:'7B1',homeroom_teacher_id:'t1'}];
 assert.equal(chatIdentity({profile_id:'t1',display_name:'Trần Tho',role_label:'GVCN'},[teacher],classes).label,'Trần Tho — GVCN · Lớp 7B1');
 assert.match(chatIdentity({profile_id:'t1',role_label:'GVCN'},[teacher],[]).detail,/Chưa phân công lớp/);
 assert.equal(chatIdentity({display_name:'Vũ Văn Hùng',role_label:'ADMIN'},[],[]).label,'Vũ Văn Hùng — Quản trị nhà trường');
});
