# V11 Phase 1 — Room-night foundation

This module is deliberately **not connected** to the current UI or Excel export.

- `extractRoomNights(records)`: maps existing `parseGroupRecords` rows to immutable per-report-night records and reports invalid rows.
- `detectDuplicateNights(nights)`: flags the same room in the same group on the same report date.
- `buildStays(nights)`: groups by group + room + reservation. Without reservation, it does not guess a stay.
- `detectMissingNights(stays)`: creates **review candidates only**, never billable nights.
- `auditRoomNights(records)`: orchestrates the above.

Input is the existing browser parser's object shape. Dates are normalized to ISO YYYY-MM-DD. Monetary values are kept as supplied; **no contract, Folio, VAT, corrections, UI or Excel logic is implemented in phase 1**.

Run tests in Node.js using `node --test tests/roomNightEngine.test.mjs` (Node 22+ recommended; the test imports an ES module). If the repository is not configured for ESM, copy the engine to a `.mjs` module for isolated execution or configure module type before running; do not change the existing app loading behavior merely for the tests.
