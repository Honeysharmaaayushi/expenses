# My Expense Manager

A personal and business expense tracker for Android. It works offline, keeps all data on your phone, and has no subscription or cloud account.

It is a **Progressive Web App (PWA)**. You put the folder on a free HTTPS host once, open it in Chrome on your Vivo X300, and tap **Add to Home screen**. After that it opens full-screen from its own icon, like a native app, and works without internet.

---

## 1. Install on your Vivo X300

A PWA has to be served over HTTPS **once**, so Chrome can install it and cache it for offline use. GitHub Pages is free and permanent.

### Step A: put the app online (one time, about 5 minutes, easiest on a computer)

**Option 1: GitHub Pages (recommended, free, permanent)**
1. Create a free account at **github.com**.
2. Click **+ → New repository**. Name it `expenses`, choose **Public**, then click **Create**.
3. Click **uploading an existing file**. Drag in **everything inside** the `expense-manager` folder (`index.html`, `manifest.webmanifest`, `sw.js`, and the `css`, `js` and `icons` folders), then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Branch*, choose `main` and `/ (root)`, then click **Save**.
5. After about a minute your app is live at `https://YOUR-USERNAME.github.io/expenses/`.

> Your **financial data is never uploaded**. The website only contains the empty app. Your transactions are stored inside Chrome on your phone.

**Option 2: Netlify Drop.** Go to **app.netlify.com/drop**, sign in, and drag the `expense-manager` folder onto the page. You get an `https://….netlify.app` address.

### Step B: install it and create the home-screen icon
1. On the Vivo X300, open **Chrome** and go to your app address.
2. Tap **⋮ (three dots) → Add to Home screen → Install**. If Chrome shows an **Install app** banner, you can tap that instead.
3. A green **Expenses** icon appears on your home screen. Open the app from this icon from now on.
4. Open the app once while online. After that it works fully offline.
5. Long-press the icon to see the shortcuts **Add Expense** and **Today's Report**.

**Vivo tip:** go to *Settings → Battery → Background power consumption management* and leave Chrome **unrestricted**. Do not use "Clear storage" on Chrome, because that would delete the app's data, including your transactions.

### Optional: a real APK file
You can build a signed APK for free from your app's address:
1. On a computer, go to **pwabuilder.com** and enter your app's URL (from Step A).
2. Click **Package for stores → Android → Generate package**, then download the zip.
3. Copy the `.apk` file inside the zip to your phone and open it. Allow "Install unknown apps" for your file manager when asked.

The APK is a wrapper around the same app, and it uses the same on-phone data as the Chrome version.

---

## 2. Quick user guide

### Add an expense (about 10 seconds)
1. Tap **+ Add** in the bottom bar, or the big green **Add Expense** button on Home.
2. Type the **amount**. The number keypad opens automatically.
3. Tap **Personal** or **Business**, then tap a **category**.
4. Tap the **payment method** (UPI, Cash, Bank Transfer, Cheque or Credit Card), then the **account** it came from.
5. Today's date is already selected. Notes are optional.
6. Tap **Save**. To enter several expenses in a row, tap **Save & Add Another**.

The app remembers your last choices. Personal expenses default to the Saving Account and business expenses to the Current Account, and you can change this with one tap.

**Personal/Business and the account are separate choices.** For example, ₹2,000 of personal shopping paid from the **Current Account** is recorded as a **Personal** expense.

### Credit cards
- **When you buy with the card:** add a normal expense and choose method **Credit Card**. It counts as spending on the purchase date.
- **When you pay the card bill:** go to **Add → Card Bill**, pick the card, tap **Pay full**, choose the bank account and save. This only reduces what you owe. **It is never counted as an expense again.**
- The **Accounts** screen shows each card's outstanding amount, limit, purchases, payments and history.

### Moving money (not an expense)
- **Add → Transfer → Between my accounts:** for example, Saving → Current.
- **Add → Transfer → Withdraw:** an ATM withdrawal into your Cash Wallet. You can also choose "Outside" for money that leaves without being an expense, such as a loan you gave or an investment.
- **Add → Add Money:** salary, customer payments, deposits and refunds.

### Edit or delete
Tap any transaction anywhere in the app. You can change the amount, category, method, account, date, or Personal/Business, or delete it. Deleting asks for confirmation first. Balances and all reports update immediately.

### Reports (Reports tab)
| Screen | What it shows |
|---|---|
| **Daily** | Total, Personal and Business amounts; UPI/Cash/Bank/Cheque/Card totals; a table of every expense; a daily total. Transfers and card payments are listed separately as "not counted". |
| **Monthly** | Totals, average per day, highest day, a daily chart, and spending by category, payment method and account. **Compare months** (for example October vs November) shows what went up ▲ or down ▼. |
| **Yearly** | Monthly comparison chart and table, plus category, method and account analysis. You can choose the year. |
| **Methods** | Pie chart and table of amounts and percentages per payment method. Filter by Personal, Business or Both, and by period. |
| **Search** | Combine filters: text in notes, date range, amount range, category, Personal/Business, method, and account or card. |

Each Home-screen question has an answer in the app:
- *How much did I spend?* → Home: Today, This Month, or any date filter
- *Personal vs Business?* → Home split bar, and every report
- *Which categories?* → Home Top Categories and Monthly/Yearly reports
- *Which payment method?* → Reports → Methods
- *Spent from Saving or Current?* → "By account" in Monthly/Yearly, or open the account
- *Card outstanding?* → Home Balances, or the Accounts tab

---

## 3. Backup and restore (important)

All data stays on your phone in permanent storage (IndexedDB). It is not a temporary cache. Phones can still be lost or reset, so **back up every week**. The app shows a reminder after 7 days.

**Back up:** go to **Settings → Backup & Restore** and tap:
- **Share / Save to Drive**, then choose Google Drive, Gmail or WhatsApp ("Message yourself"). This is the easiest option.
- or **Download backup**, which saves `my-expenses-backup_DATE.json` to your Downloads folder.

**Restore, or move to a new phone:**
1. Install the app on the new phone (see section 1). Use the same web address if you can.
2. Go to **Settings → Restore from backup file** and pick the `.json` file.
3. Confirm. All accounts, cards, categories and transactions come back exactly as they were.

**Excel:** go to **Settings → Export to Excel (CSV)** for all transactions, any month's report or any year's report. Search results can also be exported with the **CSV** button. The files open directly in Excel or Google Sheets, and ₹ symbols and names display correctly.

**Sample data:** use **Settings → Load sample data** to explore the app, then **Remove all sample data** before real use. Your own entries are never touched.

---

## 4. How it works (for reference)

### Architecture
```
index.html          app shell and 5-tab bottom navigation
css/app.css         mobile-first design (white, green accent, large touch targets)
js/core.js          ALL accounting and report maths (pure functions, unit-tested)
js/db.js            IndexedDB storage (atomic writes, full replace for restore)
js/app.js           screens, forms, charts (hand-drawn SVG, no external libraries)
sw.js               service worker: caches the app for offline use
manifest.webmanifest  install info, icons and shortcuts
tests/              core.test.js (41 accounting checks), e2e.py (48 phone-browser checks)
```
There are no external libraries or network calls. The whole app is under 200 KB, including icons.

### Database (IndexedDB `my-expense-manager`)
| Store | Fields |
|---|---|
| `accounts` | id, name, type (`bank` / `cash` / `card`), opening (for cards: outstanding at start), limit |
| `categories` | id, name, purpose (`personal` / `business`), system (the "Others" category cannot be deleted) |
| `txns` | id, kind, date (YYYY-MM-DD), amount, purpose, categoryId, method, accountId, toAccountId, notes, createdAt, updatedAt |
| `meta` | last backup time, remembered choices |

### One ledger, five kinds of entries
| Kind | Effect on balances | In expense reports? |
|---|---|---|
| `expense` | − paid-from account (on a card it increases what you owe) | **Yes**. It is the only kind that counts. |
| `income` | + account | No |
| `transfer` | − from, + to | No |
| `cardpay` (card bill) | − bank/cash, reduces card outstanding | No (a settlement) |
| `out` (money out, not an expense) | − account | No |

**Balances are never stored.** They are calculated from opening balance plus all ledger entries every time. Because of this, editing or deleting an entry always gives correct balances and reports, and an entry cannot be counted twice. Every screen and export uses the same `summarize()` function, and amounts are calculated in paise to avoid rounding errors.

### Tests that were run
- `node tests/core.test.js`: **41/41 passed.** Covers the accounting rules, edits, deletes, transfers, card purchase and settlement, purpose filters, Indian number format, date ranges, CSV and backup checks.
- `python3 tests/e2e.py`: **48/48 passed.** Runs the real app in headless Chrome at phone size. It covers opening balances, adding a card, quick add, Save & Add Another, validation, transfers, card bill payment, dashboard filters, editing, deleting, daily/monthly/yearly/method reports, chart taps, multi-filter search, adding and deleting categories, CSV exports, backup → erase → restore, persistence after reload, loading and removing sample data, offline reload and adding an expense while offline. No JavaScript errors occurred.
