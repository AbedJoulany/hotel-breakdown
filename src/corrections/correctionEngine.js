/**
 * V11 Phase 3: immutable, event-sourced corrections.
 * This module never edits source PDFs, original room-night objects or Folio data.
 * Every correction needs a unique ID, reason and ISO timestamp supplied by caller.
 * Undo is another audit event; history is never deleted.
 */
import {normalizeDate} from "../audit/roomNightEngine.js";

const clean = v => String(v ?? "").trim();
const norm = v => clean(v).toUpperCase();
const roomKey = v => norm(v).replace(/^0+(?=\d)/, "");
const money = v => typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.round(v*100)===v*100;
const occupancyValid = v => v && ["adults","children","babies"].every(k => Number.isInteger(v[k]) && v[k]>=0);
const sameNight = (a,b) => norm(a.groupId)===norm(b.groupId) &&
  roomKey(a.roomNumber)===roomKey(b.roomNumber) && a.reportDate===b.reportDate;
const cloneNight = n => ({...n,occupancy:{...n.occupancy}});
const allowed = new Set(["ADD_NIGHT","EDIT_NIGHT","EXCLUDE_NIGHT","SPLIT_STAY","LINK_FOLIO","UNDO"]);
const editFields = new Set(["reportedRate","roomType","occupancy","guestName","reservationId"]);
const fail = message => { throw new Error(message); };

export function createCorrectionLedger(sourceNights,folioEntries=[]) {
  if (!Array.isArray(sourceNights) || !Array.isArray(folioEntries)) fail("Source arrays required");
  const ids = new Set();
  for (const n of sourceNights) {
    if (!clean(n.id) || ids.has(n.id)) fail("Source nights require unique IDs");
    ids.add(n.id);
  }
  return {sourceNights:sourceNights.map(cloneNight),folioEntries:folioEntries.map(f=>({...f})),events:[]};
}

function validateEvent(event,ledger) {
  if (!event || !allowed.has(event.type) || !clean(event.id) ||
      ledger.events.some(e=>e.id===event.id) || !clean(event.reason) ||
      !event.timestamp || !Number.isFinite(Date.parse(event.timestamp))) fail("Invalid correction metadata");
  if (event.type==="UNDO") {
    if (!clean(event.targetEventId) || event.targetEventId===event.id) fail("Invalid undo target");
    const target=ledger.events.find(e=>e.id===event.targetEventId);
    if (!target || target.type==="UNDO") fail("Undo target must be an existing correction");
    if (ledger.events.some(e=>e.type==="UNDO" && e.targetEventId===target.id)) fail("Correction already undone");
  }
}

/**
 * Apply corrections by replaying the append-only event log.
 * A failed event is never added to the ledger.
 */
export function appendCorrection(ledger,event) {
  validateEvent(event,ledger);
  const next={...ledger,events:[...ledger.events,{...event}]};
  replayCorrections(next); // validates all semantic constraints before accepting
  return next;
}

export function replayCorrections(ledger) {
  const sourceIds=new Set(ledger.sourceNights.map(n=>n.id));
  const undone=new Set(ledger.events.filter(e=>e.type==="UNDO").map(e=>e.targetEventId));
  const nights=ledger.sourceNights.map(cloneNight);
  const excluded=new Set(),stayOverrides=new Map(),folioLinks=new Map();
  const audit=[];
  for (const e of ledger.events) {
    if(e.type==="UNDO") {
      audit.push({eventId:e.id,type:e.type,targetEventId:e.targetEventId,reason:e.reason,timestamp:e.timestamp,status:"APPLIED"});
      continue;
    }
    if(undone.has(e.id)) {
      audit.push({eventId:e.id,type:e.type,reason:e.reason,timestamp:e.timestamp,status:"UNDONE"});
      continue;
    }
    let before=null,after=null;
    if(e.type==="ADD_NIGHT") {
      const n=e.night;
      if(!n || !clean(n.id) || !clean(n.groupId) || !clean(n.roomNumber) ||
         !normalizeDate(n.reportDate) || normalizeDate(n.reportDate)!==n.reportDate ||
         !clean(n.roomType) || !occupancyValid(n.occupancy) || !money(n.reportedRate) ||
         nights.some(x=>x.id===n.id) || sourceIds.has(n.id)) fail("Invalid added night");
      if(nights.some(x=>!excluded.has(x.id) && sameNight(x,n))) fail("Room-night already exists");
      after=cloneNight(n); nights.push(after);
    } else if(e.type==="EDIT_NIGHT") {
      const n=nights.find(n=>n.id===e.nightId);
      if(!n || excluded.has(n.id) || !e.changes || !Object.keys(e.changes).length ||
         Object.keys(e.changes).some(k=>!editFields.has(k))) fail("Invalid night edit");
      if("reportedRate" in e.changes && !money(e.changes.reportedRate)) fail("Invalid rate");
      if("occupancy" in e.changes && !occupancyValid(e.changes.occupancy)) fail("Invalid occupancy");
      for(const k of ["roomType","guestName","reservationId"]) if(k in e.changes && typeof e.changes[k]!=="string") fail("Invalid text field");
      if("roomType" in e.changes && !clean(e.changes.roomType)) fail("Room type required");
      before=cloneNight(n);
      Object.assign(n,e.changes);
      if("occupancy" in e.changes) n.occupancy={...e.changes.occupancy};
      after=cloneNight(n);
    } else if(e.type==="EXCLUDE_NIGHT") {
      const n=nights.find(n=>n.id===e.nightId);
      if(!n || excluded.has(n.id)) fail("Cannot exclude missing or already excluded night");
      before=cloneNight(n);excluded.add(n.id);after={excluded:true};
    } else if(e.type==="SPLIT_STAY") {
      const target=nights.find(n=>n.id===e.nightId && !excluded.has(n.id));
      if(!target || !clean(e.newStayId)) fail("Invalid split target");
      // Split assignment is explicit, rather than inferring stays from dates.
      before={stayId:stayOverrides.get(e.nightId)??null};
      stayOverrides.set(e.nightId,clean(e.newStayId));
      after={stayId:clean(e.newStayId)};
    } else if(e.type==="LINK_FOLIO") {
      if(!clean(e.stayId) || !Number.isInteger(e.folioIndex) ||
         e.folioIndex<0 || e.folioIndex>=ledger.folioEntries.length) fail("Invalid Folio link");
      // One Folio entry cannot be assigned to multiple stays.
      before={stayId:folioLinks.get(e.folioIndex)??null};
      folioLinks.set(e.folioIndex,clean(e.stayId));
      after={stayId:clean(e.stayId)};
    }
    audit.push({eventId:e.id,type:e.type,reason:e.reason,timestamp:e.timestamp,before,after,status:"APPLIED"});
  }
  const activeNights=nights.filter(n=>!excluded.has(n.id));
  const allIds=new Set(activeNights.map(n=>n.id));
  for(const [nightId] of stayOverrides) if(!allIds.has(nightId)) fail("Split references excluded night");
  const stayIds=new Set(activeNights.map(n=>stayOverrides.get(n.id) ??
    JSON.stringify([norm(n.groupId),roomKey(n.roomNumber),norm(n.reservationId)||"UNMATCHED:"+n.id])));
  for(const stayId of folioLinks.values()) if(!stayIds.has(stayId)) fail("Folio link references unknown stay");
  return {
    nights:activeNights.map(cloneNight),
    excludedNightIds:[...excluded],
    stayOverrides:Object.fromEntries(stayOverrides),
    folioLinks:Object.fromEntries(folioLinks),
    audit
  };
}
