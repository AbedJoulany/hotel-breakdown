import test from "node:test";
import assert from "node:assert/strict";
import {auditFinancials} from "../src/audit/financialAudit.js";
const row=(date,over={})=>({group:"A",reportDate:date,fileName:"report-"+date,room:"0304",
  guest:"Example Guest",reservation:"R1",roomType:"DBL",adults:2,children:0,babies:0,
  rate:200,currency:"USD",fromDate:"10-NOV-26",toDate:"13-NOV-26",...over});
const rates=()=>["2026-11-10","2026-11-11","2026-11-12"].map(date=>({date,type:"DBL",occupancy:2,rate:200,currency:"USD"}));
const folio=(amount=600,over={})=>[{room:"304",guest:"Example Guest",amount,currency:"USD",reservationId:"R1",...over}];
const reports=()=>[row("10 NOV 2026"),row("11 NOV 2026"),row("12 NOV 2026")];
const types=a=>a.issues.map(i=>i.type);
test("full three-night reconciliation",()=>{const a=auditFinancials(reports(),rates(),folio());assert.equal(a.status,"VERIFIED");assert.equal(a.rates.stayResults[0].expectedTotal,600);});
test("nightly mismatch not hidden by equal stay totals",()=>{const a=auditFinancials([row("10 NOV 2026",{rate:180}),row("11 NOV 2026",{rate:220}),row("12 NOV 2026")],rates(),folio());assert.equal(types(a).filter(x=>x==="NIGHT_RATE_MISMATCH").length,2);assert.equal(a.status,"NEEDS_REVIEW");});
test("missing contract rate never becomes zero",()=>{const a=auditFinancials(reports(),rates().slice(1),folio());assert.equal(a.rates.stayResults[0].expectedTotal,null);assert.ok(types(a).includes("MISSING_CONTRACT_RATE"));});
test("duplicate contract rule is ambiguous",()=>{const a=auditFinancials(reports(),[...rates(),rates()[0]],folio());assert.ok(types(a).includes("AMBIGUOUS_CONTRACT_RATE"));});
test("folio differs from both reported and contract totals",()=>{const a=auditFinancials(reports(),rates(),folio(550));assert.ok(types(a).includes("FOLIO_VS_REPORTED_MISMATCH"));assert.ok(types(a).includes("FOLIO_VS_CONTRACT_MISMATCH"));});
test("same room reused by different stays is not merged",()=>{
 const a=auditFinancials([row("10 NOV 2026",{fromDate:"10-NOV-26",toDate:"11-NOV-26"}),row("12 NOV 2026",{reservation:"R2",guest:"Other Guest",fromDate:"12-NOV-26",toDate:"13-NOV-26"})],rates(),[
 {room:"304",guest:"Example Guest",reservationId:"R1",amount:200,currency:"USD"},
 {room:"304",guest:"Other Guest",reservationId:"R2",amount:200,currency:"USD"}]);
 assert.equal(a.roomAudit.stays.length,2);assert.equal(a.folio.results.length,2);
});
test("room-only folio never matches",()=>{const a=auditFinancials(reports(),rates(),[{room:"304",amount:600,currency:"USD"}]);assert.ok(types(a).includes("MISSING_FOLIO_MATCH"));});
test("missing currency cannot be silently compared",()=>{const a=auditFinancials(reports(),rates(),folio(600,{currency:""}));assert.ok(types(a).includes("FOLIO_CURRENCY_OR_AMOUNT_UNVERIFIED"));});
test("folio with same guest and room across stays is ambiguous without reservation",()=>{
 const a=auditFinancials([row("10 NOV 2026"),row("12 NOV 2026",{reservation:"R2"})],rates(),[{room:"304",guest:"Example Guest",amount:400,currency:"USD"}]);
 assert.ok(types(a).includes("AMBIGUOUS_FOLIO_MATCH"));
});
test("duplicate folio rows cannot silently be added",()=>{const a=auditFinancials(reports(),rates(),[...folio(300),...folio(300)]);assert.ok(types(a).includes("AMBIGUOUS_FOLIO_MATCH"));});
test("missing daily report remains unresolved despite matching amounts",()=>{const a=auditFinancials([row("10 NOV 2026"),row("12 NOV 2026")],rates(),folio(400));assert.ok(types(a).includes("POSSIBLE_MISSING_NIGHT"));assert.equal(a.status,"NEEDS_REVIEW");});
