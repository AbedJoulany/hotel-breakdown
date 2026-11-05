import test from "node:test";
import assert from "node:assert/strict";
import {normalizeDate,extractRoomNights,detectDuplicateNights,buildStays,detectMissingNights,auditRoomNights} from "../src/audit/roomNightEngine.js";
const row=(date,other={})=>({group:"A",reportDate:date,fileName:"group-"+date+".pdf",room:"0304",
  guest:"Example Guest",reservation:"R1",roomType:"DBL",adults:2,children:0,babies:0,
  rate:200,fromDate:"10-NOV-26",toDate:"13-NOV-26",...other});
test("normalizes dates strictly",()=>{
  assert.equal(normalizeDate("10 NOV 2026"),"2026-11-10");
  assert.equal(normalizeDate("10-NOV-26"),"2026-11-10");
  assert.equal(normalizeDate("2026-02-30"),null);
});
test("one observed room-night per daily report, not per stay date",()=>{
  const result=auditRoomNights([row("10 NOV 2026"),row("11 NOV 2026"),row("12 NOV 2026")]);
  assert.equal(result.nights.length,3);
  assert.equal(result.stays.length,1);
  assert.equal(result.issues.filter(x=>x.type==="POSSIBLE_MISSING_NIGHT").length,0);
});
test("gap is flagged but never charged or inserted",()=>{
  const result=auditRoomNights([row("10 NOV 2026"),row("12 NOV 2026")]);
  assert.equal(result.nights.length,2);
  assert.deepEqual(result.issues.filter(x=>x.type==="POSSIBLE_MISSING_NIGHT").map(x=>x.date),["2026-11-11"]);
});
test("same room/night from two files is flagged",()=>{
  const {nights}=extractRoomNights([row("10 NOV 2026"),row("10 NOV 2026",{fileName:"duplicate.pdf"})]);
  assert.equal(detectDuplicateNights(nights).length,1);
});
test("same room with different reservation IDs remains separate",()=>{
  const {stays}=buildStays(extractRoomNights([row("10 NOV 2026"),row("12 NOV 2026",{reservation:"R2"})]).nights);
  assert.equal(stays.length,2);
});
test("missing reservation is not guessed from room number",()=>{
  const result=auditRoomNights([row("10 NOV 2026",{reservation:""}),row("12 NOV 2026",{reservation:""})]);
  assert.equal(result.stays.length,2);
  assert.equal(result.issues.filter(x=>x.type==="AMBIGUOUS_STAY").length,2);
});
test("invalid report date rejects record with diagnostic",()=>{
  const result=extractRoomNights([row("not a date")]);
  assert.equal(result.nights.length,0);
  assert.equal(result.issues[0].type,"INVALID_SOURCE_RECORD");
});
test("source object is not mutated",()=>{
  const original=row("10 NOV 2026");
  extractRoomNights([original]);
  assert.equal(original.reportDate,"10 NOV 2026");
});
test("large inconsistent date ranges do not generate unbounded gaps",()=>{
  const {stays}=buildStays(extractRoomNights([row("10 NOV 2026",{fromDate:"01-JAN-20",toDate:"01-JAN-30"})]).nights);
  assert.equal(detectMissingNights(stays)[0].type,"STAY_DATE_RANGE_TOO_LARGE");
});
