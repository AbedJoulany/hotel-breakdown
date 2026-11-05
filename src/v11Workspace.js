import {auditRoomNights} from "./audit/roomNightEngine.js";
import {auditContractRates} from "./audit/rateAudit.js";
import {createCorrectionLedger,appendCorrection,replayCorrections} from "./corrections/correctionEngine.js";
import {saveWorkspace,loadWorkspace,downloadBackup,importBackup} from "./workspaceStorage.js";

const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let snapshot={reports:[],folioRecords:[],corrections:[],rates:[]},timer=null,ledger=null,latest=null;
const status=s=>{$("v11Status").textContent=s;};
function persist(){clearTimeout(timer);timer=setTimeout(async()=>{try{await saveWorkspace(snapshot);status("Saved locally · "+new Date().toLocaleTimeString());}catch(e){status("Local save failed: "+e.message);}},400);}
function source(){return snapshot.reports.flatMap(r=>r.structuredRecords||[]).filter(r=>Number(r.rms)>0);}
function redraw(){
 const group=$("groupSelect").value;
 const records=source().filter(r=>r.group===group);
 const base=auditRoomNights(records);
 try{
   ledger=createCorrectionLedger(base.nights,snapshot.folioRecords);
   for(const correction of snapshot.corrections.filter(e=>e.group===group))ledger=appendCorrection(ledger,correction);
   const corrected=replayCorrections(ledger);
   const stays=auditRoomNights([]).stays; // reconstructed below from corrected nights
   const active=corrected.nights;
   const byStay=new Map();
   for(const night of active){
     const id=corrected.stayOverrides[night.id]??JSON.stringify([night.groupId,night.roomNumber,night.reservationId||night.id]);
     if(!byStay.has(id))byStay.set(id,{id,groupId:night.groupId,roomNumber:night.roomNumber,reservationId:night.reservationId,nights:[]});
     byStay.get(id).nights.push(night);
   }
   const rates=auditContractRates([...byStay.values()],snapshot.rates);
   latest={base,corrected,rates};
   $("v11Summary").textContent=group?`${active.length} room-nights · ${byStay.size} stays · ${base.issues.length+rates.issues.length} audit alerts · ${snapshot.corrections.filter(e=>e.group===group).length} corrections`:"Select a group to inspect V11 room nights.";
   $("v11Nights").innerHTML=active.map(n=>`<tr><td>${esc(n.reportDate)}</td><td>${esc(n.roomNumber)}</td><td>${esc(n.guestName)}</td><td>${esc(n.roomType)}</td><td>${esc(n.reportedRate)}</td><td><button type="button" class="secondary v11-edit" data-id="${esc(n.id)}">Correct</button></td></tr>`).join("");
   $("v11Issues").textContent=[...base.issues,...rates.issues].slice(0,15).map(i=>i.type+" · "+(i.roomNumber||i.sourceId||"")).join("\n")||"No issues detected in this preview.";
 }catch(e){status("Correction review needed: "+e.message);$("v11Summary").textContent="Cannot replay saved corrections; original records are unchanged.";}
}
function syncFromApp(data){snapshot={...snapshot,...data};persist();redraw();}
window.addEventListener("hotel-v11-sync",e=>syncFromApp(e.detail));
$("groupSelect").addEventListener("change",()=>setTimeout(redraw,0));
$("v11Nights").addEventListener("click",e=>{
 const btn=e.target.closest(".v11-edit");if(!btn||!latest)return;
 const n=latest.corrected.nights.find(n=>n.id===btn.dataset.id);if(!n)return;
 $("v11NightId").value=n.id;$("v11Rate").value=n.reportedRate;$("v11Reason").value="";
 $("v11CorrectionDialog").showModal();
});
$("v11CorrectionForm").addEventListener("submit",e=>{
 e.preventDefault();
 const id=$("v11NightId").value,rate=Number($("v11Rate").value),reason=$("v11Reason").value.trim(),group=$("groupSelect").value;
 if(!reason||!Number.isFinite(rate)||rate<0){status("Enter a valid rate and reason");return;}
 const event={id:crypto.randomUUID(),type:"EDIT_NIGHT",nightId:id,changes:{reportedRate:rate},reason,timestamp:new Date().toISOString(),group};
 try{appendCorrection(ledger,event);snapshot.corrections.push(event);persist();redraw();$("v11CorrectionDialog").close();}catch(err){status(err.message);}
});
$("v11Undo").addEventListener("click",()=>{
 const group=$("groupSelect").value,events=snapshot.corrections.filter(e=>e.group===group);
 const undone=new Set(events.filter(e=>e.type==="UNDO").map(e=>e.targetEventId));
 const target=events.slice().reverse().find(e=>e.type!=="UNDO"&&!undone.has(e.id));
 if(!target){status("No correction to undo");return;}
 const event={id:crypto.randomUUID(),type:"UNDO",targetEventId:target.id,reason:"User requested undo",timestamp:new Date().toISOString(),group};
 try{appendCorrection(ledger,event);snapshot.corrections.push(event);persist();redraw();}catch(err){status(err.message);}
});
$("v11Backup").addEventListener("click",()=>downloadBackup({version:1,data:snapshot,savedAt:new Date().toISOString()}));
$("v11Restore").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const backup=await importBackup(file);snapshot=backup.data;persist();redraw();status("Backup loaded into V11 workspace. Re-import PDFs in the legacy panel if needed.");}catch(err){status("Restore failed: "+err.message);}e.target.value="";});
loadWorkspace().then(payload=>{if(payload){snapshot=payload.data;status("Saved V11 workspace loaded");redraw();}}).catch(e=>status("IndexedDB unavailable: "+e.message));
