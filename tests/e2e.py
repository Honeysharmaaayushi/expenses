# End-to-end test in headless Chrome at phone size. Run: python3 tests/e2e.py  (serves the app on :8765)
import subprocess, time, json, os, sys, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, '..', 'shots'); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8765/index.html'
results = []; errors = []
def check(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (('  ' + str(extra)) if not cond else ''))

def money(s): return float(re.sub(r'[^\d.\-]', '', s) or 0)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, locale='en-IN', timezone_id='Asia/Kolkata')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(URL); pg.wait_for_selector('.add-big')
        st = lambda js: pg.evaluate(js)
        check('Home renders with 3 default accounts', st('__EM.S.accounts.length') == 3)
        check('Default categories 7 personal + 9 business', st("__EM.S.categories.filter(c=>c.purpose=='personal').length") == 7 and st("__EM.S.categories.filter(c=>c.purpose=='business').length") == 9)
        pg.screenshot(path=f'{SHOTS}/01_home_empty.png')

        # ---- opening balances
        for name, amt in [('Saving Account', '50000'), ('Current Account', '100000'), ('Cash Wallet', '5000')]:
            pg.goto(URL + '#accounts'); pg.click(f'.item:has-text("{name}")'); pg.click('a[aria-label="Edit"]')
            pg.fill('input[name=opening]', amt); pg.click('button[type=submit]'); pg.wait_for_timeout(150)
        bal = st('__EM.C.balances(__EM.S.accounts, __EM.S.txns)')
        check('Opening balances saved', bal['acc_saving'] == 50000 and bal['acc_current'] == 100000 and bal['acc_cash'] == 5000, bal)

        # ---- add credit card
        pg.goto(URL + '#account-edit/new-card'); pg.fill('input[name=name]', 'HDFC Card'); pg.fill('input[name=limit]', '100000'); pg.click('button[type=submit]'); pg.wait_for_timeout(150)
        check('Credit card added', st("__EM.S.accounts.some(a=>a.type=='card' && a.name=='HDFC Card')"))

        def add_expense(amount, purpose, category, method, account, again=False, notes=''):
            pg.goto(URL + '#home'); pg.click('.add-big'); pg.wait_for_selector('#f-amount')
            pg.fill('#f-amount', amount)
            pg.click(f'.purpose button[data-v={purpose}]')
            pg.click(f'button[data-act=fCat]:text-is("{category}")')
            pg.click(f'button[data-act=fMethod][data-v="{method}"]')
            pg.click(f'button[data-act=fAcc]:has-text("{account}")')
            if notes: pg.fill('#f-notes', notes)
            pg.click('button[data-act=fSave][data-v=close]'); pg.wait_for_timeout(200)

        t0 = time.time()
        add_expense('2000', 'personal', 'Shopping', 'UPI', 'Current Account', notes='Diwali shopping')
        check('Saved toast shown', 'Saved' in pg.inner_text('#toast'))
        add_expense('1000', 'business', 'Petrol', 'Cash', 'Cash Wallet')
        add_expense('10000', 'personal', 'Shopping', 'Credit Card', 'HDFC Card', notes='TV')
        add_expense('500', 'personal', 'Food', 'UPI', 'Saving Account')
        check('Quick add works (4 expenses entered)', st("__EM.S.txns.filter(t=>t.kind=='expense').length") == 4)

        # Save & Add Another flow
        pg.goto(URL + '#add'); pg.fill('#f-amount', '300'); pg.click('.purpose button[data-v=business]'); pg.click('button[data-act=fCat]:text-is("Transport")')
        pg.click('button[data-act=fMethod][data-v="UPI"]'); pg.click('button[data-act=fSave][data-v=again]'); pg.wait_for_timeout(200)
        check('Save & Add Another keeps form open with empty amount', pg.input_value('#f-amount') == '' and '#add' in pg.url)
        check('Amount field uses numeric keyboard', pg.get_attribute('#f-amount', 'inputmode') == 'decimal')
        # validation
        pg.fill('#f-amount', '50'); pg.click('button[data-act=fSave][data-v=close]'); pg.wait_for_timeout(100)
        check('Validation: category required', 'Choose a category' in pg.inner_text('#f-err'))
        pg.screenshot(path=f'{SHOTS}/02_add_expense.png')

        # ---- transfer 20,000 Saving -> Current
        pg.goto(URL + '#add/transfer'); pg.fill('#f-amount', '20000')
        pg.click('button[data-act=fAcc]:has-text("Saving Account")'); pg.click('button[data-act=fTo]:has-text("Current Account")')
        pg.click('button[data-act=fSave]'); pg.wait_for_timeout(200)
        # ---- card bill payment 10,000 from Saving
        pg.goto(URL + '#add/cardpay'); pg.click('button[data-act=fTo]:has-text("HDFC Card")'); pg.wait_for_timeout(50)
        pg.screenshot(path=f'{SHOTS}/03_card_bill.png')
        pg.click('button[data-act=payFull]'); pg.click('button[data-act=fAcc]:has-text("Saving Account")'); pg.click('button[data-act=fSave]'); pg.wait_for_timeout(200)

        S = lambda: st("(()=>{const t=__EM.C.todayStr();return __EM.C.summarize(__EM.S.txns,{from:t,to:t})})()")
        s = S(); bal = st('__EM.C.balances(__EM.S.accounts, __EM.S.txns)')
        card = st("__EM.C.cardSummary(__EM.S.accounts.find(a=>a.type=='card'), __EM.S.txns)")
        check('Today total = 2000+1000+10000+500+300 (no transfer, no card bill)', s['total'] == 13800, s['total'])
        check('Personal = 12500 (incl. personal paid from Current)', s['personal'] == 12500, s['personal'])
        check('Business = 1300', s['business'] == 1300, s['business'])
        check('Saving = 50000-500-20000-10000', bal['acc_saving'] == 19500, bal)
        check('Current = 100000-2000+20000-300 (business default = Current)', bal['acc_current'] == 117700, bal)
        check('Cash = 4000', bal['acc_cash'] == 4000, bal)
        check('Card: purchases 10000, paid 10000, outstanding 0', card['purchases'] == 10000 and card['payments'] == 10000 and card['outstanding'] == 0, card)

        pg.goto(URL + '#home'); pg.wait_for_timeout(100)
        home = pg.inner_text('#view')
        check('Dashboard shows today total ₹13,800', '₹13,800' in home)
        check('Dashboard shows Current balance ₹1,17,700 (Indian format)', '₹1,17,700' in home)
        pg.screenshot(path=f'{SHOTS}/04_home.png', full_page=True)
        for preset in ['today', 'yesterday', 'week', 'month', 'year', 'custom']:
            pg.click(f'button[data-act=dash][data-v={preset}]'); pg.wait_for_timeout(60)
        check('Dashboard date filters all work (no errors)', not errors, errors)
        pg.click('button[data-act=dash][data-v=month]')

        # ---- edit: change the ₹2,000 personal shopping to business purchasing ₹2,500
        pg.goto(URL + '#reports/search'); pg.fill('input[data-in=qText]', 'Diwali'); pg.wait_for_timeout(100)
        check('Search by notes finds 1', pg.locator('#q-results .item').count() == 1)
        pg.click('#q-results .item'); pg.wait_for_selector('#f-amount')
        pg.fill('#f-amount', '2500'); pg.click('.purpose button[data-v=business]'); pg.click('button[data-act=fCat]:text-is("Purchasing")')
        pg.screenshot(path=f'{SHOTS}/05_edit.png')
        pg.click('button[data-act=fSave]'); pg.wait_for_timeout(200)
        s = S(); bal = st('__EM.C.balances(__EM.S.accounts, __EM.S.txns)')
        check('After edit: personal 10500, business 3800', s['personal'] == 10500 and s['business'] == 3800, (s['personal'], s['business']))
        check('After edit: current balance 117200', bal['acc_current'] == 117200, bal)

        # ---- delete the food expense
        tid = st("__EM.S.txns.find(t=>t.kind=='expense' && t.amount==500).id")
        pg.goto(URL + '#edit/' + tid); pg.click('button[data-act=fDelete]'); pg.wait_for_selector('.sheet')
        pg.click('.sheet button[data-r="1"]'); pg.wait_for_timeout(200)
        s = S(); bal = st('__EM.C.balances(__EM.S.accounts, __EM.S.txns)')
        check('After delete: total 13800-500+500(edit) = 13800', s['total'] == 13800, s['total'])
        check('After delete: saving balance back +500', bal['acc_saving'] == 20000, bal)
        check('Deleted txn is gone from reports', not st(f"__EM.S.txns.some(t=>t.id=='{tid}')"))

        # ---- reports
        pg.goto(URL + '#reports/daily'); pg.wait_for_timeout(100)
        dtxt = pg.inner_text('#view').lower()
        check('Daily report total + table', 'daily total' in dtxt and '₹13,800' in dtxt)
        check('Daily report lists card bill & transfer under "Not counted"', 'not counted as expenses' in dtxt and 'card bill paid' in dtxt)
        pg.screenshot(path=f'{SHOTS}/06_daily.png', full_page=True)
        pg.goto(URL + '#reports/monthly'); pg.wait_for_timeout(100)
        mtxt = pg.inner_text('#view').lower()
        check('Monthly report renders categories/methods/compare', 'by category' in mtxt and 'compare months' in mtxt and 'highest day' in mtxt)
        pg.click('.chart rect.hit >> nth=5'); check('Chart bar tap shows tooltip', '₹' in pg.inner_text('.chart-tip'))
        pg.screenshot(path=f'{SHOTS}/07_monthly.png', full_page=True)
        pg.click('button[data-act=monthNav][data-v="-1"]'); pg.click('button[data-act=monthNav][data-v="1"]')
        with pg.expect_download() as dl: pg.click('button[data-act=exportMonth]')
        mcsv = open(dl.value.path(), encoding='utf-8-sig').read()
        check('Monthly CSV export contains summary', 'Total Expenses,13800.00' in mcsv, mcsv[:200])
        pg.goto(URL + '#reports/yearly'); pg.wait_for_timeout(100)
        check('Yearly report renders', 'monthly comparison' in pg.inner_text('#view').lower())
        with pg.expect_download() as dl: pg.click('button[data-act=exportYear]')
        check('Yearly CSV export', 'Yearly Expense Report' in open(dl.value.path(), encoding='utf-8-sig').read())
        pg.goto(URL + '#reports/methods'); pg.wait_for_timeout(100)
        mt = pg.inner_text('#view')
        check('Methods report: Credit Card share 72.5%', '72.5%' in mt, mt[:400])
        pg.click('button[data-act=mPurposeM][data-v=business]'); pg.wait_for_timeout(60)
        check('Methods business filter total ₹3,800', '₹3,800' in pg.inner_text('#view'))
        pg.screenshot(path=f'{SHOTS}/08_methods.png', full_page=True)

        # ---- search multi filter
        pg.goto(URL + '#reports/search'); pg.click('button[data-act=qClear]')
        pg.select_option('select[data-in=qMethod]', 'Credit Card'); pg.click('button[data-act=qPurpose][data-v=personal]'); pg.wait_for_timeout(80)
        check('Multi-filter search (Credit Card + Personal) = 1', pg.locator('#q-results .item').count() == 1)

        # ---- accounts / categories
        pg.goto(URL + '#accounts'); pg.screenshot(path=f'{SHOTS}/09_accounts.png', full_page=True)
        pg.click('a.acc:has-text("HDFC Card")'); pg.wait_for_timeout(80)
        check('Card detail shows history', 'history (2)' in pg.inner_text('#view').lower())
        pg.goto(URL + '#categories'); pg.click('button[data-act=addCat][data-v=business]'); pg.fill('#pb-in', 'GST Payment'); pg.click('.sheet button[type=submit]'); pg.wait_for_timeout(100)
        check('Custom category added', st("__EM.S.categories.some(c=>c.name=='GST Payment')"))
        cid = st("__EM.S.categories.find(c=>c.name=='Transport').id")
        pg.click(f'button[data-act=delCat][data-v="{cid}"]'); pg.click('.sheet button[data-r="1"]'); pg.wait_for_timeout(150)
        check('Deleting category moves its expense to Others (total unchanged)', S()['total'] == 13800 and not st(f"__EM.S.txns.some(t=>t.categoryId=='{cid}')"))

        # ---- backup -> erase -> restore
        pg.goto(URL + '#settings')
        with pg.expect_download() as dl: pg.click('button[data-act=backup]')
        bpath = dl.value.path(); backup = json.load(open(bpath))
        check('Backup JSON has all txns', len(backup['txns']) == st('__EM.S.txns.length'))
        n_before = st('__EM.S.txns.length')
        pg.click('button[data-act=eraseAll]'); pg.click('.sheet button[data-r="1"]'); pg.fill('#pb-in', 'DELETE'); pg.click('.sheet button[type=submit]'); pg.wait_for_timeout(250)
        check('Erase all works', st('__EM.S.txns.length') == 0 and st('__EM.S.accounts.length') == 3)
        pg.goto(URL + '#settings'); pg.set_input_files('input[data-in=restoreFile]', bpath); pg.wait_for_selector('.sheet'); pg.click('.sheet button[data-r="1"]'); pg.wait_for_timeout(300)
        check('Restore brings back all transactions', st('__EM.S.txns.length') == n_before)
        pg.reload(); pg.wait_for_selector('.add-big')
        check('Data persists after reload (IndexedDB)', st('__EM.S.txns.length') == n_before and S()['total'] == 13800)
        with pg.expect_download() as dl: pg.goto(URL + '#settings'); pg.click('button[data-act=exportAll]')
        csv = open(dl.value.path(), encoding='utf-8-sig').read()
        check('All-transactions CSV export', csv.startswith('Date,Type') and csv.count('\n') == n_before + 1)
        pg.screenshot(path=f'{SHOTS}/10_settings.png', full_page=True)

        # ---- sample data load/remove
        pg.click('button[data-act=loadSample]'); pg.wait_for_timeout(300)
        ns = st('__EM.S.txns.filter(t=>t.sample).length')
        bad = st("__EM.S.txns.filter(t=>t.sample).map(t=>__EM.C.validateTxn(t,__EM.S.accounts,__EM.S.categories)).filter(e=>e.length).length")
        check(f'Sample data loaded ({ns} txns) and all valid', ns > 100 and bad == 0, bad)
        pg.goto(URL + '#home'); pg.wait_for_timeout(100); pg.screenshot(path=f'{SHOTS}/11_home_sample.png', full_page=True)
        pg.goto(URL + '#reports/monthly'); pg.wait_for_timeout(100); pg.screenshot(path=f'{SHOTS}/12_monthly_sample.png', full_page=True)
        pg.goto(URL + '#reports/yearly'); pg.wait_for_timeout(100); pg.screenshot(path=f'{SHOTS}/13_yearly_sample.png', full_page=True)
        pg.goto(URL + '#reports/methods'); pg.wait_for_timeout(100); pg.screenshot(path=f'{SHOTS}/14_methods_sample.png', full_page=True)
        pg.goto(URL + '#accounts'); pg.wait_for_timeout(100); pg.screenshot(path=f'{SHOTS}/15_accounts_sample.png', full_page=True)
        pg.goto(URL + '#settings'); pg.click('button[data-act=removeSample]'); pg.click('.sheet button[data-r="1"]'); pg.wait_for_timeout(200)
        check('Remove sample data leaves only my data', st('__EM.S.txns.length') == n_before and S()['total'] == 13800 and not st("__EM.S.accounts.some(a=>a.sample)"))

        # ---- offline
        pg.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller !== null || (location.reload(), false)', timeout=8000) if False else None
        pg.evaluate('navigator.serviceWorker.ready'); pg.reload(); pg.wait_for_timeout(500)
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_selector('#tabbar a', timeout=5000); pg.wait_for_timeout(300)
        check('Works offline after first load (service worker)', st('__EM.S.txns.length') == n_before)
        add_expense('250', 'personal', 'Food', 'Cash', 'Cash Wallet')
        check('Can add expense while offline', st("__EM.S.txns.filter(t=>t.kind=='expense').length") == 5)
        ctx.set_offline(False)
        print('quick-add timing (4 full adds incl. navigation):', round(time.time() - t0, 1), 's')
        check('No JavaScript errors during run', not errors, errors)
        b.close()
finally:
    srv.terminate()
ok = sum(1 for _, c in results if c); print(f'\n{ok}/{len(results)} passed')
sys.exit(0 if ok == len(results) else 1)
