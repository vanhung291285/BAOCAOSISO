import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {create,act} from 'react-test-renderer';

test('GVCN opens the default school conversation on mobile before and after history arrives',async()=>{
 const file=new URL('../node_modules/.cache/staff-chat-opening.mjs',import.meta.url);
 await mkdir(new URL('.',file),{recursive:true});
 await build({entryPoints:['src/components/StaffChat.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file.pathname,plugins:[{name:'synthetic-contexts',setup(b){
  const modules:Record<string,string>={
   '../services/supabase':'export const getSupabaseClient=()=>null;',
   '../contexts/AuthContext':`export const useAuth=()=>({currentUser:{id:'teacher',full_name:'Synthetic teacher',role:'GVCN',assigned_class_id:'c1'},allUsers:[],logout(){}});`,
   '../contexts/SchoolContext':`export const useSchool=()=>({classes:[]});`,
   '../contexts/StaffChatUIContext':`const updateUnread=()=>{};export const useStaffChatUI=()=>({updateUnread,openRequest:0});`,
   '../services/staffChat':`export class ChatError extends Error{};export const chatRequest=(...args)=>globalThis.__chatRequest(...args);`,
  };
  b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'test-stub'}:undefined);
  b.onLoad({filter:/.*/,namespace:'test-stub'},args=>({contents:modules[args.path],loader:'js'}));
 }}]});
 const globals=globalThis as any,oldWindow=globals.window,oldDocument=globals.document;
 globals.IS_REACT_ACT_ENVIRONMENT=true;
 globals.window={innerWidth:375,addEventListener(){},removeEventListener(){}};
 globals.document={visibilityState:'visible',activeElement:null,addEventListener(){},removeEventListener(){}};
 let resolveHistory:(value:any)=>void=()=>{},historyCalls=0;
 const account={id:'teacher-account',profile_id:'teacher',display_name:'Synthetic teacher',role_label:'GVCN'};
 globals.__chatRequest=async(body:any)=>{
  if(body.action==='teacher-session')return {account};
  if(body.action==='inbox')return {contacts:[],threads:[]};
  if(body.action==='history'){historyCalls++;return new Promise(resolve=>{resolveHistory=resolve;});}
  return {ok:true};
 };
 let renderer:ReturnType<typeof create>|undefined;
 try{
  const {StaffChat}=await import(pathToFileURL(file.pathname).href);
  await act(async()=>{renderer=create(React.createElement(StaffChat,{onOpen(){}}));});
  const button=(label:string)=>renderer!.root.findAllByType('button').find(n=>n.props['aria-label']===label)!;
  await act(async()=>{button('Mở tin nhắn nội bộ').props.onClick();});
  assert.equal(historyCalls,1);
  await act(async()=>{button('Mở cuộc trò chuyện: Thông báo toàn trường').props.onClick();});
  await act(async()=>{resolveHistory({messages:[{id:'m1',sender_id:'admin',recipient_id:null,body:'Synthetic announcement',created_at:'2026-11-16T01:00:00Z'}]});});
  assert(JSON.stringify(renderer!.toJSON()).includes('Synthetic announcement'));
  await act(async()=>{button('Mở cuộc trò chuyện: Thông báo toàn trường').props.onClick();});
  assert(JSON.stringify(renderer!.toJSON()).includes('Synthetic announcement'));
 }finally{
  if(renderer)await act(async()=>renderer!.unmount());
  globals.window=oldWindow;globals.document=oldDocument;delete globals.__chatRequest;delete globals.IS_REACT_ACT_ENVIRONMENT;
  await rm(file,{force:true});
 }
});
