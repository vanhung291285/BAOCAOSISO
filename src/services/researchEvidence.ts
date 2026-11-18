import type {ClassWeeklySummary} from '../types';
export function compareResearchWeeks(current:ClassWeeklySummary[],baseline:ClassWeeklySummary[],minimumDays:number){
 const matched=current.flatMap(c=>{const b=baseline.find(x=>x.classItem.id===c.classItem.id);return b&&c.totalSessionsReported>=minimumDays&&b.totalSessionsReported>=minimumDays&&c.totalSessionsReported===b.totalSessionsReported?[{current:c,baseline:b}]:[];});
 const rate=(key:'current'|'baseline')=>{const present=matched.reduce((s,r)=>s+r[key].sumPresent,0),absent=matched.reduce((s,r)=>s+r[key].sumAbsent,0);return present+absent>0?100*present/(present+absent):null;};
 const a=rate('current'),b=rate('baseline');
 return {matched:matched.length,excluded:current.length-matched.length,currentRate:a,baselineRate:b,change:a===null||b===null?null:Math.round((a-b)*10)/10};
}
