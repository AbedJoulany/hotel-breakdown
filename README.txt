HOTEL GROUP AUDIT — V9 EXCEL BREAKDOWN GENERATOR

HOW TO START (WINDOWS — NO PYTHON REQUIRED)
1. Extract the ZIP to a normal folder, for example Desktop\hotel_group_audit_v1.
2. Double-click Start_Hotel_Audit.bat.
3. Your browser should open http://127.0.0.1:8000.
4. Keep the PowerShell server window open while using the app.
5. To stop the app, click the server window and press Ctrl+C.

If Windows shows a security prompt, only continue if you trust the files you extracted. The launcher uses the Windows PowerShell included with Windows to serve this folder locally. It does not require Python or administrator rights. If port 8000 is already in use, close the other local server window and try again.

WHAT THIS VERSION DOES
- Accepts multiple daily Group Report PDFs.
- Accepts one Folio PDF.
- Extracts PDF text locally in your browser.
- Provides manual contract-rate entries by individual night, room type, adult occupancy, and currency. This supports different Thursday and Friday night rates.
- Saves group category, breakdown language, and contract rates separately for each group in this browser's local storage. Switching groups loads that group's own settings and rates.
- Adds a Reconciliation tab that sums Folio charges by room, calculates expected full-stay totals from nightly contract rates, and flags matches, amount mismatches, missing Folio charges, missing contract rates, and Folio rooms not found in the selected group reports.
- Reconciles Folio amounts directly against contract rates in the same currency. No exchange rate or currency conversion is used. Use USD for English-template room rates and ILS for Hebrew-template room rates; keep all rates for one group in a single currency.
- Adds a Parsed room records table with room, guest, room type, occupancy, Rms, rate code, rate and stay dates.
- Adds a Folio charges table with date, room, guest/description and charge. Master-account lines (including VAT) are excluded from the room-charge preview for now.
- Generates a downloadable Excel breakdown from the selected group's original English or Hebrew template.
- Creates dynamic nightly room-charge sections, grouping room counts by room type and adult occupancy.
- Includes line formulas, nightly subtotals and an overall room-charge total.
- Retains the template's existing Free/Staff and incidental sections without inventing their calculations.
- Keeps raw Group Report and Folio text available so parsed rows can be checked against the source.
- Filters the Group Report preview to the selected group.
- Supports full-stay previews across uploaded report dates or a specific report-date preview.
- Uses the standalone report date heading for the date filter, rather than guest arrival/departure dates.

IMPORTANT LIMITATIONS
The first Excel export implementation is available, but it must be checked against real completed breakdowns before use for billing decisions. The export creates room-charge rows from parsed room stays and the saved nightly rates; it does not populate Free/Staff, porterage, incidental or other contract-specific amounts because their calculation rules have not yet been provided. The first matching nightly contract rate is used when duplicate rates exist for the same date/type/occupancy. Folio amounts are currently summed by room number, so room-number reuse or multiple separate stays in the same room should be reviewed manually. Group settings and nightly rate entries are saved in browser local storage on this computer. They remain available after closing and reopening the browser on the same browser profile. Clearing this site's browser data, using a different browser/profile, or using a different computer will remove or not show these saved settings. Uploaded PDFs are not saved by this feature and must be selected again. The structured parser is designed around the sample Group Report and Folio layouts; verify parsed rows against the raw text, especially reservation numbers that wrap across lines, guest rows with Rms=0, and master-account charges. Currency conversion has been removed. The selected group's Folio amounts are assumed to use the same currency as its contract rates. Mixed currencies in the group's contract-rate entries are flagged for review.

INTERNET REQUIREMENT
The app currently loads PDF.js and ExcelJS from CDNs, so the computer needs internet access when opening the app. The PDFs are processed inside your browser; this local server does not upload them to a remote service. PDF.js can be bundled with the app in a later version to remove this internet dependency.

NEXT IMPLEMENTATION STEPS
1. Test the generated English and Hebrew workbooks with one completed group each; inspect formulas, formatting, print layout and totals in Excel.
2. Adjust room descriptions, section labels and header fields based on your review.
3. Add manual inputs for incidentals in ILS to the English template.
4. Add Free/Staff, porterage and other contract-specific inputs only after you provide their rules.
5. Add export handling for any special category/language combinations that you need.


HOW TO GENERATE A BREAKDOWN
1. Import the Group Report PDFs and the group's Folio PDF, then extract the data.
2. Select one group.
3. Confirm its category and breakdown language.
4. Enter a nightly contract rate for every stay night, room type and adult occupancy used by the group.
5. Use USD rates for the English template or ILS rates for the Hebrew template. Keep one currency throughout the group.
6. Click Generate Excel breakdown. The app stops and lists the first missing rate if any room-night rate is absent.
7. Open the downloaded workbook in Excel and review all rows, formulas, totals and print layout before using it.

The generated room-charge rows are based on primary room records (Rms > 0). Each night is grouped by room type and adult occupancy. The quantity is the number of parsed rooms in that combination.

V5 ADDITIONS
- Adds the 15 supplied room codes and their English/Hebrew descriptions.
- Contract-rate room type is now selected from the catalogue rather than typed freely.
- Adds per-group settings for Israeli/tourist category and English/Hebrew breakdown language.
- Israeli category defaults to Hebrew; tourist category defaults to English. Language can be overridden.
- Shows the VAT handling note for the selected category: Israeli uses the Hebrew template's existing VAT calculation; tourist uses the English template with VAT entered manually in its separate section.
- Group category/language settings are saved locally in the browser, independently by group.

V9 EXCEL EXPORT UPDATE
- Adds an Excel export button for the selected group.
- Uses the original English or Hebrew workbook template as the source; the source templates are not overwritten.
- Generates one room-charge section per stay night, with separate lines for each room type and adult occupancy.
- Calculates line totals, nightly subtotals and the overall room-charge total using Excel formulas.
- Expands the room-charge area for longer stays while retaining the later template sections and shifting their formula references.
- English room charges use USD; the English incidental section remains in ILS.
- Hebrew room charges use ILS and retain the template's 18% VAT calculation pattern.
- Tourist groups using the Hebrew template are blocked for now because that template automatically calculates VAT, while Tourist VAT must remain manual.
- Missing nightly rates, mixed currencies, and template/rate currency mismatches prevent export.
- ExcelJS is loaded from a CDN, so internet access is required.
- PDF parsing and reconciliation logic was not intentionally changed.

The Excel export is an initial implementation and still requires your review in Excel before operational use. Free/Staff, porterage and incidental amounts are preserved as template sections but are not auto-filled.

ROOM CATALOGUE UPDATE
- STRC — Orient Connecting Room (Hebrew description pending confirmation).
 
CURRENCY RULE UPDATE
- English breakdown room rates: USD.
- English template incidentals / extra costs: ILS.
- Hebrew breakdown amounts: ILS.
- No exchange-rate field or automatic conversion is used. Folio amounts are assumed to be in the same currency as the selected group's contract rates.


V8 PER-GROUP WORKSPACE UPDATE
- Group category and breakdown language are persisted separately for each detected group.
- Contract-rate rows are persisted separately for each group; switching groups saves the current group's rates and loads the selected group's rates.
- Saved settings use browser local storage on this computer. They are not uploaded. Uploaded PDF files are not persisted and must be selected again in a new session.
- Existing reconciliation and PDF parsing logic has not been intentionally changed.


## V10 corrections
- Group Report `UPG` is the authoritative room type for contract-rate matching and Excel breakdowns. `RM` is displayed only as a reference field.
- Contract currency is determined by output language: English = USD; Hebrew = ILS. The rate table no longer allows per-row currency selection.
- Folio amounts are compared directly in the same required currency. No conversion is performed. English incidentals remain in ILS.
- Legacy saved rates marked in a different currency must be re-entered in the required currency before export; the app does not convert them.
