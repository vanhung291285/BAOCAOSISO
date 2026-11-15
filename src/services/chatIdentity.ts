import type {Profile,ClassItem} from '../types';
export function chatIdentity(account:{profile_id?:string;id?:string;display_name?:string;role_label?:string}|null|undefined,profiles:Profile[],classes:ClassItem[]){
 if(!account)return {name:'Tài khoản nhà trường',detail:'Chưa có thông tin lớp',label:'Tài khoản nhà trường'};
 const profile=profiles.find(p=>p.id===(account.profile_id||account.id));
 const role=account.role_label||profile?.role;
 const cls=classes.find(c=>c.id===profile?.assigned_class_id)||classes.find(c=>c.homeroom_teacher_id===(profile?.id||account.profile_id));
 const name=account.display_name||profile?.full_name||'Tài khoản nhà trường';
 const detail=role==='GVCN'?`GVCN · ${cls?`Lớp ${cls.class_name}`:'Chưa phân công lớp'}`:role==='ADMIN'?'Quản trị nhà trường':role==='BGH'?'Ban Giám hiệu':'Tài khoản nhà trường';
 return {name,detail,label:`${name} — ${detail}`};
}
