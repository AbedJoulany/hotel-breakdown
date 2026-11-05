import test from "node:test";
import assert from "node:assert/strict";
import {createCorrectionLedger,appendCorrection,replayCorrections} from "../src/corrections/correctionEngine.js";
const source=()=>[{id:"source-1",groupId:"A",reportDate:"2026-11-10",roomNumber:"0304",reservationId:"R1",guestName:"Guest",roomType:"DBL",occupancy:{adults:2,children:0,babies:0},reportedRate:200,currency:"USD"}];
const event=(id,type,extra={})=>({id,type,reason:"Verified against hotel records",timestamp:"2026-11-05T12:00:00Z",...extra});
const ledger=()=>createCorrectionLedger(source(),[{room:"304",guest:"Guest",amount:200,currency:"USD"}]);
const addNight=()=>({...source()[0],id:"manual-11",reportDate:"2026-11-11"});
test("add night without mutating original",()=>{
 const original=source(),l=createCorrectionLedger(original);
 const next=appendCorrection(l,event("c1","ADD_NIGHT",{night:addNight()}));
 assert.equal(replayCorrections(next).nights.length,2);
 assert.equal(original.length,1);assert.equal(l.events.length,0);
});
test("prevent duplicate room night even with different ID",()=>{
 assert.throws(()=>appendCorrection(ledger(),event("c1","ADD_NIGHT",{night:{...addNight(),reportDate:"2026-11-10"}})),/already exists/);
});
test("edit rate and occupancy with before/after audit",()=>{
 const l=appendCorrection(ledger(),event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:180,occupancy:{adults:1,children:0,babies:0}}}));
 const result=replayCorrections(l);assert.equal(result.nights[0].reportedRate,180);
 assert.equal(result.audit[0].before.reportedRate,200);assert.equal(result.audit[0].after.occupancy.adults,1);
});
test("exclude preserves source and audit evidence",()=>{
 const l=appendCorrection(ledger(),event("c1","EXCLUDE_NIGHT",{nightId:"source-1"}));
 assert.equal(replayCorrections(l).nights.length,0);assert.equal(l.sourceNights.length,1);
});
test("undo replays source without erasing history",()=>{
 const edited=appendCorrection(ledger(),event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:180}}));
 const undone=appendCorrection(edited,event("c2","UNDO",{targetEventId:"c1"}));
 assert.equal(replayCorrections(undone).nights[0].reportedRate,200);
 assert.equal(replayCorrections(undone).audit[0].status,"UNDONE");
 assert.equal(undone.events.length,2);
});
test("split stay explicitly and link Folio",()=>{
 const l=appendCorrection(ledger(),event("c1","SPLIT_STAY",{nightId:"source-1",newStayId:"STAY-B"}));
 const linked=appendCorrection(l,event("c2","LINK_FOLIO",{folioIndex:0,stayId:"STAY-B"}));
 assert.equal(replayCorrections(linked).folioLinks["0"],"STAY-B");
});
test("invalid Folio links rejected",()=>assert.throws(()=>appendCorrection(ledger(),event("c1","LINK_FOLIO",{folioIndex:0,stayId:"missing"})),/unknown stay/));
test("missing reasons rejected",()=>assert.throws(()=>appendCorrection(ledger(),event("c1","EXCLUDE_NIGHT",{nightId:"source-1",reason:""})),/metadata/));
test("duplicate correction IDs rejected",()=>{
 const l=appendCorrection(ledger(),event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:180}}));
 assert.throws(()=>appendCorrection(l,event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:190}})),/metadata/);
});
test("cannot undo an undo or undo twice",()=>{
 const l=appendCorrection(ledger(),event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:180}}));
 const u=appendCorrection(l,event("c2","UNDO",{targetEventId:"c1"}));
 assert.throws(()=>appendCorrection(u,event("c3","UNDO",{targetEventId:"c1"})),/already undone/);
 assert.throws(()=>appendCorrection(u,event("c4","UNDO",{targetEventId:"c2"})),/existing correction/);
});
test("cannot edit unsupported fields or invalid amounts",()=>{
 assert.throws(()=>appendCorrection(ledger(),event("c1","EDIT_NIGHT",{nightId:"source-1",changes:{reportDate:"2026-11-12"}})),/Invalid night edit/);
 assert.throws(()=>appendCorrection(ledger(),event("c2","EDIT_NIGHT",{nightId:"source-1",changes:{reportedRate:-1}})),/Invalid rate/);
});
