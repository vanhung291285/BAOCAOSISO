import test from 'node:test';
import assert from 'node:assert/strict';
import {compareResearchWeeks} from '../src/services/researchEvidence';
const row=(id:string,days:number,present:number,absent:number)=>({classItem:{id},totalSessionsReported:days,sumPresent:present,sumAbsent:absent}) as any;
test('research excludes unmatched classes and unequal or insufficient reporting days',()=>{
 const r=compareResearchWeeks([row('a',3,90,10),row('b',2,80,20),row('c',4,60,40),row('d',5,100,0)],[row('a',3,80,20),row('b',2,70,30),row('c',3,50,50)],3);
 assert.equal(r.matched,1);assert.equal(r.excluded,3);assert.equal(r.change,10);
});
test('missing observations never become a zero percent research conclusion',()=>{
 assert.equal(compareResearchWeeks([],[],3).change,null);
 assert.equal(compareResearchWeeks([row('a',3,0,0)],[row('a',3,0,0)],3).change,null);
});
