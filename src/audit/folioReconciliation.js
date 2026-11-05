const norm=v=>String(v??"").trim().replace(/\s+/g," ").toUpperCase();
const room=v=>norm(v).replace(/^0+(?=\d)/,"");
const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
const money=v=>v===null?null:v/100;
/**
 * Folio entries: {room,guest,amount,currency?,reservationId?,id?}.
 * Only exact guest+room (and reservation if supplied) is eligible.
 * A match must have exactly one eligible stay and one eligible Folio entry.
 * Multiple folio lines are NOT silently aggregated across stays.
 */
export function reconcileFolio(stays,rateResults,folioEntries=[]) {
  const issues=[],results=[],used=new Set();
  const indexed=folioEntries.map((entry,index)=>({entry,index}));
  for(const stay of stays) {
    const names=new Set(stay.nights.map(n=>norm(n.guestName)).filter(Boolean));
    const matching=indexed.filter(({entry})=>room(entry.room??entry.roomNumber)===room(stay.roomNumber) &&
      norm(entry.guest??entry.guestName) && names.has(norm(entry.guest??entry.guestName)) &&
      (!entry.reservationId || norm(entry.reservationId)===norm(stay.reservationId)));
    const candidates=matching.filter(({entry})=>stays.filter(other=>
      room(other.roomNumber)===room(entry.room??entry.roomNumber) &&
      other.nights.some(n=>norm(n.guestName)===norm(entry.guest??entry.guestName)) &&
      (!entry.reservationId || norm(other.reservationId)===norm(entry.reservationId))).length===1);
    const base={stayId:stay.id,roomNumber:stay.roomNumber};
    if(candidates.length!==1 || matching.length!==1) {
      issues.push({...base,type:matching.length?"AMBIGUOUS_FOLIO_MATCH":"MISSING_FOLIO_MATCH",requiresReview:true});
      results.push({...base,status:"NEEDS_REVIEW",folioTotal:null,reportedVariance:null,contractVariance:null});
      continue;
    }
    const {entry,index}=candidates[0],folioCents=cents(entry.amount);
    const totals=rateResults.stayResults.find(r=>r.stayId===stay.id);
    const folioCurrency=norm(entry.currency),contractCurrency=norm(totals?.currency);
    const reportedCurrency=new Set(stay.nights.map(n=>norm(n.currency)).filter(Boolean));
    if(folioCents===null || !folioCurrency || !contractCurrency || folioCurrency!==contractCurrency ||
      (reportedCurrency.size && (reportedCurrency.size!==1 || !reportedCurrency.has(contractCurrency)))) {
      issues.push({...base,type:"FOLIO_CURRENCY_OR_AMOUNT_UNVERIFIED",requiresReview:true});
      results.push({...base,status:"NEEDS_REVIEW",folioTotal:null,reportedVariance:null,contractVariance:null});
      continue;
    }
    used.add(index);
    const reported=cents(totals.reportedTotal);
    const expected=totals.expectedTotal===null?null:cents(totals.expectedTotal);
    const reportedVariance=folioCents-reported;
    const contractVariance=expected===null?null:folioCents-expected;
    if(reportedVariance!==0) issues.push({...base,type:"FOLIO_VS_REPORTED_MISMATCH",variance:money(reportedVariance),requiresReview:true});
    if(contractVariance!==null && contractVariance!==0) issues.push({...base,type:"FOLIO_VS_CONTRACT_MISMATCH",variance:money(contractVariance),requiresReview:true});
    results.push({...base,folioTotal:money(folioCents),currency:folioCurrency,
      reportedVariance:money(reportedVariance),contractVariance:money(contractVariance),
      status:reportedVariance===0 && contractVariance===0?"MATCH":contractVariance===null?"NEEDS_REVIEW":"MISMATCH"});
  }
  for(const {entry,index} of indexed) if(!used.has(index)) issues.push({type:"UNMATCHED_FOLIO_ENTRY",
    folioIndex:index,roomNumber:String(entry.room??entry.roomNumber??""),requiresReview:true});
  return {results,issues};
}
