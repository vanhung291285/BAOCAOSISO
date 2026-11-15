import React,{createContext,useCallback,useContext,useState} from 'react';
import {useAuth} from './AuthContext';
interface ChatUI {unreadCount:number;updateUnread:(count:number)=>void;openRequest:number;openChat:()=>void}
const Context=createContext<ChatUI|null>(null);
export function StaffChatUIProvider({children}:{children:React.ReactNode}){
 const {currentUser}=useAuth();
 const [badge,setBadge]=useState({ownerId:'',count:0}),[openState,setOpenState]=useState({ownerId:'',sequence:0});
 const updateUnread=useCallback((count:number)=>setBadge({ownerId:currentUser?.id||'',count:Math.max(0,Math.floor(Number(count)||0))}),[currentUser?.id]);
 const openChat=useCallback(()=>setOpenState(prev=>({ownerId:currentUser?.id||'',sequence:prev.sequence+1})),[currentUser?.id]);
 return <Context.Provider value={{unreadCount:badge.ownerId===currentUser?.id?badge.count:0,updateUnread,openRequest:openState.ownerId===currentUser?.id?openState.sequence:0,openChat}}>{children}</Context.Provider>;
}
export function useStaffChatUI(){const value=useContext(Context);if(!value)throw new Error('Missing StaffChatUIProvider');return value;}
