# Hotel Group Audit & Breakdown Automation

## Project idea
A local Windows browser app that audits hotel group stays, compares contract rates with Folio room charges, flags discrepancies, and prepares each group's breakdown in the hotel's existing Excel template. The user launches it by double-clicking `Start_Hotel_Audit.bat`; no Python installation should be required.

## Goals
- Import multiple Daily Group Report PDFs and a Folio PDF.
- Detect groups, dates and room records.
- Process **one group at a time**.
- Enter contract rates manually by night, room type and occupancy.
- Detect missing/unmatched rooms, incorrect amounts/rates and missing contract rates.
- Export a breakdown using the English or Hebrew Excel template.
- Preserve the working V4 parsing and reconciliation behaviour.

## Inputs
1. Daily Group Report PDF(s), covering the relevant dates.
2. Folio PDF with room charges and master-account information.
3. Existing English Excel template.
4. Existing Hebrew Excel template.

## Per-group settings
Each group has independent settings and progress:
- Category: Israeli or Tourist.
- Output language: Hebrew or English. Language is independently selectable; it is not forced by category.
- Contract rates per individual night/date, room type and occupancy.
- Currency follows the selected breakdown template: English room rates are USD; Hebrew breakdown rates are ILS.
- No exchange-rate setting or automatic currency conversion is used. Folio amounts are compared directly in the same currency as the group's contract rates. English incidentals are ILS.

## Reconciliation rules
- Group Report `UPG` identifies the room type used for contract rates and breakdowns; `RM` is retained for reference only; occupancy determines the applicable contract rate.
- Group Report `Rate` and Folio room charges are full-stay totals, not nightly amounts.
- Expected room amount = sum of applicable contract rates for every night of that room's stay.
- Compare expected full-stay amount with the Folio full-stay room charge.
- `Rms = 0` may be a secondary occupant; do not automatically count it as another room.
- Preserve leading zeroes in room numbers.
- Handle groups continuing across pages and wrapped PDF text.
- Guest names may appear in different word order between reports.
- Exclude master-account VAT lines from room-charge reconciliation for now.

## Official room type catalogue

| Code | English description | Hebrew description |
|---|---|---|
| STR | Orient Room | חדר אוריינט |
| SGR | Orient Garden Room | חדר אוריינט גן |
| SCR | Orient Colony City View Room | חדר אוריינט נוף למושבה |
| SOR | Orient Old City View Room | חדר אוריינט נוף לעיר העתיקה |
| TEXR | Templer Executive Room | טמפלר אקזקיוטיב |
| TSTR | Templer Standard Room | חדר טמפלר |
| TSUR | Templer Deluxe Room | חדר טמפלר דלוקס |
| FAP | Family Room | חדר משפחה |
| ZSR | Orient Suite | סוויטת אוריינט |
| ZCR | Orient Colony View Suite | סוויטת אוריינט נוף למושבה |
| ZOR | Orient Old City View Suite | סוויטת אוריינט נוף לעיר העתיקה |
| ZPR | Presidential Suite | סוויטה נשיאותית |
| ZRR | Orient Royal Suite | סוויטת אוריינט רויאל |
| ZER | Colony Suite | סוויטת קולוני |

| STRC | Orient Connecting Room | Hebrew description pending confirmation |

## Excel and VAT requirements
- Use the template matching the selected output language.
- Generate one room-charge section per night, with applicable room types, room counts, rates, line totals and nightly subtotal.
- Sections must expand dynamically rather than being limited to the templates' current fixed sections.
- For Israeli groups using the Hebrew template, preserve its existing VAT calculation exactly; do not reinterpret or replace its formulas.
- For Tourist groups using the English template, VAT is entered manually in a separate section; do not automatically add VAT.
- Retain Free/Staff, porterage and additional-expense sections. Their detailed calculations are not yet specified and must not be invented.

## Current status
- V4 PDF parsing and reconciliation is the known-good baseline and was confirmed working by the user.
- V5 added the room catalogue, a room-type dropdown for contract rates, per-group category/language settings, and template copies.
- V8 adds browser-local persistence for each group's category, language and contract-rate rows. Rates are saved and restored independently when switching groups.
- V9 adds initial Excel breakdown generation from the supplied English and Hebrew templates, with dynamic nightly room-charge sections, line formulas, nightly subtotals and an overall room-charge total.
- English room charges use USD; English incidentals remain ILS; Hebrew room charges use ILS. No currency conversion is used.
- Hebrew export repeats the existing 18% VAT formula pattern. Tourist + Hebrew export is blocked until a VAT-compatible Hebrew layout is defined.
- Free/Staff, porterage and incidental values are not automatically populated until their rules are supplied.
- ExcelJS is currently loaded from a CDN, so internet access is required.
- The user corrected a V5 JavaScript syntax error locally.
- The group-selection workflow is included in V8; preserve it when making further changes.
- Next: user acceptance-test the generated workbooks in desktop Excel, then add incidental inputs and contract-specific Free/Staff and porterage rules.

## Initial-version exclusions
Do not change V4 reconciliation rules without a specific requirement and regression test. Do not automate Free/Staff, porterage or additional expenses until the contract rules are provided. Do not automatically add Tourist VAT. Do not count `Rms = 0` as another room by default.


## V10 corrections
- Group Report `UPG` is the authoritative room type for contract-rate matching and Excel breakdowns. `RM` is displayed only as a reference field.
- Contract currency is determined by output language: English = USD; Hebrew = ILS. The rate table no longer allows per-row currency selection.
- Folio amounts are compared directly in the same required currency. No conversion is performed. English incidentals remain in ILS.
- Legacy saved rates marked in a different currency must be re-entered in the required currency before export; the app does not convert them.
