import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);
const ROOM_TYPES = [{"code": "STR", "en": "Orient Room", "he": "חדר אוריינט"}, {"code": "SGR", "en": "Orient Garden Room", "he": "חדר אוריינט גן"}, {"code": "SCR", "en": "Orient Colony City View Room", "he": "חדר אוריינט נוף למושבה"}, {"code": "SOR", "en": "Orient Old City View Room", "he": "חדר אוריינט נוף לעיר העתיקה"}, {"code": "TEXR", "en": "Templer Executive Room", "he": "טמפלר אקזקיוטיב"}, {"code": "TSTR", "en": "Templer Standard Room", "he": "חדר טמפלר"}, {"code": "TSUR", "en": "Templer Deluxe Room", "he": "חדר טמפלר דלוקס"}, {"code": "FAP", "en": "Family Room", "he": "חדר משפחה"}, {"code": "ZSR", "en": "Orient Suite", "he": "סוויטת אוריינט"}, {"code": "ZCR", "en": "Orient Colony View Suite", "he": "סוויטת אוריינט נוף למושבה"}, {"code": "ZOR", "en": "Orient Old City View Suite", "he": "סוויטת אוריינט נוף לעיר העתיקה"}, {"code": "ZPR", "en": "Presidential Suite", "he": "סוויטה נשיאותית"}, {"code": "ZRR", "en": "Orient Royal Suite", "he": "סוויטת אוריינט רויאל"}, {"code": "ZER", "en": "Colony Suite", "he": "סוויטת קולוני"}, {"code": "STRC", "en": "Orient Connecting Room", "he": ""}];
const groupProfiles = new Map();
const groupRateProfiles = new Map();
const STORAGE_KEY = "hotelGroupAudit.groupWorkspace.v1";

const state = {
    groupFiles: [],
    folioFile: null,
    reports: [],
    folioText: "",
    folioRecords: [],
    activeTab: "groups",
    groups: [],
    activeGroup: ""
};

function loadSavedWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const [group, profile] of Object.entries(saved.profiles || {})) groupProfiles.set(group, profile);
    for (const [group, rates] of Object.entries(saved.rates || {})) groupRateProfiles.set(group, rates);
  } catch (error) {
    console.warn("Could not load saved group settings; starting with an empty workspace.", error);
  }
}
function persistWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profiles: Object.fromEntries(groupProfiles),
      rates: Object.fromEntries(groupRateProfiles)
    }));
  } catch (error) {
    setStatus("Could not save group settings in this browser. Check browser storage permissions.", "error");
    console.warn("Workspace persistence failed", error);
  }
}

function setStatus(message, type="") {
  const el = $("parseStatus"); el.textContent = message; el.className = `status ${type}`;
}
function setExportStatus(message, type="") {
  const el = $("exportStatus");
  if (el) { el.textContent = message; el.className = `status ${type}`; }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
loadSavedWorkspace();

function displayFiles() {
  $("groupFileNames").textContent = state.groupFiles.length ? state.groupFiles.map(f=>f.name).join(" · ") : "No files selected";
  $("folioFileName").textContent = state.folioFile ? state.folioFile.name : "No file selected";
  $("parseBtn").disabled = !state.groupFiles.length;
}
$("groupFiles").addEventListener("change", e => { state.groupFiles = [...e.target.files]; displayFiles(); });
$("folioFile").addEventListener("change", e => { state.folioFile = e.target.files[0] || null; displayFiles(); });
displayFiles();

async function extractPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({data: bytes}).promise;
  const pages = [];
  for (let p=1; p<=pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group text items into visual lines using PDF coordinates, then sort left-to-right.
    const lines = [];
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4], y = item.transform[5];
      let line = lines.find(l => Math.abs(l.y-y) < 2.5);
      if (!line) { line={y,items:[]}; lines.push(line); }
      line.items.push({x,text:item.str});
    }
    lines.sort((a,b)=>b.y-a.y);
    pages.push(lines.map(l=>l.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" ").replace(/\s+/g," ").trim()).join("\n"));
  }
  return {name:file.name,pages,text:pages.map((p,i)=>`--- PAGE ${i+1} ---\n${p}`).join("\n\n"),numPages:pdf.numPages};
}
function normalizeGroupName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}
function extractGroupSections(text) {
  // Group Reports repeat "Group Name:" at the start of a group and again
  // when that group continues on the next page. Split the extracted text at
  // those headers so the preview can show only the selected group's records.
  const lines = String(text || "").split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^\s*Group Name\s*:\s*(.*?)\s*$/i);
    if (match) {
      if (current) sections.push(current);
      current = { group: normalizeGroupName(match[1]), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.filter(section => section.group).map(section => ({
    group: section.group,
    text: section.lines.join("\n").trim()
  }));
}
function detectGroups(text) {
  return [...new Set(extractGroupSections(text).map(section => section.group))];
}
function detectReportDate(text, fileName) {
  // The report date is the standalone date heading (for example, "25 OCT 2026"),
  // not every guest's arrival/departure date listed in the body of the report.
  const re = /^\s*(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})\s*$/gim;
  let match;
  while ((match = re.exec(String(text || ""))) !== null) {
    return `${match[1].padStart(2, "0")} ${match[2].toUpperCase()} ${match[3]}`;
  }
  const nameMatch = String(fileName || "").match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})/);
  if (nameMatch) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const month = Number(nameMatch[2]);
    let year = nameMatch[3];
    if (year.length === 2) year = `20${year}`;
    if (month >= 1 && month <= 12) return `${nameMatch[1].padStart(2,"0")} ${months[month-1]} ${year}`;
  }
  return "";
}

function parseGroupRecords(section, reportDate, fileName) {
  const records = [];
  for (const rawLine of String(section.text || "").split("\n")) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    if (!/^\d{4}\s/.test(line) || /\bRoom Guest\b/i.test(line)) continue;
    const tokens = line.split(" ");
    const dateIndex = tokens.findIndex((token, i) => i > 0 && /^\d{2}-[A-Z]{3}-\d{2}$/i.test(token));
    if (dateIndex < 5 || tokens.length < dateIndex + 8) continue;
    const resIndex = dateIndex - 4;
    const room = tokens[0];
    const guest = tokens.slice(1, resIndex).join(" ").trim();
    const reservation = tokens[resIndex];
    const rmRoomType = tokens[resIndex + 1]; // RM column: retained for reference only.
    const upgrade = tokens[resIndex + 2];    // UPG column: authoritative room type for rates and breakdowns.
    const roomType = upgrade;
    const blockCode = tokens[resIndex + 3];
    const fromDate = tokens[dateIndex];
    const toDate = tokens[dateIndex + 1];
    const numeric = tokens.slice(dateIndex + 2, dateIndex + 6);
    const rateCode = tokens[dateIndex + 6];
    const rateRaw = tokens[dateIndex + 7];
    if (!guest || !roomType || !/^\d+$/.test(numeric[0] || "") || !rateRaw) continue;
    const rate = Number(String(rateRaw).replace(/,/g, ""));
    if (!Number.isFinite(rate)) continue;
    records.push({ group: section.group, reportDate, fileName, room, guest, reservation, roomType, rmRoomType, upgrade, blockCode, fromDate, toDate, adults: Number(numeric[0]), children: Number(numeric[1]), babies: Number(numeric[2]), rms: Number(numeric[3]), rateCode, rate });
  }
  return records;
}
function normalizeFolioDate(value) {
  const m = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return value;
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${m[1]} ${months[Number(m[2])-1] || m[2]} 20${m[3]}`;
}
function parseFolioRecords(text) {
  const records = [];
  const re = /^\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*$/gm;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const room = m[2];
    const guest = m[3].trim();
    // Ignore master-account lines (including VAT) in the room-charge preview for now.
    if (room === "9022" || /\bVAT\b/i.test(guest) || /\b(total|balance|taxable|non taxable)\b/i.test(guest)) continue;
    records.push({ date: normalizeFolioDate(m[1]), room, guest, amount: Number(m[4].replace(/,/g, "")), master: false });
  }
  return records;
}
function renderFolioRecords() {
  const preview = $("preview");
  const rows = state.folioRecords || [];
  $("previewCount").textContent = `${rows.length} parsed room-charge line(s) · master-account VAT excluded`;
  if (!rows.length) {
    preview.className = "preview-empty";
    preview.textContent = "No Folio room-charge lines were parsed. Open Raw Folio text to inspect the PDF extraction.";
    return;
  }
  preview.className = "table-wrap structured-table";
  const currencies=[...new Set(getNightRates().map(r=>r.currency).filter(Boolean))];
  const folioCurrency=currencies.length===1?currencies[0]:(currencies.length>1?"mixed currencies":"contract currency");
  preview.innerHTML = `<table><thead><tr><th>Date</th><th>Room</th><th>Guest / description</th><th>Charge (${folioCurrency})</th><th>Classification</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.room)}</td><td>${escapeHtml(r.guest)}</td><td>${money(r.amount,currencies.length===1?currencies[0]:"MIXED")}</td><td>Room-charge candidate</td></tr>`).join("")}</tbody></table>`;
}
function money(value, currency="ILS") {
  if (!Number.isFinite(Number(value))) return "—";
  if (currency === "MIXED") return Number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  return Number(value).toLocaleString(undefined,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2});
}
function reportDateToISO(value) {
  const m = String(value || "").trim().match(/^(\d{1,2})-([A-Z]{3})-(\d{2}|\d{4})$/i);
  if (!m) return "";
  const months = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
  const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
  const mm = months[m[2].toUpperCase()];
  return mm ? `${yy}-${mm}-${m[1].padStart(2,"0")}` : "";
}
function isoToReportDate(value) {
  if (!value) return "";
  const [y,m,d] = value.split("-");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${d} ${months[Number(m)-1]} ${y}`;
}
function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate()+days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function nightsBetween(from, to) {
  const start = reportDateToISO(from), end = reportDateToISO(to);
  if (!start || !end || end <= start) return [];
  const out=[]; let d=start;
  for (let guard=0; d<end && guard<366; guard++,d=addDaysISO(d,1)) out.push(d);
  return out;
}
function normalizedName(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).filter(Boolean).sort().join(" ");
}
function getSelectedGroupRecords() {
  const group = $("groupSelect").value;
  const scope = $("auditScope").value;
  const date = $("dateSelect").value;
  let rows = state.reports.flatMap(r => r.structuredRecords || []).filter(r => !group || normalizeGroupName(r.group) === normalizeGroupName(group));
  if (scope === "date") rows = date ? rows.filter(r => r.reportDate === date) : [];
  // Rms=0 rows are additional occupants/secondary lines, not extra rooms.
  rows = rows.filter(r => Number(r.rms) > 0);
  const unique = new Map();
  for (const r of rows) {
    const key = [r.group,r.room,r.reservation,r.fromDate,r.toDate,r.roomType].join("|").toLowerCase();
    if (!unique.has(key)) unique.set(key,r);
  }
  rows = [...unique.values()];
  return rows;
}
function getContractCurrency(group = state.activeGroup || $("groupSelect").value) {
  const profile = groupProfiles.get(group) || {groupType:"tourist", language:"en"};
  const language = profile.language || defaultLanguageForGroupType(profile.groupType);
  return language === "he" ? "ILS" : "USD";
}
function getNightRates() {
  const requiredCurrency = getContractCurrency();
  return [...rateBody.querySelectorAll("tr")].map(tr => {
    const date = tr.querySelector('[aria-label="Night date"]')?.value || "";
    const type = (tr.querySelector('[aria-label="Room type"]')?.value || "").trim().toUpperCase();
    const occupancy = Number(tr.querySelector('[aria-label="Occupancy"]')?.value || 0);
    const rateText = tr.querySelector('[aria-label="Contract rate"]')?.value ?? "";
    // Existing V9 rows retain their saved currency until the amount is deliberately re-entered.
    const currency = tr.dataset.savedCurrency || requiredCurrency;
    return {date,type,occupancy,rate:rateText.trim()===""?NaN:Number(rateText),currency};
  }).filter(r => r.date && r.type && Number.isFinite(r.rate) && r.rate >= 0 && r.occupancy > 0);
}
function saveActiveGroupRates() {
  const group = state.activeGroup || $("groupSelect").value;
  if (!group) return;
  groupRateProfiles.set(group, getNightRates());
  persistWorkspace();
}
function renderGroupRates(group) {
  rateBody.innerHTML = "";
  const saved = group ? (groupRateProfiles.get(group) || []) : [];
  if (saved.length) saved.forEach(rate => addRateRow(rate));
  else {
    // Keep the familiar three blank rows for a new group's first setup.
    addRateRow(); addRateRow(); addRateRow();
  }
}
function getFolioRoomTotals() {
  const map = new Map();
  for (const line of state.folioRecords || []) {
    const room = String(line.room || "").trim().replace(/^0+(?=\d)/,"");
    if (!room) continue;
    const cur = map.get(room) || {room:line.room,amount:0,lines:[],guests:new Set()};
    cur.amount += Number(line.amount)||0; cur.lines.push(line); cur.guests.add(normalizedName(line.guest)); map.set(room,cur);
  }
  return map;
}
function findFolioForRecord(record, folioTotals, groupAll) {
  const roomKey=String(record.room).replace(/^0+(?=\d)/,"").trim();
  const roomTotal=folioTotals.get(roomKey);
  if (!roomTotal) return null;
  const target=normalizedName(record.guest);
  const exactLines=roomTotal.lines.filter(line=>normalizedName(line.guest)===target);
  if (exactLines.length) return {room:roomTotal.room,amount:exactLines.reduce((sum,line)=>sum+(Number(line.amount)||0),0),lines:exactLines,guests:new Set(exactLines.map(line=>normalizedName(line.guest)))};
  const sameRoomRecords=groupAll.filter(r=>String(r.room).replace(/^0+(?=\d)/,"").trim()===roomKey);
  // Room-only fallback is safe only if this room belongs to one parsed stay in the group.
  if (sameRoomRecords.length===1) return roomTotal;
  return null;
}
function calculateExpected(record, rates) {
  const nights = nightsBetween(record.fromDate,record.toDate);
  if (!nights.length) return {expected:null,missing:["Invalid stay dates"],nights:[],currency:null};
  let expected=0; const missing=[]; const applied=[];
  for (const date of nights) {
    const match = rates.find(r => r.date===date && r.type===String(record.roomType||"").toUpperCase() && r.occupancy===Number(record.adults));
    if (!match) { missing.push(`${isoToReportDate(date)} (${record.roomType}, ${record.adults} adult(s))`); continue; }
    expected += match.rate;
    applied.push({date,amount:match.rate,currency:match.currency});
  }
  const currencies=[...new Set(rates.map(x=>x.currency).filter(Boolean))];
  if (currencies.length > 1) missing.push("This group has contract rates in multiple currencies; use one currency consistently for the group");
  return {expected:missing.length?null:expected,missing,nights,applied,currency:currencies[0]||null};
}
function renderReconciliation() {
  const preview=$("preview");
  const group=$("groupSelect").value;
  const scope=$("auditScope").value;
  const date=$("dateSelect").value;
  if (!group) { preview.className="preview-empty"; preview.textContent="Select a group first, then open Reconciliation."; $("previewCount").textContent="Waiting for group"; return; }
  if (scope==="date" && !date) { preview.className="preview-empty"; preview.textContent="Choose a report date first."; $("previewCount").textContent="Choose a date"; return; }
  if (!state.folioFile || !state.folioRecords.length) { preview.className="preview-empty"; preview.textContent="Upload the group's Folio PDF and click Extract report data before reconciling."; $("previewCount").textContent="Folio required"; return; }
  const groupAll = getSelectedGroupRecordsAllDates(group);
  const visibleRows = getSelectedGroupRecords();
  if (!groupAll.length) { preview.className="preview-empty"; preview.textContent="No primary room records (Rms > 0) were parsed for this group. Check Parsed room records and the raw report."; $("previewCount").textContent="No room records"; return; }
  const rates=getNightRates();
  const currencies=[...new Set(rates.map(r=>r.currency).filter(Boolean))];
  const requiredCurrency=getContractCurrency(group);
  const displayCurrency=currencies.length===1?currencies[0]:"MIXED";
  const currencyLabel=currencies.length===1?currencies[0]:(currencies.length>1?"mixed currencies":requiredCurrency);
  const folioTotals=getFolioRoomTotals();
  const allParsedForGroup=state.reports.flatMap(r=>r.structuredRecords||[]).filter(r=>normalizeGroupName(r.group)===normalizeGroupName(group));
  const knownRooms=new Set(allParsedForGroup.map(r=>String(r.room).replace(/^0+(?=\d)/,"").trim()));
  const rows=[];
  for (const r of visibleRows) {
    const roomKey=String(r.room).replace(/^0+(?=\d)/,"").trim();
    const folio=findFolioForRecord(r,folioTotals,groupAll);
    const calc=calculateExpected(r,rates);
    const actual=folio?folio.amount:null;
    const variance=calc.expected!==null && actual!==null ? actual-calc.expected : null;
    let status="Needs review";
    if (calc.missing.length) status="Missing contract rate";
    else if (actual===null) status="Missing in Folio";
    else if (Math.abs(variance)<=0.01) status="Match";
    else status="Rate / amount mismatch";
    rows.push({room:r.room,guest:r.guest,roomType:r.roomType,adults:r.adults,from:r.fromDate,to:r.toDate,reportRate:r.rate,expected:calc.expected,actual,variance,status,missing:calc.missing,folioLines:folio?.lines.length||0});
  }
  const extra=[];
  for (const [roomKey,folio] of folioTotals) if (!knownRooms.has(roomKey)) extra.push({room:folio.room,guest:[...folio.guests].filter(Boolean).join(" / "),amount:folio.amount,lines:folio.lines.length});
  const counts={match:rows.filter(r=>r.status==="Match").length,missingFolio:rows.filter(r=>r.status==="Missing in Folio").length,mismatch:rows.filter(r=>r.status==="Rate / amount mismatch").length,missingRate:rows.filter(r=>r.status==="Missing contract rate").length,extra:extra.length};
  const summary=`${counts.match} match · ${counts.mismatch} amount mismatch · ${counts.missingFolio} missing in Folio · ${counts.missingRate} missing contract rate · ${counts.extra} extra Folio room(s)`;
  $("previewCount").textContent=summary;
  preview.className="recon-wrap";
  const statusClass=s=>s==="Match"?"status-good":s==="Rate / amount mismatch"?"status-bad":s==="Missing in Folio"||s==="Missing contract rate"?"status-warn":"";
  preview.innerHTML=`<div class="recon-summary"><div><b>${counts.match}</b><span>Matches</span></div><div><b>${counts.mismatch}</b><span>Amount mismatches</span></div><div><b>${counts.missingFolio}</b><span>Missing in Folio</span></div><div><b>${counts.missingRate}</b><span>Missing rates</span></div><div><b>${counts.extra}</b><span>Extra Folio rooms</span></div></div><p class="footnote">Expected totals use the nightly rates entered below, matching the Group Report UPG room type and adult occupancy. Stay dates include arrival night and exclude departure date. Folio amounts are compared directly with contract rates without currency conversion. Use one currency consistently for the group. Folio lines are summed by room number. VAT/master-account lines are excluded. Review all matches against the source PDFs before relying on the results.</p><div class="table-wrap structured-table"><table><thead><tr><th>Status</th><th>Room</th><th>Guest</th><th>Room type</th><th>Occupancy</th><th>Stay</th><th>Group Report total</th><th>Expected contract total (${currencyLabel})</th><th>Folio total (${currencyLabel})</th><th>Difference (Folio − expected)</th><th>Details</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="audit-status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td><td>${escapeHtml(r.room)}</td><td>${escapeHtml(r.guest)}</td><td>${escapeHtml(r.roomType)}</td><td>${r.adults} adult(s)</td><td>${escapeHtml(r.from)} – ${escapeHtml(r.to)}</td><td>${money(r.reportRate,displayCurrency||"ILS")}</td><td>${r.expected===null?"—":money(r.expected,displayCurrency||"ILS")}</td><td>${r.actual===null?"—":money(r.actual,displayCurrency||"ILS")}</td><td>${r.variance===null?"—":money(r.variance,displayCurrency||"ILS")}</td><td>${r.missing.length?`Missing: ${escapeHtml(r.missing.join("; "))}`:`${r.folioLines} Folio line(s)`}</td></tr>`).join("")}</tbody></table></div>${extra.length?`<h4 class="recon-subhead">Folio rooms not found in any parsed report for this group</h4><div class="table-wrap structured-table"><table><thead><tr><th>Room</th><th>Guest name(s)</th><th>Folio total (${currencyLabel})</th><th>Folio lines</th></tr></thead><tbody>${extra.map(r=>`<tr><td>${escapeHtml(r.room)}</td><td>${escapeHtml(r.guest)}</td><td>${money(r.amount,displayCurrency||"ILS")}</td><td>${r.lines}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted small">No extra Folio rooms were found outside the selected group's parsed room list.</p>`}`;
}
function getSelectedGroupRecordsAllDates(group) {
  const rows=state.reports.flatMap(r=>r.structuredRecords||[]).filter(r=>normalizeGroupName(r.group)===normalizeGroupName(group) && Number(r.rms)>0);
  const unique=new Map();
  for (const r of rows) {
    const key=[r.group,r.room,r.reservation,r.fromDate,r.toDate,r.roomType].join("|").toLowerCase();
    if(!unique.has(key)) unique.set(key,r);
  }
  return [...unique.values()];
}

function renderStructuredRecords() {
  const preview = $("preview");
  const group = $("groupSelect").value;
  const scope = $("auditScope").value;
  const date = $("dateSelect").value;
  let rows = state.reports.flatMap(r => r.structuredRecords || []);
  if (group) rows = rows.filter(r => normalizeGroupName(r.group) === normalizeGroupName(group));
  if (scope === "date") rows = date ? rows.filter(r => r.reportDate === date) : [];
  $("previewCount").textContent = `${rows.length} parsed room record(s)`;
  if (scope === "date" && !date) {
    preview.className = "preview-empty";
    preview.textContent = "Choose a report date to view structured room records.";
    return;
  }
  if (!rows.length) {
    preview.className = "preview-empty";
    preview.textContent = "No room records were parsed for this selection. Check the raw Group Report tab to see whether the PDF layout needs a parser adjustment.";
    return;
  }
  preview.className = "table-wrap structured-table";
  preview.innerHTML = `<table><thead><tr><th>Report date</th><th>Room</th><th>Guest</th><th>Room type (UPG)</th><th>RM (reference)</th><th>Adults</th><th>Children</th><th>Rms</th><th>Rate code</th><th>Report rate</th><th>Stay</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.reportDate || "—")}</td><td>${escapeHtml(r.room)}</td><td>${escapeHtml(r.guest)}</td><td>${escapeHtml(r.roomType || "—")}</td><td>${escapeHtml(r.rmRoomType || "—")}</td><td>${r.adults}</td><td>${r.children}</td><td>${r.rms}</td><td>${escapeHtml(r.rateCode)}</td><td>${r.rate.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td>${escapeHtml(r.fromDate)} – ${escapeHtml(r.toDate)}</td></tr>`).join("")}</tbody></table>`;
}

function renderGroups() {
  const select=$("groupSelect");
  const prior=select.value;
  const all=[...new Set(state.reports.flatMap(r=>r.groups))];
  state.groups=all;
  select.innerHTML = all.length ? `<option value="">Select a group…</option>${all.map(g=>`<option>${escapeHtml(g)}</option>`).join("")}` : `<option value="">No group names detected</option>`;
  select.disabled=!all.length;
  if (all.includes(prior)) select.value=prior;
  const selected = select.value;
  if (state.activeGroup && state.activeGroup !== selected) saveActiveGroupRates();
  state.activeGroup = selected;
  renderGroupRates(selected);
  renderDateOptions(); renderSelection();
}
function renderDateOptions() {
  const dates=[...new Set(state.reports.flatMap(r=>r.dates))];
  $("dateSelect").innerHTML=dates.length?`<option value="">Choose a date…</option>${dates.map(d=>`<option>${escapeHtml(d)}</option>`).join("")}`:`<option value="">No report date detected</option>`;
}
function defaultLanguageForGroupType(groupType) {
  return groupType === "israeli" ? "he" : "en";
}
function defaultCurrencyForGroup(group) {
  const profile = groupProfiles.get(group) || {groupType:"tourist", language:"en"};
  const language = profile.language || defaultLanguageForGroupType(profile.groupType);
  return language === "he" ? "ILS" : "USD";
}

function updateGroupSettingsNote(groupType) {
  $("vatRuleNote").textContent = groupType === "israeli"
    ? "Israeli group: VAT is included in the prices. Preserve the Hebrew template's existing VAT calculation."
    : "Tourist group: VAT is entered manually in its separate section. Do not add VAT automatically to room charges.";
}

function renderSelection() {
  const group = $("groupSelect").value;
  const scope = $("auditScope").value;
  const date = $("dateSelect").value;
  $("dateWrap").classList.toggle("hidden", scope !== "date");
  const settings = [$("groupTypeSelect"), $("breakdownLanguage")];
  if (!group) {
    $("selectionSummary").innerHTML = '<span class="empty-symbol">⌁</span><b>No group selected yet</b><span>Choose a group to see only its report records.</span>';
    settings.forEach(control => control.disabled = true);
    $("vatRuleNote").textContent = "Select a group to configure its type and breakdown language.";
    renderPreview();
    updateExportButton();
    return;
  }
  settings.forEach(control => control.disabled = false);
  const matches = state.reports.filter(r => r.groups.includes(group));
  const visible = scope === "date" ? (date ? matches.filter(r => r.reportDate === date) : []) : matches;
  $("selectionSummary").innerHTML = `<b>${escapeHtml(group)}</b><span>Found in ${matches.length} uploaded report file(s).</span><span>${scope === "date" ? (date ? `${visible.length} report(s) found for ${escapeHtml(date)}.` : "Choose a report date to narrow the audit.") : "Full-stay view: all uploaded reports containing this group."}</span>`;
  const profile = groupProfiles.get(group) || {groupType:"tourist", language:"en", languageOverride:false};
  $("groupTypeSelect").value = profile.groupType;
  $("breakdownLanguage").value = profile.language || defaultLanguageForGroupType(profile.groupType);
  updateGroupSettingsNote(profile.groupType);
  renderPreview();
  updateExportButton();
}
$("groupSelect").addEventListener("change", () => {
  const nextGroup = $("groupSelect").value;
  if (state.activeGroup && state.activeGroup !== nextGroup) saveActiveGroupRates();
  state.activeGroup = nextGroup;
  renderGroupRates(nextGroup);
  renderSelection();
});
$("auditScope").addEventListener("change",renderSelection);
$("dateSelect").addEventListener("change",renderSelection);

function saveGroupProfile({languageWasManuallyChanged = false, groupTypeWasChanged = false} = {}) {
  const group = $("groupSelect").value;
  if (!group) return;

  const previous = groupProfiles.get(group) || {groupType:"tourist", language:"en", languageOverride:false};
  const groupType = $("groupTypeSelect").value;
  const languageOverride = languageWasManuallyChanged ? true : Boolean(previous.languageOverride);
  let language = $("breakdownLanguage").value;

  // Category supplies the initial language default only. Once the user chooses
  // a language manually, later category changes must not overwrite that choice.
  if (groupTypeWasChanged && !languageOverride) {
    language = defaultLanguageForGroupType(groupType);
    $("breakdownLanguage").value = language;
  }

  const profile = {groupType, language, languageOverride};
  groupProfiles.set(group, profile);
  persistWorkspace();
  updateGroupSettingsNote(groupType);
  rateBody.querySelectorAll("tr").forEach(updateRateCurrencyLabel);
  if (state.activeTab === "reconciliation") renderPreview();
  updateExportButton();
}

$("groupTypeSelect").addEventListener("change", () => {
  saveGroupProfile({groupTypeWasChanged:true});
});
$("breakdownLanguage").addEventListener("change", () => {
  saveGroupProfile({languageWasManuallyChanged:true});
});

function renderPreview() {
  const preview = $("preview");
  if (state.activeTab === "records") { renderStructuredRecords(); return; }
  if (state.activeTab === "folioRows") { renderFolioRecords(); return; }
  if (state.activeTab === "reconciliation") { renderReconciliation(); return; }
  if (state.activeTab === "groups") {
    if (!state.reports.length) {
      $("previewCount").textContent = "No data yet";
      preview.className = "preview-empty";
      preview.textContent = "Upload Group Reports and extract data to see the preview.";
      return;
    }

    const group = $("groupSelect").value;
    const scope = $("auditScope").value;
    const date = $("dateSelect").value;
    let reportSections = [];
    if (group) {
      const reports = state.reports.filter(r => r.groups.includes(group));
      const selectedReports = scope === "date" ? (date ? reports.filter(r => r.reportDate === date) : []) : reports;
      reportSections = selectedReports.map(report => ({
        report,
        sections: (report.groupSections || []).filter(section => normalizeGroupName(section.group) === normalizeGroupName(group))
      })).filter(item => item.sections.length);
      $("previewCount").textContent = scope === "date"
        ? `${reportSections.reduce((n, item) => n + item.sections.length, 0)} matching section(s) · ${date || "choose a date"}`
        : `${reportSections.reduce((n, item) => n + item.sections.length, 0)} matching section(s) across ${reportSections.length} report(s)`;
      if (scope === "date" && !date) {
        preview.className = "preview-empty";
        preview.textContent = "Choose a report date to preview only this group's records for that date.";
        return;
      }
      if (!reportSections.length) {
        preview.className = "preview-empty";
        preview.textContent = `No extracted section found for ${group}${scope === "date" ? ` on ${date}` : " in the uploaded reports"}. Check that extraction completed and the group name is detected correctly.`;
        return;
      }
    } else {
      reportSections = state.reports.map(report => ({
        report,
        sections: report.groupSections || []
      }));
      $("previewCount").textContent = `${state.reports.length} report file(s) · select a group to filter`;
    }

    preview.className = "";
    preview.innerHTML = reportSections.map(({ report, sections }) => {
      const text = group ? sections.map(section => section.text).join("\n\n") : report.text;
      const label = group ? `${group}${scope === "date" ? ` · ${date}` : ""}` : report.name;
      const chips = group ? "" : `<div style="padding:12px 14px">${report.groups.map(g => `<span class="group-chip">${escapeHtml(g)}</span>`).join("") || '<span class="muted small">No group header detected — inspect extracted text below.</span>'}</div>`;
      return `<details class="preview-block" open><summary><span>${escapeHtml(label)}</span><span>${escapeHtml(report.name)} · ${report.numPages} pages</span></summary>${chips}<pre>${escapeHtml(text.slice(0,24000))}${text.length>24000?"\n… preview limited to first 24,000 characters":""}</pre></details>`;
    }).join("");
  } else {
    $("previewCount").textContent = state.folioText ? "Folio extracted" : "No folio";
    if (!state.folioText) {
      preview.className = "preview-empty";
      preview.textContent = "No Folio PDF selected or extracted yet.";
      return;
    }
    preview.className = "";
    preview.innerHTML = `<details class="preview-block" open><summary>Folio extracted text</summary><pre>${escapeHtml(state.folioText.slice(0,24000))}${state.folioText.length>24000?"\n… preview limited to first 24,000 characters":""}</pre></details>`;
  }
}
$("previewTabs").addEventListener("click",e=>{
  const b=e.target.closest("[data-tab]");if(!b)return;
  state.activeTab=b.dataset.tab;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("selected",x===b));
  renderPreview();
});
$("parseBtn").addEventListener("click",async()=>{
  $("parseBtn").disabled=true; setStatus("Reading PDFs…");
  try{
    state.reports=[];
    for(let i=0;i<state.groupFiles.length;i++){
      const file=state.groupFiles[i];setStatus(`Reading ${i+1} of ${state.groupFiles.length}: ${file.name}`);
      const extracted=await extractPdf(file);
      extracted.groupSections=extractGroupSections(extracted.text);
      extracted.groups=[...new Set(extracted.groupSections.map(section=>section.group))];
      extracted.reportDate=detectReportDate(extracted.text,file.name);
      extracted.dates=extracted.reportDate?[extracted.reportDate]:[];
      extracted.structuredRecords=extracted.groupSections.flatMap(section => parseGroupRecords(section, extracted.reportDate, file.name));
      state.reports.push(extracted);
    }
    if(state.folioFile){setStatus("Reading Folio…");const f=await extractPdf(state.folioFile);state.folioText=f.text;state.folioRecords=parseFolioRecords(f.text);}
    renderGroups();renderPreview();
    const count=state.reports.reduce((n,r)=>n+r.groups.length,0);
    const roomCount=state.reports.reduce((n,r)=>n+(r.structuredRecords||[]).length,0);
    setStatus(`Extraction complete · ${state.reports.length} report(s), ${count} group detections, ${roomCount} parsed room records${state.folioFile?`, ${state.folioRecords.length} Folio room-charge lines parsed`:""}`);
  }catch(err){console.error(err);setStatus(`Could not read a PDF: ${err.message}`);}
  finally{$("parseBtn").disabled=false;}
});

const rateBody=$("rateRows");
rateBody.addEventListener("input",(event)=>{
  const row=event.target.closest("tr");
  if (row && event.target.matches('[aria-label="Contract rate"]')) {
    // A re-entered amount is explicitly confirmed in the currency required by the selected template.
    row.dataset.savedCurrency = getContractCurrency();
    updateRateCurrencyLabel(row);
  }
  saveActiveGroupRates();if(state.activeTab==="reconciliation")renderPreview();updateExportButton();
});
rateBody.addEventListener("change",()=>{saveActiveGroupRates();if(state.activeTab==="reconciliation")renderPreview();updateExportButton();});
function updateRateCurrencyLabel(row) {
  const required = getContractCurrency();
  const saved = row.dataset.savedCurrency || required;
  const label = row.querySelector(".rate-currency");
  if (label) {
    label.textContent = saved === required ? required : `${required} required · saved as ${saved}`;
    label.classList.toggle("currency-warning", saved !== required);
  }
}
function addRateRow(values={}) {
  const tr=document.createElement("tr");
  const requiredCurrency = getContractCurrency();
  tr.dataset.savedCurrency = values.currency || requiredCurrency;
  tr.innerHTML=`<td><input aria-label="Night date" type="date" value="${escapeHtml(values.date||"")}"></td><td><select aria-label="Room type">${ROOM_TYPES.map(rt=>`<option value="${rt.code}">${rt.code} — ${rt.en}</option>`).join("")}<option value="__OTHER__">Other / unmapped</option></select></td><td><select aria-label="Occupancy"><option value="1">1 adult</option><option value="2">2 adults</option><option value="3">3 adults</option><option value="4">4 adults</option></select></td><td><input aria-label="Contract rate" type="number" min="0" step="0.01" placeholder="0.00" value="${values.rate??""}"></td><td><span class="rate-currency"></span></td><td><button class="remove" aria-label="Remove night rate" title="Remove row">×</button></td>`;
  tr.querySelector('select[aria-label="Room type"]').value=ROOM_TYPES.some(rt=>rt.code===String(values.type||"").toUpperCase())?String(values.type).toUpperCase():"STR";
  tr.querySelector('select[aria-label="Occupancy"]').value=String(values.occupancy||1);
  updateRateCurrencyLabel(tr);
  tr.querySelector(".remove").addEventListener("click",()=>{tr.remove();saveActiveGroupRates();if(state.activeTab==="reconciliation")renderPreview();updateExportButton();});
  rateBody.appendChild(tr);
}
$("addRateBtn").addEventListener("click",()=>{addRateRow();saveActiveGroupRates();updateExportButton();});
addRateRow();addRateRow();addRateRow();
updateExportButton();


// -----------------------------------------------------------------------------
// Excel breakdown generation. The source workbooks are loaded and edited in the
// browser with ExcelJS so their original formatting, sheets and formulas remain.
// -----------------------------------------------------------------------------
function selectedGroupProfile() {
  const group = $("groupSelect").value;
  return groupProfiles.get(group) || { groupType: "tourist", language: "en", languageOverride: false };
}
function updateExportButton() {
  const button = $("exportBtn");
  if (!button) return;
  const group = $("groupSelect").value;
  const records = group ? getSelectedGroupRecordsAllDates(group) : [];
  const rates = getNightRates();
  button.disabled = !group || !records.length || !rates.length;
}
function excelDateLabel(iso) {
  const [y,m,d] = iso.split("-");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${d} ${months[Number(m)-1]} ${y}`;
}
function buildNightGroups(records, rates) {
  const byDate = new Map();
  const missing = [];
  for (const record of records) {
    for (const date of nightsBetween(record.fromDate, record.toDate)) {
      const key = `${date}|${String(record.roomType || "").toUpperCase()}|${Number(record.adults)}`;
      const rate = rates.find(item => item.date === date && item.type === String(record.roomType || "").toUpperCase() && item.occupancy === Number(record.adults));
      if (!rate) { missing.push(`${excelDateLabel(date)} · ${record.roomType} · ${record.adults} adult(s) · room ${record.room}`); continue; }
      if (!byDate.has(date)) byDate.set(date, new Map());
      const groups = byDate.get(date);
      if (!groups.has(key)) groups.set(key, { date, type: String(record.roomType || "").toUpperCase(), occupancy: Number(record.adults), rate: rate.rate, currency: rate.currency, count: 0, rooms: [] });
      const group = groups.get(key);
      group.count += 1; group.rooms.push(String(record.room));
    }
  }
  return { nights: [...byDate.keys()].sort().map(date => ({ date, items: [...byDate.get(date).values()].sort((a,b) => a.type.localeCompare(b.type) || a.occupancy-b.occupancy) })), missing };
}
function roomTypeLabel(code, language, occupancy) {
  const item = ROOM_TYPES.find(room => room.code === code);
  const description = item ? (language === "he" ? (item.he || item.code) : item.en) : code;
  if (language === "he") {
    const people = occupancy === 1 ? "מבוגר אחד" : `${occupancy} מבוגרים`;
    return `${description} — ${people}`;
  }
  return `${description} — ${occupancy} adult${occupancy === 1 ? "" : "s"}`;
}
function snapshotRowStyles(worksheet, rowNumber, maxCol) {
  const row = worksheet.getRow(rowNumber);
  return { height: row.height, cells: Array.from({length:maxCol}, (_,i) => structuredClone(row.getCell(i+1).style || {})) };
}
function applyRowSnapshot(worksheet, rowNumber, snapshot) {
  const row = worksheet.getRow(rowNumber);
  if (snapshot.height) row.height = snapshot.height;
  snapshot.cells.forEach((style, index) => { row.getCell(index+1).style = structuredClone(style); });
}
function parseMergeBounds(range) {
  const parts = range.split(":");
  const parse = address => { const m = address.match(/\$?([A-Z]+)\$?(\d+)/); return { col: m[1], row: Number(m[2]) }; };
  const a = parse(parts[0]), b = parse(parts[1] || parts[0]);
  return { start: a, end: b };
}
function shiftAddressRow(address, delta) {
  return address.replace(/(\$?[A-Z]+\$?)(\d+)/g, (_, col, row) => `${col}${Number(row)+delta}`);
}
function shiftExistingFormulas(worksheet, firstOldRow, delta) {
  if (!delta) return;
  worksheet.eachRow(row => row.eachCell(cell => {
    if (cell.value && typeof cell.value === "object" && cell.value.formula) {
      const formula = cell.value.formula.replace(/(\$?[A-Z]+\$?)(\d+)/g, (match, col, rowNum) => Number(rowNum) >= firstOldRow ? `${col}${Number(rowNum)+delta}` : match);
      cell.value = { ...cell.value, formula };
    }
  }));
}
function replaceRowsPreservingMerges(worksheet, startRow, deleteCount, newCount, formulaShiftThreshold) {
  const oldMerges = [...(worksheet.model.merges || [])];
  oldMerges.forEach(range => worksheet.unMergeCells(range));
  const delta = newCount - deleteCount;
  worksheet.spliceRows(startRow, deleteCount, ...Array.from({length:newCount}, () => []));
  shiftExistingFormulas(worksheet, formulaShiftThreshold, delta);
  for (const range of oldMerges) {
    const bounds = parseMergeBounds(range);
    if (bounds.end.row >= startRow && bounds.start.row < startRow + deleteCount) continue;
    const adjusted = bounds.start.row >= startRow + deleteCount ? shiftAddressRow(range, delta) : range;
    worksheet.mergeCells(adjusted);
  }
  return delta;
}
function setWorkbookDownload(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function getGroupStayRange(records) {
  const starts = records.map(r => reportDateToISO(r.fromDate)).filter(Boolean).sort();
  const ends = records.map(r => reportDateToISO(r.toDate)).filter(Boolean).sort();
  if (!starts.length || !ends.length) return "";
  return `${excelDateLabel(starts[0])} – ${excelDateLabel(ends[ends.length-1])}`;
}
function generateEnglishRoomRows(nights, worksheet) {
  const dataStyle = snapshotRowStyles(worksheet, 17, 7);
  const subtotalStyle = snapshotRowStyles(worksheet, 18, 7);
  const rows = [];
  for (const night of nights) {
    const dateLabel = excelDateLabel(night.date);
    rows.push({ kind: "night", label: `Night of ${dateLabel}` });
    for (const item of night.items) rows.push({ kind: "item", item, label: `${roomTypeLabel(item.type, "en", item.occupancy)} · ${dateLabel}` });
    rows.push({ kind: "subtotal", label: `Total Room charges — ${dateLabel}` });
    rows.push({ kind: "blank" });
  }
  return { rows, dataStyle, subtotalStyle };
}
async function exportEnglishWorkbook(group, records, nights, currency) {
  const response = await fetch("templates/Master%20%24.xlsx");
  if (!response.ok) throw new Error("Could not load the English Excel template (templates/Master $.xlsx).");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const worksheet = workbook.getWorksheet("גיליון1");
  if (!worksheet) throw new Error("The English template is missing its main worksheet.");
  const generated = generateEnglishRoomRows(nights, worksheet);
  const newCount = generated.rows.length;
  const delta = replaceRowsPreservingMerges(worksheet, 17, 30, newCount, 47);
  let rowNo = 17; const subtotalRows = []; let currentNightFirstItem = null;
  for (const entry of generated.rows) {
    const row = worksheet.getRow(rowNo);
    if (entry.kind === "night") {
      applyRowSnapshot(worksheet, rowNo, generated.dataStyle);
      row.getCell(2).value = entry.label;
      currentNightFirstItem = null;
      row.font = { ...(row.font || {}), bold: true };
      row.getCell(2).font = { ...(row.getCell(2).font || {}), bold: true };
    } else if (entry.kind === "item") {
      applyRowSnapshot(worksheet, rowNo, generated.dataStyle);
      row.getCell(2).value = entry.label;
      if (currentNightFirstItem === null) currentNightFirstItem = rowNo;
      row.getCell(3).value = entry.item.count;
      row.getCell(4).value = entry.item.rate;
      row.getCell(5).value = 1;
      row.getCell(6).value = { formula: `C${rowNo}*D${rowNo}*E${rowNo}` };
      row.getCell(4).numFmt = currency === "USD" ? '"$"#,##0.00' : '"₪"#,##0.00';
      row.getCell(6).numFmt = currency === "USD" ? '"$"#,##0.00' : '"₪"#,##0.00';
    } else if (entry.kind === "subtotal") {
      applyRowSnapshot(worksheet, rowNo, generated.subtotalStyle);
      row.getCell(2).value = entry.label;
      const firstItem = currentNightFirstItem ?? rowNo;
      row.getCell(6).value = { formula: `SUM(F${firstItem}:F${rowNo-1})` };
      subtotalRows.push(rowNo);
    } else {
      row.height = 7;
    }
    rowNo++;
  }
  const summaryRow = 17 + newCount;
  worksheet.getCell(`F${summaryRow}`).value = { formula: subtotalRows.map(r => `F${r}`).join("+") || "0" };
  worksheet.getCell(`B${summaryRow}`).value = " Total Room charges in USD";
  worksheet.getCell(`C3`).value = new Date();
  worksheet.getCell(`G3`).value = group;
  worksheet.getCell(`G8`).value = group;
  worksheet.getCell(`G9`).value = "Orient";
  worksheet.getCell(`G10`).value = getGroupStayRange(records);
  worksheet.pageSetup.printArea = `A1:G${75+delta}`;
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const buffer = await workbook.xlsx.writeBuffer();
  setWorkbookDownload(buffer, `${safeFilename(group)}_Breakdown_English.xlsx`);
}
async function exportHebrewWorkbook(group, records, nights) {
  const response = await fetch("templates/Master%20Hebrew.xlsx");
  if (!response.ok) throw new Error("Could not load the Hebrew Excel template (templates/Master Hebrew.xlsx).");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const worksheet = workbook.getWorksheet("גיליון");
  if (!worksheet) throw new Error("The Hebrew template is missing its main worksheet.");
  const headingStyle = snapshotRowStyles(worksheet, 23, 8);
  const columnStyle = snapshotRowStyles(worksheet, 24, 8);
  const dataStyle = snapshotRowStyles(worksheet, 25, 8);
  const subtotalStyle = snapshotRowStyles(worksheet, 28, 8);
  const vatStyle = snapshotRowStyles(worksheet, 29, 8);
  const rows = [];
  for (const night of nights) {
    rows.push({kind:"heading", label:`פירוט עלויות — ${excelDateLabel(night.date)}`});
    rows.push({kind:"columns"});
    for (const item of night.items) rows.push({kind:"item", item});
    rows.push({kind:"subtotal", label:"סה\"כ לחדרים לא כולל מע\"מ"});
    rows.push({kind:"vat", label:"סה\"כ לחדרים כולל מע\"מ"});
    rows.push({kind:"blank"});
  }
  const delta = replaceRowsPreservingMerges(worksheet, 17, 14, rows.length, 31);
  let rowNo=17; const vatRows=[]; let currentNightDataStart=null;
  for (const entry of rows) {
    const row=worksheet.getRow(rowNo);
    if (entry.kind === "heading") {
      applyRowSnapshot(worksheet,rowNo,headingStyle);
      row.getCell(2).value=entry.label;
      currentNightDataStart=null;
      row.getCell(2).font={...(row.getCell(2).font||{}),bold:true};
    } else if (entry.kind === "columns") {
      applyRowSnapshot(worksheet,rowNo,columnStyle);
      row.getCell(2).value="הרכב"; row.getCell(3).value="מחיר בשקלים"; row.getCell(4).value="חדרים"; row.getCell(5).value="לילות"; row.getCell(6).value="סה\"כ";
    } else if (entry.kind === "item") {
      applyRowSnapshot(worksheet,rowNo,dataStyle);
      row.getCell(2).value=roomTypeLabel(entry.item.type,"he",entry.item.occupancy);
      if(currentNightDataStart===null) currentNightDataStart=rowNo;
      row.getCell(3).value=entry.item.rate; row.getCell(4).value=entry.item.count; row.getCell(5).value=1;
      row.getCell(6).value={formula:`C${rowNo}*D${rowNo}*E${rowNo}`};
      row.getCell(3).numFmt='"₪"#,##0.00'; row.getCell(6).numFmt='"₪"#,##0.00';
    } else if (entry.kind === "subtotal") {
      applyRowSnapshot(worksheet,rowNo,subtotalStyle);
      row.getCell(2).value=entry.label;
      const start = currentNightDataStart ?? rowNo;
      row.getCell(6).value={formula:`SUM(F${start}:F${rowNo-1})`};
    } else if (entry.kind === "vat") {
      applyRowSnapshot(worksheet,rowNo,vatStyle);
      row.getCell(2).value=entry.label;
      row.getCell(6).value={formula:`F${rowNo-1}*1.18`};
      vatRows.push(rowNo);
    } else { row.height=7; }
    rowNo++;
  }
  const totalRow=17+rows.length;
  worksheet.getCell(`F${totalRow}`).value={formula:vatRows.map(r=>`F${r}`).join("+") || "0"};
  worksheet.getCell(`C4`).value=new Date();
  worksheet.getCell(`C10`).value=group;
  worksheet.getCell(`C11`).value="אוריינט";
  worksheet.getCell(`C12`).value=getGroupStayRange(records);
  worksheet.pageSetup.printArea=`A3:G${63+delta}`;
  workbook.calcProperties.fullCalcOnLoad=true;
  workbook.calcProperties.forceFullCalc=true;
  const buffer=await workbook.xlsx.writeBuffer();
  setWorkbookDownload(buffer,`${safeFilename(group)}_Breakdown_Hebrew.xlsx`);
}
function safeFilename(value) {
  return String(value||"Group").replace(/[\\/:*?"<>|]+/g,"_").replace(/\s+/g,"_").slice(0,80) || "Group";
}
async function generateBreakdown() {
  const group=$("groupSelect").value;
  if(!group) throw new Error("Select a group first.");
  if(!window.ExcelJS) throw new Error("The Excel workbook library did not load. Check your internet connection, then refresh the app.");
  const profile=selectedGroupProfile();
  const language=profile.language || defaultLanguageForGroupType(profile.groupType);
  if(profile.groupType==="tourist" && language==="he") throw new Error("The Hebrew template automatically adds 18% VAT. Tourist VAT must remain manual. Please select the English breakdown template for this group, or ask to define a Hebrew Tourist layout.");
  const currency=language==="he"?"ILS":"USD";
  const records=getSelectedGroupRecordsAllDates(group);
  if(!records.length) throw new Error("No primary room records were found for this group.");
  const rates=getNightRates();
  if(!rates.length) throw new Error("Enter contract rates before generating the breakdown.");
  const currencies=[...new Set(rates.map(r=>r.currency))];
  if(currencies.length!==1 || currencies[0]!==currency) {
    throw new Error(`This ${language==="he"?"Hebrew":"English"} breakdown requires all contract rates in ${currency}. Some saved rates are marked ${currencies.join(" / ")}. Re-enter those rate amounts in ${currency} (or delete and add the affected rows). No conversion is performed.`);
  }
  const built=buildNightGroups(records,rates);
  if(built.missing.length) throw new Error(`Missing contract rates for ${built.missing.length} room-night(s). Add the missing rates before exporting. First missing: ${built.missing.slice(0,5).join("; ")}`);
  if(!built.nights.length) throw new Error("No stay nights were found in the parsed room records.");
  if(language==="he") await exportHebrewWorkbook(group,records,built.nights);
  else await exportEnglishWorkbook(group,records,built.nights,currency);
  setExportStatus(`Excel breakdown generated for ${group}. Review the workbook before sending it.`,"success");
}
$("exportBtn")?.addEventListener("click",async()=>{
  const button=$("exportBtn"); button.disabled=true; setExportStatus("Preparing the Excel workbook…");
  try { await generateBreakdown(); }
  catch(error) { console.error(error); setExportStatus(error.message || "Could not generate the Excel workbook.","error"); }
  finally { updateExportButton(); }
});
