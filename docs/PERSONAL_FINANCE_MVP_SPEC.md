# Personal Finance Dashboard — MVP Product & Data Rules

**Status:** Draft for Linda's review  
**Date:** 2026-10-08  
**Purpose:** Turn the accepted four-tab prototype into a reliable first usable version. This is a product/data specification, not a claim that account connections or PDF parsing are already implemented.

## 1. Product goal

Give Linda one private place to understand:

1. Her current net worth across multiple financial institutions.
2. Her investment portfolio across iA Mobile and Wealthsimple, including major holding changes and sector/geographic exposure.
3. Which source and date each figure came from, so stale or uncertain data is visible.

The first version is a personal read-only tracker. It does not move money, trade, connect to bank credentials, or provide investment advice.

## 2. MVP scope

### Included

- Four tabs: **Overview**, **Accounts**, **Investments**, **Reports & Data Import**.
- Manually entered account-balance snapshots for cash, credit cards, and loans.
- Investment positions from a PDF report, CSV file when available, or manual entry.
- A review step before imported data changes saved account or position data.
- Net-worth history based on dated snapshots.
- Portfolio value and holding-value changes over quarter and year periods.
- Sector and geographic exposure from holdings with a known classification; show unknown coverage separately.
- Base-currency display in CAD, with each record retaining its original currency and the conversion rate/source used.

### Deferred to a later phase

- Transaction-level spending ledger and spending categories.
- AI Summary / ChatGPT connection.
- Automatic bank or brokerage connections.
- Notifications, budgets, forecasts, and financial recommendations.

These later features need transaction data and additional privacy, consent, and security design. The Overview can reserve a future space for an AI summary, but it will not send financial data to an AI service in the MVP.

## 3. Four-tab information architecture

### Overview — “Where do I stand?”

- Net worth and a dated trend plot.
- Total assets and total liabilities directly under net worth.
- Account overview separated into assets and liabilities.
- Credit card balances grouped separately from student loans; student loans split into **Federal**, **Alberta**, and **Quebec**.
- Investment summary shows the three largest holdings by current market value across platforms, with current value and quarter/year **holding value change**. It does not show platform balances as the main summary.

### Accounts — “What is each account worth?”

- The same net-worth/asset/liability dashboard at the top.
- Account list grouped by cash/deposits, investment accounts, credit cards, and student loans.
- Each account shows its balance, currency, source, and last-updated/report date.
- Future accounts such as a Rogers Mastercard can be added without appearing in totals until a balance is entered.

### Investments — “What do I own, and how has it changed?”

- Portfolio market value and account-level value change overview.
- Quarter/year selector for the account-level comparison.
- A clear label that balance changes are not investment returns when deposits, withdrawals, buys, or sells are not accounted for.
- Sector exposure and geographic exposure; geographic exposure uses a pie/donut chart.
- Holdings table with security name, platform/account, security type, sector/industry, current market value, and portfolio share. Filters are by platform or security type.
- Fund look-through is a classification method, not another asset. Its source/date and classified/unknown share belong in data notes, not in the asset summary.

### Reports & Data Import — “How do I update the data?”

- Three methods: PDF report, CSV file (when a platform can provide one), and manual entry.
- Upload first; attempt to identify platform, account, and report date from the file. Ask Linda to confirm or choose the account when confidence is insufficient. Do not require a platform dropdown before a file is selected.
- Show extracted rows and source page/row for review. Require confirmation before saving.
- Show recent imports and their status.

## 4. Data model

### Account

- Internal account ID; user-facing account nickname; institution/platform; account type; asset/liability side; currency; active/closed status.
- Do not store bank login credentials, full account numbers, or card numbers.

### Balance snapshot

- Account ID; amount; currency; effective/as-of date; entry timestamp; source (manual, PDF, CSV); import ID if applicable; confirmation status.
- Store liability balances as positive amounts owed. Display them with a minus sign and subtract them in net-worth calculations.

### Investment position snapshot

- Account ID; security name; ticker/fund code when available; security type; units; price; market value; currency; valuation date; source import; source page/row; review/confirmation status.
- Preserve separate source rows. Combine identical securities only in portfolio views, not by destroying the source records.

### Classification record

- Security ID; sector/industry; geographic definition and value; classification source; effective date; confidence/status.
- Unknown or incomplete classification remains explicit; it is never silently assigned to a sector or country.

### Import record

- Source institution/platform if detected; report date; import timestamp; file type; processing/review status; duplicate fingerprint; row counts and exceptions.
- Keep the extracted data and import provenance. Default requirement: discard the original uploaded report after successful confirmation unless a later design explicitly offers secure retention with a clear user choice.

## 5. Calculation rules

### Net worth

`Net worth = cash and deposits + investment account value − credit card balances owed − loan balances owed`

- Count an investment account only once. If a report supplies both an account total and positions, use the account total as the net-worth value and compare the position sum against it. Show a discrepancy for review; never add the total and its positions together.
- If no account total exists, use confirmed positions plus reported account cash, if available.
- Show each account's as-of date. The overview must disclose when its total combines snapshots from different dates.

### Historical chart

- Store each confirmed snapshot rather than overwriting history.
- Plot dated totals from the saved snapshots; do not invent intermediate values. Mark dates/accounts with stale or missing data.

### Holding/account value change

`Dollar change = current value − comparison-date value`  
`Percentage change = dollar change ÷ comparison-date value`

- Label this **value change**, not **investment return**, if the system lacks external cash-flow/transaction data.
- Actual performance will require transaction cash flows or a validated return figure from the investment report; add it only in a later phase with a stated method.

### Exposure

- Weight exposures by current market value.
- Classify only where security/fund data supports the classification.
- Show the percentage and value that remain unclassified. ETF look-through may use current fund holdings data only when the source and date can be recorded.

### Currency

- Preserve original currency at account/position level.
- Show CAD portfolio totals using a dated exchange rate, with rate date/source visible. If an applicable rate is unavailable, do not silently treat foreign currency as CAD.

## 6. Duplicate and correction handling

- Warn if the same file is imported again (file fingerprint plus source/report date).
- Warn if a confirmed snapshot already exists for the same account and as-of date.
- Let Linda review, replace, or keep both snapshots. Replacing a snapshot preserves an audit/history entry rather than silently deleting the previous confirmed record.
- Show position-total mismatches and parsing uncertainty before confirmation.

## 7. Privacy and security requirements

- No collection or storage of bank passwords or authentication tokens.
- No automatic connection to institutions in MVP.
- Do not transmit financial data to AI providers in MVP.
- Require a private, single-user access model before any real financial data is entered into a hosted build.
- Use encrypted transport and protected storage for any hosted version; do not retain source PDFs by default.
- Provide user-controlled export and deletion of stored records.
- Use fictional or redacted data during development and parser testing.

**Implementation decision still needed before real data:** choose local-only storage on one device versus a private hosted app with sign-in. Default recommendation is to build and test with fictional data first, then choose storage before importing real statements. This decision affects backup, multi-device access, and the security design.

## 8. Proposed build sequence

1. Approve these calculations and terminology.
2. Replace static prototype data with a working account/snapshot model and manual entry.
3. Add holdings entry and CSV import for known tabular data.
4. Add PDF extraction with a confirm-before-save review flow; validate with redacted sample reports.
5. Add dated sector/geography classification and data-quality notes.
6. Choose and implement private storage before real data; then evaluate AI Summary and spending transactions as a separate phase.

## 9. Prototype assumptions to replace with Linda's actual data

All institution balances, loan balances, holdings, performance changes, and report dates currently shown in the prototype are fictional. Before real use, replace them with user-provided account names and values. Supported institutions/platforms requested so far: CIBC, Wealthsimple, Manulife Bank, Desjardins, Simplii, iA Mobile, Amex, and later Rogers.
