# Smart Retail POS & Inventory Management System

A working React + Tailwind frontend, Express REST API, and PostgreSQL database for a fancy and school item shop. Full editable source, database schema, integration tests, and Docker configuration are included.

## Run the prepared local sample

The working folder already has installed dependencies, a compiled interface, and an isolated sample catalog. **Double-click `Start Smart Retail.cmd`** to start the local server and open the application. Open `LOCAL-ACCESS.txt` for its local URL and generated administrator credentials. You can also run `npm start` in this folder. Open **http://127.0.0.1:3001**, not the source `index.html` file. The sample catalog contains 16 products; it starts without fictional sales. Browser tests may add clearly sample transactions.

The downloadable source ZIP intentionally excludes local credentials, `.env`, database files, backups, and `node_modules`.

## Install from the source ZIP

Requires Node.js 22 or 24 and npm. PostgreSQL 17 is recommended for a multi-user installation. The optional embedded PGlite mode runs actual PostgreSQL through WebAssembly and is useful for a local trial or a single server process; never open one PGlite data directory from two processes.

1. Extract the ZIP and open a terminal in its `smart-retail` directory.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`.
4. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters. There is no built-in default password.
5. Set `APP_ORIGIN=http://127.0.0.1:3001` for the compiled local interface. Leave `DATABASE_URL` empty for PGlite, or set a PostgreSQL connection string for a dedicated database.
6. Run `npm run build`, then `npm start`.
7. Open `http://127.0.0.1:3001`. Sign in and configure shop identity, currency, time zone, default tax, receipt size, and cashier discount permissions.

Schema creation is automatic at startup. `server/schema.sql` is the complete initial schema. Administrator credentials are used only when no users exist. After bootstrap, remove `ADMIN_PASSWORD` from the running deployment environment; change passwords through the application.

For source development, use `APP_ORIGIN=http://127.0.0.1:5173` and `npm run dev`. Vite proxies `/api` to port 3001. Use exactly the configured origin, including `127.0.0.1` versus `localhost`.

For optional sample products in a **new, empty, non-production** database, add `DEMO_DATA=true` and run `node scripts/seed-demo.js` before starting the server. Do not use that database for live trading. Create a fresh data directory or database for the real shop.

## Included workflows

| Area | Implemented behavior |
| --- | --- |
| Authentication | Scrypt password hashing, signed JWT in HttpOnly SameSite cookies, login rate limits, active-user checks, session revocation, own-password changes |
| Administration | Shop dashboard, product and price management, categories, brands, suppliers, customers, employee accounts, fixed admin/cashier roles, configurable cashier discount limit |
| Catalog | Product code and barcode uniqueness, images, descriptions, units, cost and selling prices, discounts, tax, supplier/category/brand links, Excel import/export |
| Inventory | Automatic sale deductions and purchase additions, opening stock, damaged stock, signed adjustments, nonnegative stock constraints, low/out-of-stock views, movement history |
| POS | Search by name/code/barcode, keyboard-wedge scanner with Enter suffix, quantity controls, discounts, customer selection, cash/card/credit, change and deposits |
| Invoices | Stored shop/customer snapshots, historical line prices and costs, A4 and 80 mm browser printing, downloadable PDF, WhatsApp text invoice draft |
| Credit | Customer purchase history and statements, outstanding balances, partial invoice collections and payment history |
| Purchases | Multi-product supplier receipts, automatic stock/cost updates, partial supplier payments, purchase receipt printing and payment history |
| Expenses | Rent, electricity, transport, salary, and other expenses with date and employee attribution |
| Reports | Today/month dashboard, daily/weekly/monthly/yearly/custom date ranges, gross/net profit, product performance, expense charts, low/current stock and movement Excel exports, PDF summary |
| Operations | Audited changes, JSON backup/download/transactional restore, scheduled server backups with retention, responsive layout, light/dark themes |
| Languages | English plus Sinhala/Tamil navigation, common operational labels, form labels, table headings, and main billing labels; business content is preserved verbatim |

Staff are represented by the `users` table. Roles are deliberately fixed: admin has management access; cashier has catalog lookup, customer selection, checkout, and their own invoice history. Cashiers never receive product cost, profit reports, backup access, or administrative APIs. There is no arbitrary per-user permission builder beyond role assignment and the global cashier discount limit.

## Money, stock, and reporting rules

- Store money as integer minor units: 100 represents 1.00. Rates are integer basis points: 100 represents 1%. Configure a currency with two fractional digits; zero- or three-decimal currencies are not supported by this implementation.
- Product discounts are applied first, then the bill discount, then exclusive tax, rounded to the nearest minor unit per line. Product tax of zero inherits the shop tax rate; a separate tax-exempt flag is not included.
- Cashiers can apply only the configured maximum bill discount. Product prices and configured product discounts are calculated on the server.
- Checkout locks product rows in stable order and commits sales, payments, stock, and audit records together. A checkout UUID prevents a retried sale from deducting stock again. The browser keeps the UUID when a network error occurs until the basket changes.
- A purchase updates the product's current cost to its latest received unit cost. Sales preserve that cost at sale time. This is **last-purchase-cost reporting**, not FIFO or weighted-average accounting.
- Gross profit = sales total − sales tax − historical product cost. Net profit = gross profit − recorded expenses. Damaged stock reduces quantity but does not automatically post an expense; record the write-off expense separately if required by your bookkeeping process.
- Daily reporting uses the shop time zone. Reports are not accounting, tax-filing, or jurisdiction-specific fiscal software.
- Existing invoices preserve shop and customer snapshots. Stock adjustments append history; old invoices are not edited. Product deletion archives the item. Contacts/categories linked to records cannot be deleted.
- Card payments record payments taken on a separate terminal; no payment gateway or card-data processing is included. Credit sales require a customer. Supplier opening payments are recorded as cash; subsequent payments can be cash/card/bank.
- List screens show up to 2,000 recent sales, purchases, expenses, movements, and audit events. Financial reports aggregate the full selected period.

## Editable product options

In Add/Edit Product, Category, Brand, Supplier, and Unit accept typed names and offer existing values as suggestions. New categories, brands, and suppliers are created together with the product, so failed product saves do not leave unused records. Matching names are reused without regard to case or surrounding spaces. Clear an optional name to remove the association. Custom units are stored directly on the product. To rename an existing shared supplier/category/brand for every product, use its management screen.

## Excel

Export Products to obtain the import column template. In Excel, `purchase_price` and `selling_price` are normal currency amounts (125.50 means 125.50); `discount` and `tax` are percentages (10 means 10%). The browser converts them to the API’s integer representation. Category, brand, and supplier IDs must match existing records or be blank. Format barcode and product code columns as text to preserve leading zeros. Import adds new products only, validates all rows, and rolls the entire import back if any row fails; it does not overwrite existing codes. Maximum: 2,000 products / 5 MB per workbook. Formula cells are rejected. Exported data cells are written as values, never spreadsheet formulas.

## Printing and sharing

Set the browser printer's paper to A4 or 80 mm to match the chosen invoice format. For thermal printing set margins to none/minimum and disable browser headers/footers; receipt content is 76 mm wide. Printing uses the browser's normal print dialog, including Save as PDF. Barcode labels use CODE128 and the product barcode string. A scanner should operate as a keyboard and append Enter; focus the POS search field before scanning.

The dedicated PDF download uses PDFKit's built-in Latin font. For Sinhala/Tamil product/shop text, use browser Print → Save as PDF so installed system fonts can shape those scripts correctly. Translation coverage includes operational controls; help text, validation errors, and some detailed secondary screens remain English. Native-language copy review and complete secondary-string translation remain deployment work.

WhatsApp opens a prefilled text invoice addressed to the customer phone where provided. It does not automatically send the message or upload a PDF; the cashier reviews and sends it in WhatsApp. Use international phone numbers with country code.

## Backups and restoration

Automatic backups run in the server process every `BACKUP_INTERVAL_HOURS` (default 24), retaining `BACKUP_KEEP` files (default 14, minimum 2) in `BACKUP_DIR`. The process must remain running. Backups are consistent database snapshots and contain password hashes and customer details. Restrict the directory's filesystem permissions and copy backups to encrypted off-site storage using your deployment provider.

Admin Settings supports download and restore. Restore requires the current admin password, saves a safety backup first, checks the backup structure, restores all records within a transaction, resets sequences, and revokes every session. Sign in with credentials belonging to the restored database afterward. Browser restore supports approximately 19 MB; use PostgreSQL-native `pg_dump` / `pg_restore` for large installations.

`npm run backup` is an offline command for PGlite: stop the server first. With PostgreSQL it can run separately. Do not copy a live PGlite data folder as a backup. Scheduled JSON backups are local files, not a cloud disaster-recovery service. Monitor backup errors in server logs and test a restore into an isolated database.

## Production / cloud deployment

This application preserves the requested Express and PostgreSQL architecture. It has **not been deployed** to Sites: Sites' Worker hosting does not directly run this Node/Express server or its TCP PostgreSQL connection. Deploy the supplied Docker image to a Node/container host with PostgreSQL and HTTPS.

1. Create a dedicated PostgreSQL database and set `DATABASE_URL` (with TLS options appropriate to the provider).
2. Generate `JWT_SECRET`, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, and store it as a deployment secret.
3. Set `NODE_ENV=production`, `APP_ORIGIN=https://your-shop-domain`, `HOST=0.0.0.0`, bootstrap credentials, and a persistent backup directory.
4. Run `npm ci`, `npm run build`, and `npm start`, or build the provided Dockerfile.
5. Route an HTTPS reverse proxy to port 3001. Production session cookies require HTTPS. Do not expose the database port publicly.
6. For Compose, add `POSTGRES_PASSWORD`, `JWT_SECRET`, `APP_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` to the environment, then run `docker compose up --build -d`. The app binds port 3001 to host loopback, ready for your HTTPS reverse proxy. Use a URL-safe database password, or URL-encode it when composing a connection string.
7. One initial app instance should initialize the empty database. Horizontal scaling needs an external rate-limit store, a single backup scheduler, migration orchestration, and operational monitoring.

`/api/health` checks the database. The initial schema is idempotent; future schema changes require explicit migrations. Keep `package-lock.json` for repeatable installation. Review dependency advisories and apply compatible updates before live deployment.

## Verification and boundaries

Run `npm test` and `npm run build`. The integration suite runs against an isolated in-memory PostgreSQL/PGlite instance and covers authentication, cashier restrictions, stock atomicity, duplicate checkout protection, concurrent overselling, credit and supplier balances, failed-operation rollback, profit snapshots, exports, backup/restore, and session revocation.

This is a functional implementation, not a certification that it is ready for unsupervised commercial use. A real PostgreSQL-server deployment, Docker deployment, physical barcode scanner, physical thermal printer, backup schedule over 24 hours, and native-language invoice rendering have not been exercised in this workspace. Test those on the target shop equipment and review the calculation rules before entering live records. Returns/refunds, fiscal integrations, multi-branch inventory, offline sales, weighted-average costing, and payment-gateway integration are not included in this release.

## Source map

- `src/main.jsx`: login, navigation, dashboard, shared UI.
- `src/pos.jsx`: checkout and printable invoices.
- `src/pages.jsx`: management workflows, import/export, reporting, settings.
- `src/i18n.js`: Sinhala/Tamil operational labels.
- `src/styles.css`: responsive theme and print layout.
- `server/schema.sql`: relational schema and indexes.
- `server/app.js`, `security.js`: authentication, validation, middleware and bootstrap.
- `server/catalog.js`, `commerce.js`: management and transactional commerce APIs.
- `server/reports.js`, `backup.js`: reports, PDF/Excel output and backups.
- `tests/retail.test.js`: repeatable integration tests.

All management API calls are authenticated. Validation failures return 400, authentication failures 401, role denials 403, missing records 404, and stock/uniqueness conflicts 409. Database writes use parameterized queries; generic table/column identifiers come only from fixed server schemas.

## Products and navigation update — 28 September 2026

The Products page now uses a paginated server catalog with name/SKU/barcode search, exact barcode lookup, category and stock filters, sortable columns, real stock summaries, and product-specific low-stock thresholds. Desktop has a sticky table header; narrow screens use product cards and a collapsible navigation drawer. Shop identity and account controls stay outside the navigation scroll area.

Product forms group details, pricing, stock, and images, with inline validation. Category, brand, supplier, and unit remain editable. New products require an explicit low-stock threshold. Excel import accepts .xlsx files up to 5 MB / 2,000 rows, provides a template and row-level preview, and saves only after confirmation. Required headers are shown in the import dialog; prices use currency units and barcode/SKU cells should be text to retain leading zeros.

Use **Scan barcode** in Products to find an exact barcode, or in the product form to fill its barcode. USB/Bluetooth scanners that type text can use the focused barcode field and Enter. Camera scanning uses the browser's BarcodeDetector API and requires camera permission and a secure context (HTTPS or localhost). Unsupported browsers retain scanner/manual entry. Physical hardware has not been verified.

New catalog strings include English, Sinhala, and Tamil translations, and catalog styling supports both themes. Existing records and authentication are preserved. See VERIFICATION.md for completed checks and outstanding visual/device testing.

## Reliability and transaction workflow update

The application keeps its React/Express/PostgreSQL architecture, teal design, localized UI, existing records, and LKR defaults. Refunds are recorded after an administrator confirms the money was returned externally; there is no payment-gateway integration. Original invoice lines remain visible, corrected lines are marked, and separate correction/refund ledgers retain employee, reason and timestamp. Completed-sale counts exclude voided transactions. The UI displays transaction state separately from refund state when necessary (for example Voided / Refund Pending).

Products and Inventory share Add stock / Remove stock / Set actual quantity. Supplier deliveries belong in Purchases; manual changes display a reminder to avoid double counting. Inventory's opening-stock XLSX import accepts existing SKUs with headers `code`, `quantity`, `note` (maximum 500 rows, 5 MB), previews old/new quantities, rejects duplicates and stale counts, and commits all rows atomically. Held carts are stored per employee in this browser only; stock and current prices are rechecked on resume and at checkout. Checkout and purchase retries are protected by request IDs.

Product tax modes are explicit: shop, exempt, or custom. Legacy nonzero tax rates retain their custom meaning, while legacy zero retains shop-tax behavior. New expenses can use configurable category names and PNG/JPEG/WebP receipts up to 350 KB. Sales and activity filters run on the server; each result remains capped at 2,000 records. Supplier statements and customer credit settlements preserve payment history. Backup status shows the last successful server-side backup and the latest failure, if any.

Report sales/profit use corrected invoice totals for invoices dated in the selected range; money collected/refunds use payment dates. Pending refunds are current across all dates. Original sales, net sales, refunds, collections, balances, historical cost of goods and profit are shown separately. If a corrected item is not returned to stock, its historical cost remains in cost of goods. This convention is shown in the report interface; this is not a general accrual-period closing system.

See VERIFICATION.md for tests and remaining device/deployment limitations. This section supersedes earlier notes that refunds are unavailable.
