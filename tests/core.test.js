// Run: node tests/core.test.js
const C = require('../js/core.js');
let pass = 0, fail = 0;
function eq(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  got=${JSON.stringify(got)} expected=${JSON.stringify(exp)}`));
}

const accounts = [
  { id: 'sav', name: 'Saving Account', type: 'bank', opening: 50000 },
  { id: 'cur', name: 'Current Account', type: 'bank', opening: 100000 },
  { id: 'cash', name: 'Cash Wallet', type: 'cash', opening: 5000 },
  { id: 'hdfc', name: 'HDFC Card', type: 'card', opening: 0, limit: 100000 }
];
const categories = [
  { id: 'p_food', name: 'Food', purpose: 'personal' }, { id: 'p_shop', name: 'Shopping', purpose: 'personal' },
  { id: 'b_pet', name: 'Petrol', purpose: 'business' }, { id: 'b_pur', name: 'Purchasing', purpose: 'business' }
];
let n = 0;
const T = (o) => Object.assign({ id: 't' + (++n), createdAt: n, notes: '' }, o);

let txns = [
  // Personal shopping paid from CURRENT account -> still personal
  T({ kind: 'expense', date: '2026-11-06', amount: 2000, purpose: 'personal', categoryId: 'p_shop', method: 'UPI', accountId: 'cur' }),
  // Business petrol paid from SAVING account -> still business
  T({ kind: 'expense', date: '2026-11-06', amount: 1000, purpose: 'business', categoryId: 'b_pet', method: 'UPI', accountId: 'sav' }),
  T({ kind: 'expense', date: '2026-11-06', amount: 500, purpose: 'personal', categoryId: 'p_food', method: 'Cash', accountId: 'cash' }),
  // Credit card purchase 10,000 -> expense on purchase date
  T({ kind: 'expense', date: '2026-11-03', amount: 10000, purpose: 'personal', categoryId: 'p_shop', method: 'Credit Card', accountId: 'hdfc' }),
  T({ kind: 'expense', date: '2026-11-04', amount: 3000, purpose: 'business', categoryId: 'b_pur', method: 'Credit Card', accountId: 'hdfc' }),
  // Internal transfer 20,000 Saving -> Current: NOT an expense
  T({ kind: 'transfer', date: '2026-11-05', amount: 20000, accountId: 'sav', toAccountId: 'cur' }),
  // Card bill payment 10,000 from Saving: settlement, NOT an expense
  T({ kind: 'cardpay', date: '2026-11-06', amount: 10000, method: 'UPI', accountId: 'sav', toAccountId: 'hdfc' }),
  // Prior month
  T({ kind: 'expense', date: '2026-10-15', amount: 4000, purpose: 'personal', categoryId: 'p_food', method: 'UPI', accountId: 'sav' }),
];

const nov = C.monthRange(2026, 11);
let s = C.summarize(txns, nov);
eq('Nov total = only expenses (2000+1000+500+10000+3000)', s.total, 16500);
eq('Personal includes personal paid from Current a/c', s.personal, 12500);
eq('Business includes business paid from Saving a/c', s.business, 4000);
eq('Transfer not counted', s.list.some((t) => t.kind === 'transfer'), false);
eq('Card bill payment not counted', s.list.some((t) => t.kind === 'cardpay'), false);
eq('Credit card purchases in method breakdown', s.byMethod.find((m) => m.key === 'Credit Card').amount, 13000);
eq('Method % sums to 100', Math.round(s.byMethod.reduce((a, m) => a + m.pct, 0)), 100);
eq('Spent from Current account', s.byAccount.find((r) => r.key === 'cur').amount, 2000);
eq('Spent from Saving account', s.byAccount.find((r) => r.key === 'sav').amount, 1000);
eq('Highest day', s.highestDay, { key: '2026-11-03', amount: 10000 });

let b = C.balances(accounts, txns);
eq('Saving balance = 50000 -1000 -20000 -10000 -4000', b.sav, 15000);
eq('Current balance = 100000 -2000 +20000', b.cur, 118000);
eq('Cash balance', b.cash, 4500);
eq('Card balance (negative = owed)', b.hdfc, -3000);
let cs = C.cardSummary(accounts[3], txns);
eq('Card purchases', cs.purchases, 13000);
eq('Card payments', cs.payments, 10000);
eq('Card outstanding', cs.outstanding, 3000);
eq('Card available', cs.available, 97000);

// Total money conservation: transfer changes nothing overall
const totalBefore = 50000 + 100000 + 5000;
const netAll = Object.values(b).reduce((a, x) => a + x, 0);
eq('Net worth = opening - all expenses (transfers/settlements neutral)', netAll, totalBefore - 16500 - 4000);

// Edit: change personal shopping to business, amount 2500
txns = txns.map((t) => t.id === 't1' ? Object.assign({}, t, { purpose: 'business', categoryId: 'b_pur', amount: 2500 }) : t);
s = C.summarize(txns, nov);
eq('After edit: personal', s.personal, 10500);
eq('After edit: business', s.business, 6500);
eq('After edit: current balance', C.balances(accounts, txns).cur, 117500);
// Delete
txns = txns.filter((t) => t.id !== 't4');
s = C.summarize(txns, nov);
eq('After delete: total', s.total, 7000);
eq('After delete: card outstanding goes negative (overpaid)', C.cardSummary(accounts[3], txns).outstanding, -7000);

// Purpose filter
eq('Business-only filter', C.summarize(txns, nov, 'business').total, 6500);

// Validation
const v = (t) => C.validateTxn(t, accounts, categories);
eq('Valid expense', v({ kind: 'expense', date: '2026-11-06', amount: 10, purpose: 'personal', categoryId: 'p_food', method: 'UPI', accountId: 'cur' }), []);
eq('Credit card method needs card account', v({ kind: 'expense', date: '2026-11-06', amount: 10, purpose: 'personal', categoryId: 'p_food', method: 'Credit Card', accountId: 'sav' }).length, 1);
eq('Category must match purpose', v({ kind: 'expense', date: '2026-11-06', amount: 10, purpose: 'business', categoryId: 'p_food', method: 'UPI', accountId: 'sav' }).length, 1);
eq('Zero amount rejected', v({ kind: 'expense', date: '2026-11-06', amount: 0, purpose: 'personal', categoryId: 'p_food', method: 'UPI', accountId: 'sav' }).length, 1);
eq('Transfer to same account rejected', v({ kind: 'transfer', date: '2026-11-06', amount: 5, accountId: 'sav', toAccountId: 'sav' }).length, 1);
eq('Card pay must go to card', v({ kind: 'cardpay', date: '2026-11-06', amount: 5, accountId: 'sav', toAccountId: 'cur' }).length, 1);

// Ranges
const now = new Date(2026, 10, 6); // Fri 6 Nov 2026
eq('Week range Mon-Sun', C.rangeFor('week', now), { from: '2026-11-02', to: '2026-11-08' });
eq('Yesterday', C.rangeFor('yesterday', now), { from: '2026-11-05', to: '2026-11-05' });
eq('Daily avg for current month uses days elapsed', C.dailyAverage(600, nov, now), 100);

// Formatting
eq('Indian format', C.inr(100000), '₹1,00,000');
eq('Indian format lakh/crore', C.inr(12345678.5), '₹1,23,45,678.5');
eq('Float safety', C.sum([0.1, 0.2]), 0.3);

// Compare months
const oct = C.summarize(txns, C.monthRange(2026, 10));
const cmp = C.compare(oct.byCategory, C.summarize(txns, nov).byCategory);
eq('Compare finds p_food change', cmp.find((r) => r.key === 'p_food').diff, 500 - 4000);

// Backup round trip
const bk = C.makeBackup({ accounts, categories, txns });
eq('Backup valid', C.checkBackup(JSON.parse(JSON.stringify(bk))), []);
eq('Foreign JSON rejected', C.checkBackup({ foo: 1 }).length > 0, true);

// CSV
eq('CSV escaping', C.toCsv([['a,b', 'he said "hi"']]), '﻿"a,b","he said ""hi"""\r\n');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
