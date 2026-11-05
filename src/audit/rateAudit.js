import {normalizeDate} from "./roomNightEngine.js";
const norm=v=>String(v??"").trim().toUpperCase();
const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
const money=c=>c===null?null:c/100;
/**
 * Contract rows: {date,type,occupancy,rate,currency}.
 * Occupancy is adult count (matching existing app contract rows).
 * Multiple matching rows are ambiguous, even when amounts agree.
 * No implicit currency conversion or fallback to another room type.
 */
export function auditContractRates(stays,rates=[]) {
  const issues=[],nightResults=[],stayResults=[];
  for(const stay of stays) {
    let reportedCents=0,expectedCents=0,complete=true;
    const currencies=new Set();
    for(const night of stay.nights) {
      const matches=rates.filter(r=>normalizeDate(r.date)===night.reportDate &&
        norm(r.type??r.roomType)===norm(night.roomType) &&
        Number(r.occupancy)===night.occupancy.adults);
      const base={stayId:stay.id,nightId:night.id,date:night.reportDate,roomNumber:night.roomNumber};
      const reported=cents(night.reportedRate);
      reportedCents+=reported;
      const expectedCurrency=norm(night.currency);
      if(matches.length!==1) {
        complete=false;
        issues.push({...base,type:matches.length?"AMBIGUOUS_CONTRACT_RATE":"MISSING_CONTRACT_RATE",requiresReview:true});
        nightResults.push({...base,reportedRate:money(reported),expectedRate:null,variance:null,status:"NEEDS_REVIEW"});
        continue;
      }
      const match=matches[0],rateCents=cents(match.rate),contractCurrency=norm(match.currency);
      if(rateCents===null || rateCents<0 || !contractCurrency ||
         (expectedCurrency && expectedCurrency!==contractCurrency)) {
        complete=false;
        issues.push({...base,type:"INVALID_OR_INCOMPATIBLE_RATE",requiresReview:true});
        nightResults.push({...base,reportedRate:money(reported),expectedRate:null,variance:null,status:"NEEDS_REVIEW"});
        continue;
      }
      currencies.add(contractCurrency);
      expectedCents+=rateCents;
      const variance=reported-rateCents;
      if(variance!==0) issues.push({...base,type:"NIGHT_RATE_MISMATCH",reportedRate:money(reported),
        expectedRate:money(rateCents),variance:money(variance),currency:contractCurrency,requiresReview:true});
      nightResults.push({...base,reportedRate:money(reported),expectedRate:money(rateCents),
        variance:money(variance),currency:contractCurrency,status:variance?"MISMATCH":"MATCH"});
    }
    if(currencies.size>1) {
      complete=false;
      issues.push({type:"MIXED_CONTRACT_CURRENCIES",stayId:stay.id,requiresReview:true});
    }
    stayResults.push({stayId:stay.id,roomNumber:stay.roomNumber,
      reportedTotal:money(reportedCents),expectedTotal:complete?money(expectedCents):null,
      currency:currencies.size===1?[...currencies][0]:null,
      status:complete?"CALCULATED":"NEEDS_REVIEW"});
  }
  return {nightResults,stayResults,issues};
}
