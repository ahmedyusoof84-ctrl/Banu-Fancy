# Verification record

Date: 27 September 2026

- `npm test`: **17 tests passed**, zero failures. Tests use isolated in-memory PostgreSQL/PGlite databases, not the sample shop.
- `npm run build`: **passed**. Vite produces the client in `dist/`. Excel functionality is loaded on demand; the ExcelJS chunk triggers a bundle-size advisory.
- Dependency audit after the `uuid` compatibility override: **0 reported vulnerabilities** in the installed dependency tree at this check. The lockfile records exact resolved versions. This is an advisory scan, not an independent security audit.
- Browser: administrator sign-in succeeded; dashboard and catalog rendered; POS checkout completed for one sample pen at LKR 40 with LKR 100 tendered and LKR 60 change; the invoice displayed the matching figures; catalog stock changed from 120 to 119.
- The sample database is clearly identified in the interface and is separate from the test databases. One browser-test sale remains in the sample workspace.

## Automated coverage

1. Missing authentication, cross-origin rejection, and JSON request enforcement.
2. Product + bill discount ordering, tax rounding, and unavailable-product errors.
3. Catalog creation, opening-stock history, and cashier API access restrictions.
4. Atomic checkout and repeated-checkout idempotency.
5. Rejection of insufficient tender, negative quantities, and overselling.
6. Cashier discount restrictions and another cashier's invoice access.
7. Customer deposits, partial credit collection, and overpayment rejection.
8. Purchases, stock increases, supplier payments, and overpayment rejection.
9. Damage recording, nonnegative stock, and purchase rollback.
10. Competing checkouts against limited stock.
11. Historical-cost profit, expenses, Excel exports, and PDF output.
12. Backup validation, restoration, and revoked pre-restore sessions.
13. Disabled users and logged-out session rejection.

## Not verified here

Hosted PostgreSQL, Docker runtime, cloud deployment, physical receipt/barcode printers, hardware scanner behavior, browser print pagination on long invoices, native-language print shaping, and a full 24-hour scheduled-backup cycle. Mobile styles are implemented but have not had a device-by-device visual audit. Help text and secondary language strings remain partly English. See README for the supported accounting rules and deployment requirements.

The delivered application should be accepted on the actual shop's equipment and deployment environment before live commercial use.

## Editable product options update

Four additional integration tests verify creating typed options and custom units, case-insensitive option reuse, editing/clearing associations, and rollback of new options if product saving fails. Production build passed after this change.

## Products and shared navigation update — 28 September 2026

- Latest `npm test`: **23 passed, 0 failed** using isolated databases. Added six catalog/import tests, covering pagination, sorting, summary thresholds, combined filters, literal wildcard search, exact barcode matching (SCAN1 must not match SCAN10), plural units, import preview without writes, leading zeros and currency conversion, invalid/missing columns, duplicate values, reference IDs, and admin-only access.
- Latest `npm run build`: **passed**. The main and lazy ExcelJS bundles still produce Vite size advisories.
- Browser checks completed before the browser connection was interrupted: desktop catalog at a 1440 x 1000 viewport, pinned sidebar identity/account, real summary counts (45 total / 8 low / 7 out in the disposable fixture), low-stock filtering, filter reset, and scanner/manual-entry dialog. A partial barcode-match issue found in this check was corrected and covered by the exact-match integration assertions.
- No real shop records were changed by this update's tests. Browser testing used a separate in-memory fixture on port 3002.
- Outstanding: tablet/mobile visual checks, light/dark and Sinhala/Tamil visual checks, full keyboard focus traversal, and browser-level create/edit/delete/import workflows could not be completed after the browser tool returned ERR_BLOCKED_BY_CLIENT for the local QA page. Responsive layouts and translations are implemented, but are not reported as visually verified. Their underlying product/permission/import operations pass the integration suite.
- Camera decoding, USB/Bluetooth hardware, and physical barcode-label printing remain unverified. Camera support depends on the browser's native BarcodeDetector and camera permission; manual/scanner text input remains available.

This update supersedes the earlier 17-test count. Prior deployment and hardware limitations still apply.

## Row deletion update

Product, customer, supplier, and expense rows have Delete actions with Cancel/Delete confirmations, pending/error handling, refreshed lists, and localized success messages. Products retain stock/transaction history through archival. Linked customers and suppliers are archived and excluded from active lists; existing invoices, statements, and payments remain accessible. Unlinked contacts and expenses are deleted; expense details are retained in the activity log. Customer/supplier active columns are added idempotently at startup; existing records default to active.

Verification: all 24 automated tests passed, including linked/unlinked deletion, repeated requests, invoice and payment preservation, audit details, and unauthorized/cashier rejection. Production build passed. This update was not visually retested in the browser; the preceding browser-tool limitation remains.

## Incorrect invoice items and stock availability

Products now offer Update stock, including Set out of stock (quantity zero), a required reason, history entries, and conflict detection to prevent overwriting a concurrent stock change. Stock badges and summary counts refresh from saved quantities.

Reports > Product performance and Sales offer Remove incorrect entry. Select the specific original invoice line, provide a reason, and confirm Remove. The full line quantity is restored to stock, and the original line's recorded price/discount/tax/cost is removed from invoice and report totals. The line is retained with removal timestamp/reason; an audit entry preserves the correction. Duplicate correction requests cannot restore stock twice. Existing payments remain unchanged, and excess payment is shown as Refund / correction due on invoices and sales. The app does not send or settle refunds; those must be handled separately. This is for incorrect entries, not a general physical-return workflow.

Verification: 26 automated tests passed, including exact stock transitions, stale quantity rejection, permissions, preserved payments, original line accounting, duplicate removal protection, and updated reports. Production build passed. Browser visual verification and physical device checks remain outstanding. No existing shop transactions were removed during implementation.

## Opening and received stock update

Update stock now offers Set current quantity (Opening stock or Count correction) and Add received stock. Both show the old/new quantities before saving. A required note, server timestamp, movement reason, delta, balance, and employee are stored in stock history. Stale previews are rejected rather than overwriting a concurrent sale. Sales already deduct inventory atomically; this behavior remains covered by tests. Products, Inventory, and POS use the same persisted quantity, refresh when revisited/focused, and poll visible stock views every 15 seconds for changes made elsewhere.

Verification: 26-test suite passed; the stock test was then extended and passed for opening quantity 25, receipt +5, sale -3, matching catalog/POS API quantity 27, history reasons/timestamps, and stale receipt rejection. Production build passed. Visual browser retesting remains outstanding.

## Prioritized reliability update

- Inspected the live invoice SR-20260927-2CE74F5B02 (id 34): current total 0, paid LKR 130, one previously removed line. Saved a pre-update safety snapshot outside the source archive.
- Tested migration on a disposable copy of that snapshot: original item and LKR 130 original total remain available, employee-linked correction retained, transaction Voided, refund status Refund Pending, no refund fabricated. No actual refund was recorded during implementation.
- Added separate correction and refund ledgers, original invoice display, statuses, refund recording with idempotency and pending-amount validation, and consistent balances. Voided transactions are counted separately. Historical costs remain fixed; costs for corrected goods not returned to stock remain recognized.
- Added the shared three-mode stock editor, validated/previewed atomic opening-stock import, retry-safe purchase receiving, held/resumable browser-local carts, compact product cards, category search, sticky checkout area, tax modes, margin/below-cost warnings, duplicate product-field checks, server-side sales/activity filters, supplier statements, configurable expense categories/receipt images, and backup status.
- Fixed client DELETE requests missing JSON headers. Linked records continue to archive. Report actions now lead to original invoices.
- `npm test`: 33 passed, zero failures, including refunds/full and partial corrections, original invoice retention, payment and credit balances, stock return exactly once, historical costs, distinct tax modes, bulk-import rollback and retries, purchase retries, receipt storage, filters, permissions, backup restoration, checkout duplicate protection and competing checkouts. Two tests render the stock/refund components as HTML with an isolated context; these are not browser interaction tests.
- Production build passed. Vite still warns about bundle size; ExcelJS remains loaded on demand.
- Outstanding: no browser automation tool was available for this turn, so desktop/tablet/mobile visual and keyboard interaction checks were not completed. Camera/scanner/printer hardware, live PostgreSQL/Docker deployment, payment-gateway refunds, and a full scheduled-backup cycle remain unverified. Held carts are local to the browser/employee; receipt attachments are images only; sales/audit listings cap results at 2,000. Refund records do not send money.

## Transaction actions and expense editing — 28 September 2026
- Original transactions and Sales rows share View/Open invoice, Correct invoice item, Void invoice, and Record refund actions. Actions respect role, transaction state, and pending refund balance. Correction from a product report preselects that invoice item.
- Whole-invoice void requires a reason and explicit confirmation, reverses remaining lines in one transaction, optionally restores stock once, and preserves original lines/payments and employee/time audit history. Refunds remain a separate recorded action.
- Expenses now support editing category, amount, date, description, and receipt, with server validation and before/after audit history.
- Existing product/contact/category/brand CRUD and archive behavior retained. Purchase deliveries and audit records retain their history-preserving workflows rather than unrestricted deletion.
- Added English/Sinhala/Tamil strings, wrapping row controls, and direct workflow focus. Build now uses Vite's config runner to avoid parent-folder lookup restrictions.
- Validation: npm test, 37 passed; npm run build passed. Live authenticated Sales, Expenses, original transaction query, health, and app page returned 200. No real sales were changed or refunded during testing.
- Limitations: automated UI checks render components; interactive desktop/mobile browser testing was unavailable. Refund records do not transfer money. Existing bundle-size warning remains.

## Delete incorrect invoice — 28 September 2026
- Administrators can open an invoice from Sales or Original transactions and choose Delete incorrect invoice. A reason and explicit confirmation that no goods or money changed hands are required. Invoices with a recorded refund cannot use this action.
- The deletion is atomic. Stock not already restored by earlier corrections returns once. The invoice, original items, payments, and an employee/time/reason audit record remain available in Sales → Show deleted invoices. Repeated deletion and later refunds, payments, or corrections are rejected.
- Deleted invoices are excluded from normal Sales lists, customer balances and statements, Reports totals/counts/charts/product performance, and report Excel stock movements. The activity log and Inventory movement history retain the audit trail.
- Private pre-upgrade backup saved under work/safety. The existing live shop database was migrated in place; no real invoice was deleted during implementation.
- Validation: 39 automated tests passed; production build passed; live health, Sales, deleted Sales list, Reports, Excel export, Customers, and a historical invoice returned 200. Live browser interaction on desktop/mobile remains unverified.

## Dashboard report links — 28 September 2026
- Dashboard monthly sales, Today's sales, gross profit, expenses, low stock, shop counts, sales overview, best-seller rows and stock rows now open their matching report, inventory or record page.
- Reports Today, 7 days, This month and This year buttons update all report figures and export date ranges immediately. The active preset is visible; manual dates remain available with Apply.
- Preset dates use the configured shop timezone. Inventory's Low stock view includes out-of-stock items so it matches the dashboard count. Interactive cards have keyboard focus and accessible labels. Added English/Sinhala/Tamil control labels.
- Validation: 40 tests passed, production build passed, live Today's sales matched the Today report, and the latest build was served. Interactive browser layout testing unavailable in this environment.

## Reports PDF and Excel redesign — 28 September 2026
- PDF export uses the teal shop branding and mirrors the Reports page: four headline totals, money/balances, daily sales and profit, product performance, and expense categories. A4 layout includes repeat table headings and page footers. A 4-page sample was rendered and visually checked.
- Excel export starts with a styled report overview for the selected dates and LKR numeric amounts, then has readable daily, product, and expense sheets. Existing low-stock, current-stock, and stock-movement sheets remain. Date-scoped sheets use the selected report period.
- Automated export test downloads both files and parses Excel to reconcile visible amounts with report data. Full suite: 41 tests passed. Live authenticated PDF and Excel downloads succeeded and the live Excel sales amount matched the selected Reports API result.
- PDF/Excel report labels remain English, as they were before this change; on-screen interface language support remains unchanged.

## Prepared internet deployment — 28 September 2026
- Added Render Blueprint for a paid Docker web service, PostgreSQL database in Singapore, and persistent backup disk. Production startup can use Render's HTTPS URL as APP_ORIGIN while retaining an explicit custom-domain override.
- Saved a private, current shop backup outside the source archive for later migration. No customer or credential data was sent to GitHub or a hosting provider.
- Validated that the production server starts with Render's URL and an isolated empty database. The live local app remains available.
- No public URL exists yet. Hosting requires a Render account or another provider with deployment access, resource selection, and migration of the local backup.
