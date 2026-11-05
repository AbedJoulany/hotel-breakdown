import {auditRoomNights} from "./roomNightEngine.js";
import {auditContractRates} from "./rateAudit.js";
import {reconcileFolio} from "./folioReconciliation.js";
/** Orchestrator only. Never changes original reports, contract or Folio. */
export function auditFinancials(reportRows,contractRates,folioEntries) {
  const roomAudit=auditRoomNights(reportRows);
  const rates=auditContractRates(roomAudit.stays,contractRates);
  const folio=reconcileFolio(roomAudit.stays,rates,folioEntries);
  const issues=[...roomAudit.issues,...rates.issues,...folio.issues];
  return {roomAudit,rates,folio,issues,status:issues.length?"NEEDS_REVIEW":"VERIFIED"};
}
