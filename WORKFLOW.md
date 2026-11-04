# Application Workflow

The application processes **one group at a time**.

## 1. Start
1. Double-click `Start_Hotel_Audit.bat`.
2. The local PowerShell server starts and the browser app opens.
3. Keep the server window open while using the app.

## 2. Import documents
1. Upload one or more Daily Group Report PDFs for the dates being audited.
2. Upload the Folio PDF.
3. Extract and parse the reports.
4. Display all detected groups in a selectable list.

## 3. Select one group
1. Select one group from the list.
2. Open its dedicated workspace.
3. Allow the user to return to the group list when finished or when pausing.
4. Keep each group's settings and progress independent when switching groups.

## 4. Configure the group
Set:
- Category: Israeli or Tourist.
- Breakdown language: Hebrew or English.
- English breakdown room rates: USD.
- Hebrew breakdown room rates: ILS.
- No exchange-rate conversion is applied; Folio amounts are compared directly in the same currency as the group's contract rates. English incidentals remain ILS.

Category and language are separate settings. The app may suggest a default language based on category, but the user can override it.

## 5. Enter contract rates
1. Show the group's individual stay nights/dates.
2. Enter the rate for each date, room type from the official catalogue, occupancy and currency.
3. Allow rates to differ by individual night, including Thursday and Friday.
4. Allow review and editing before reconciliation. Rates are saved locally and independently for each group.

## 6. Review reconciliation
For each room stay:
1. Read room type and occupancy from the Group Report.
2. Resolve the applicable contract rate for every night.
3. Sum nightly rates to calculate the expected full-stay amount.
4. Find the corresponding Folio room charge.
5. Compare expected and actual full-stay amounts.

Show statuses for:
- Match.
- Amount/rate mismatch.
- Missing Folio charge.
- Folio room not found in Group Report.
- Missing contract rate / incomplete setup.

Do not automatically count `Rms = 0` as another room. Preserve leading zeroes in room numbers. Exclude master-account VAT lines from room-charge matching. Flag uncertain matches for review rather than silently assigning them.

## 7. Generate Excel
1. Confirm the output language and corresponding template.
2. Confirm that all room-night rates are entered and use the template currency (English = USD; Hebrew = ILS).
3. Generate the workbook for the selected group.
4. Review each nightly section, room type, occupancy, count, rate and subtotal in Excel.
5. Review the final room-charge total and the retained Free/Staff and incidental sections.
6. Save or rename the generated workbook as needed.

The first export implementation currently creates the room-charge breakdown only; it does not fill Free/Staff, porterage or incidental amounts. Tourist + Hebrew export is blocked because the Hebrew template automatically adds VAT, while Tourist VAT must remain manual.


## 8. Next group
Return to the group list, select the next group, load its own saved configuration and progress, and repeat.

## 9. Error handling
Identify PDFs that fail extraction. Flag uncertain group/room matches. Never guess missing contract rates. Keep unmatched Folio charges visible. Do not modify the original source files.


## V10 corrections
- Group Report `UPG` is the authoritative room type for contract-rate matching and Excel breakdowns. `RM` is displayed only as a reference field.
- Contract currency is determined by output language: English = USD; Hebrew = ILS. The rate table no longer allows per-row currency selection.
- Folio amounts are compared directly in the same required currency. No conversion is performed. English incidentals remain in ILS.
- Legacy saved rates marked in a different currency must be re-entered in the required currency before export; the app does not convert them.
