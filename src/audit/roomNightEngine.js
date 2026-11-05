/**
 * V11 phase 1: pure room-night normalization and stay grouping.
 * No UI, export, Folio, or contract-rate dependencies.
 * Source records are never mutated.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};

export function normalizeDate(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  let year, month, day;
  if (ISO_DATE.test(raw)) {
    [year, month, day] = raw.split("-").map(Number);
    month -= 1;
  } else {
    const m = raw.match(/^(\d{1,2})[ -]([A-Z]{3})[ -](\d{2}|\d{4})$/);
    if (!m || !(m[2] in MONTHS)) return null;
    day = Number(m[1]); month = MONTHS[m[2]];
    year = Number(m[3]); if (year < 100) year += 2000;
  }
  const d = new Date(Date.UTC(year,month,day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0,10);
}
const norm = v => String(v ?? "").trim().replace(/\s+/g," ").toUpperCase();
const key = (...values) => JSON.stringify(values);
const utcDay = iso => Math.floor(Date.parse(iso+"T00:00:00Z") / 86400000);
const dayISO = day => new Date(day*86400000).toISOString().slice(0,10);

/**
 * Input is the existing parseGroupRecords output, one record per room per report date.
 * Invalid records are rejected with diagnostics rather than silently charged.
 */
export function extractRoomNights(records) {
  const nights = [], issues = [];
  (records || []).forEach((source,index) => {
    const reportDate = normalizeDate(source.reportDate);
    const roomNumber = norm(source.roomNumber ?? source.room);
    const groupId = norm(source.groupId ?? source.group);
    const roomType = norm(source.roomType);
    const occupancy = {
      adults: Number(source.occupancy?.adults ?? source.adults ?? 0),
      children: Number(source.occupancy?.children ?? source.children ?? 0),
      babies: Number(source.occupancy?.babies ?? source.babies ?? 0)
    };
    const reportedRate = Number(source.reportedRate ?? source.rate);
    const sourceReportId = String(source.sourceReportId ?? source.fileName ?? "");
    const sourceId = key(sourceReportId,index);
    const invalid = !reportDate || !roomNumber || !groupId || !roomType ||
      !Number.isFinite(reportedRate) ||
      Object.values(occupancy).some(n => !Number.isInteger(n) || n < 0);
    if (invalid) {
      issues.push({type:"INVALID_SOURCE_RECORD",sourceId,index});
      return;
    }
    const checkIn = normalizeDate(source.originalCheckIn ?? source.fromDate);
    const checkOut = normalizeDate(source.originalCheckOut ?? source.toDate);
    nights.push(Object.freeze({
      id:sourceId, sourceReportId, sourceIndex:index, groupId, reportDate,
      roomNumber, reservationId:norm(source.reservationId ?? source.reservation),
      guestName:String(source.guestName ?? source.guest ?? "").trim(),
      roomType, occupancy:Object.freeze(occupancy), reportedRate,
      currency:norm(source.currency), originalCheckIn:checkIn, originalCheckOut:checkOut
    }));
  });
  return {nights,issues};
}

/** Duplicate means same group/room/report-night, even if uploaded from two files. */
export function detectDuplicateNights(nights) {
  const byKey = new Map(), issues = [];
  for (const night of nights) {
    const k = key(night.groupId,night.roomNumber,night.reportDate);
    if (byKey.has(k)) issues.push({type:"DUPLICATE_ROOM_NIGHT",roomNumber:night.roomNumber,
      date:night.reportDate,sourceIds:[byKey.get(k).id,night.id]});
    else byKey.set(k,night);
  }
  return issues;
}

/**
 * Conservative matching: reservation ID is required for automatic grouping;
 * when absent, each record is kept separate pending manual stay matching.
 * A reservation appearing in two rooms is not merged.
 */
export function buildStays(nights) {
  const stays = new Map(), issues = [];
  for (const night of nights) {
    const id = night.reservationId
      ? key(night.groupId,night.roomNumber,night.reservationId)
      : key(night.groupId,night.roomNumber,"UNMATCHED",night.id);
    if (!night.reservationId) issues.push({type:"AMBIGUOUS_STAY",roomNumber:night.roomNumber,sourceId:night.id});
    if (!stays.has(id)) stays.set(id,{id,groupId:night.groupId,roomNumber:night.roomNumber,
      reservationId:night.reservationId,nights:[]});
    stays.get(id).nights.push(night);
  }
  return {stays:[...stays.values()].map(stay=>({...stay,nights:stay.nights.slice().sort((a,b)=>a.reportDate.localeCompare(b.reportDate))})),issues};
}

/**
 * Flag internal gaps between observed nights. Also flag dates inside the
 * declared check-in/check-out window, but never fabricate billable nights.
 * A missing uploaded daily report is only a candidate gap, not proof of a charge.
 */
export function detectMissingNights(stays,{maxSpanDays=366}={}) {
  const issues = [];
  for (const stay of stays) {
    if (!stay.reservationId || !stay.nights.length) continue;
    const observed = new Set(stay.nights.map(n=>n.reportDate));
    const days = [...observed].sort().map(utcDay);
    const declared = stay.nights.filter(n=>n.originalCheckIn && n.originalCheckOut &&
      utcDay(n.originalCheckOut)>utcDay(n.originalCheckIn));
    let first=days[0],last=days[days.length-1];
    if (declared.length) {
      first=Math.min(first,...declared.map(n=>utcDay(n.originalCheckIn)));
      last=Math.max(last,...declared.map(n=>utcDay(n.originalCheckOut)-1));
    }
    if (last-first+1>maxSpanDays) {
      issues.push({type:"STAY_DATE_RANGE_TOO_LARGE",stayId:stay.id});
      continue;
    }
    for(let day=first;day<=last;day++) {
      const date=dayISO(day);
      if(!observed.has(date)) issues.push({type:"POSSIBLE_MISSING_NIGHT",stayId:stay.id,
        roomNumber:stay.roomNumber,date,requiresReview:true});
    }
  }
  return issues;
}

export function auditRoomNights(records) {
  const parsed=extractRoomNights(records);
  const duplicates=detectDuplicateNights(parsed.nights);
  const grouped=buildStays(parsed.nights);
  return {nights:parsed.nights,stays:grouped.stays,
    issues:[...parsed.issues,...duplicates,...grouped.issues,...detectMissingNights(grouped.stays)]};
}
