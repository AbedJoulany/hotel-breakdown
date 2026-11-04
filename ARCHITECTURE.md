# Technical Architecture

## 1. Goals
- Local-first Windows application, launched through `Start_Hotel_Audit.bat`.
- No Python installation required for the user.
- Preserve the confirmed V4 parsing and reconciliation behaviour.
- Add functionality incrementally.
- Generate Excel workbooks from the supplied templates.
- Maintain independent configuration and progress for each group.

## 2. High-level architecture

```text
Windows user
    |
    v
Start_Hotel_Audit.bat
    |
    v
Local PowerShell server (local_server.ps1)
    |
    v
Browser UI (index.html + styles.css)
    |
    v
Application logic (app.js / feature modules)
    |
    +---- PDF import and parsing
    |        +---- Daily Group Report PDFs
    |        +---- Folio PDF
    |
    +---- Group workspace and per-group state
    |        +---- Category and language
    |        +---- Contract rates and currency
    |
    +---- Reconciliation engine
    |
    +---- Excel export engine
             +---- English template
             +---- Hebrew template
```

## 3. Existing project files
The V4/V5 project has included:
- `index.html` — browser application structure.
- `styles.css` — styling.
- `app.js` — browser-side logic.
- `Start_Hotel_Audit.bat` — Windows launcher.
- `local_server.ps1` — local server.
- `README.txt` — user instructions.
- `templates/` — English and Hebrew workbook templates.

Confirm exact filenames and current code structure against the latest ZIP before editing.

## 4. Logical modules

### PDF import and extraction
Accept multiple Group Report PDFs and a Folio PDF; extract text using PDF.js; retain source filename/page information where possible; report extraction errors.

### Group Report parser
Parse group headings and room records; associate records with group and date; handle page continuations and wrapped lines; parse room type, occupancy, room number, room count and report rate; preserve leading zeroes; do not automatically count `Rms = 0` rows as extra rooms.

### Folio parser
Extract room charges and guest/room identifiers; exclude master-account VAT lines from room-charge reconciliation; treat room charges as full-stay amounts; retain unmatched lines for review.

### Room catalogue
Provide the official room catalogue (15 codes, including STRC) and bilingual descriptions; supply contract-rate dropdown choices; map PDF room codes to the selected output-language description.

### Group workspace and configuration
Display detected groups; open one group at a time; store category, language and nightly rates independently per group; preserve progress when switching groups.

### Contract rate engine
Store rates by individual date/night, room type, occupancy and currency; resolve the applicable rate for each night; flag missing rates rather than guessing.

### Reconciliation engine
Calculate expected full-stay amounts by summing nightly rates; compare with Folio full-stay charges; identify matches, mismatches, missing Folio charges, Folio-only rooms and missing rates. Preserve V4 behaviour and add regression tests before changing it.

### Excel export engine
Load the selected template; create one dynamic room-charge section per night; add room types, quantities, rates and totals; calculate nightly and overall totals; preserve formatting, merged cells, formulas, print settings and right-to-left layout where required. Preserve Hebrew VAT formulas exactly; keep Tourist VAT manual; retain other template sections without unspecified calculations.

## 5. Conceptual data model

```js
Group {
  id,
  name,
  category,          // "israeli" | "tourist"
  language,          // "he" | "en"
  // no exchangeRate: currency conversion is currently disabled
  stayDates: [],
  contractRates: [
    { date, roomTypeCode, occupancy, amount, currency }
  ],
  auditStatus
}

GroupRoomStay {
  groupId,
  date,
  roomNumber,        // string; preserve leading zeroes
  guestName,
  roomTypeCode,
  occupancy,
  rms,
  reportStayAmount
}

FolioCharge {
  groupId,
  roomNumber,
  guestName,
  fullStayAmount,
  currency,
  sourcePage
}

ReconciliationResult {
  groupId,
  roomStayId,
  expectedFullStayAmount,
  folioFullStayAmount,
  difference,
  status
}
```

This is a conceptual model. Adapt it to the actual V4 parser output; do not rewrite working parsing logic merely to match this schema.

## 6. State and persistence
Each group's category, language and contract-rate rows are saved independently in browser local storage. Uploaded PDFs and parsed records are not persisted and must be reselected/re-extracted after a new session. Clearing site data or changing browser profile removes access to saved settings. Hotel files should not be uploaded to a remote service.

## 7. Excel generation strategy
1. Keep original templates as source assets.
2. Generate each export from a copy of the selected template.
3. Inspect and preserve styles, merged cells, formulas, row heights, column widths, print area, page orientation and RTL settings.
4. Expand or construct dynamic nightly sections while retaining the template design.
5. Verify formula behaviour supported by the chosen spreadsheet library.
6. Reopen generated workbooks in tests and inspect formulas, layout and print output.

Choose the browser-side Excel library and dependency packaging after inspecting the latest code and templates. The current prototype uses PDF.js from a CDN, so internet may currently be required unless dependencies are bundled locally.

## 8. Business rules to preserve
- Group Report rate and Folio room charge are full-stay totals.
- Expected amount is the sum of nightly contract rates.
- UPG room type and occupancy determine nightly rate.
- Rates may differ by individual night.
- Thursday and Friday nights are weekend nights for this hotel's rate rules.
- `Rms = 0` is not automatically another room.
- Room numbers are strings; preserve leading zeroes.
- Exclude master-account VAT lines from room-charge reconciliation.
- Preserve Hebrew template VAT formulas exactly.
- Tourist VAT is manual.
- Do not invent Free/Staff, porterage or additional-expense calculations.

## 9. Regression and acceptance tests
Before delivery:
- Run JavaScript syntax check.
- Launch via BAT file on Windows.
- Import known sample Group Report and Folio PDFs.
- Compare parsing and reconciliation with known-good V4 baseline.
- Test multiple report dates and groups.
- Test leading-zero room numbers and `Rms = 0` secondary occupants.
- Test multi-night stays with different nightly rates.
- Verify no currency conversion is applied; English room rates are USD, Hebrew room rates are ILS, and Folio is compared directly in the same group currency.
- Test missing rates, missing Folio charges, amount mismatches and Folio-only rooms.
- Switch groups and confirm independent settings.
- Export both templates and inspect formulas, layout and print settings.
- Test a multi-night stay with several room types and occupancy combinations.
- Verify English incidental section remains in ILS and is not affected by USD room-rate formatting.
- Verify the Hebrew VAT formula is applied to each nightly room-charge section and the total sums the VAT-inclusive nightly subtotals.


## 10. V9 Excel export implementation
- The UI includes a Generate Excel breakdown action for the active group.
- The English template is loaded from `templates/Master $.xlsx`; the Hebrew template is loaded from `templates/Master Hebrew.xlsx`.
- Nightly rows are grouped by date, room type and adult occupancy. Room counts, contract rates, line totals, nightly subtotals and the room-charge grand total are written as workbook values/formulas.
- The room-charge area expands dynamically; formulas and merged ranges in later template sections are shifted to the new row positions.
- The English incidental section is retained in ILS and is not automatically populated.
- Free/Staff and porterage sections are retained but not calculated.
- The Hebrew template's VAT pattern is repeated for each night. Tourist + Hebrew export is blocked because the Hebrew template adds VAT automatically, contrary to the Tourist manual-VAT rule.
- Export blocks on missing nightly rates, mixed contract currencies, or a currency that does not match the selected language template.
- ExcelJS is loaded from jsDelivr; an internet connection is currently required.
- The generator still needs user acceptance testing in desktop Excel, especially formula recalculation, print pagination and preservation of all template artwork/formatting.


## V10 corrections
- Group Report `UPG` is the authoritative room type for contract-rate matching and Excel breakdowns. `RM` is displayed only as a reference field.
- Contract currency is determined by output language: English = USD; Hebrew = ILS. The rate table no longer allows per-row currency selection.
- Folio amounts are compared directly in the same required currency. No conversion is performed. English incidentals remain in ILS.
- Legacy saved rates marked in a different currency must be re-entered in the required currency before export; the app does not convert them.
