/* =====================================================================
   My Expense Manager — core ledger & reporting logic (no UI, no storage)
   ---------------------------------------------------------------------
   ONE ledger of transactions. Every balance and every report is
   DERIVED from it on the fly, so edits/deletes can never leave a
   stale balance or a ghost entry in a report.

   Transaction kinds
     expense  : money spent. ONLY kind that counts in expense reports.
                purpose (personal|business) and accountId (paid from)
                are independent of each other.
     income   : money added to an account (salary, deposit, refund).
     transfer : own account -> own account (incl. ATM withdrawal to cash).
                Never an expense, never income.
     cardpay  : credit card bill payment (bank/cash -> card).
                A SETTLEMENT — reduces card outstanding, NOT an expense.
     out      : money taken out that is not an expense (loan given,
                investment...). Reduces balance, not in expense reports.

   Account balance sign convention
     bank / cash : balance = money you have
     card        : balance is negative when you owe; outstanding = -balance
   ===================================================================== */
(function (root) {
  'use strict';

  const METHODS = ['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card'];
  const METHOD_ACCOUNT_TYPE = {
    'UPI': 'bank', 'Bank Transfer': 'bank', 'Cheque': 'bank',
    'Cash': 'cash', 'Credit Card': 'card'
  };
  const PURPOSES = ['personal', 'business'];
  const KINDS = ['expense', 'income', 'transfer', 'cardpay', 'out'];

  const DEFAULT_CATEGORIES = {
    personal: ['Food', 'Hotel', 'EMI', 'Petrol', 'Credit Card Bill', 'Shopping', 'Others'],
    business: ['Petrol', 'Purchasing', 'Credit Card Bill', 'Office Expenses', 'Transport',
      'Maintenance', 'Salary', 'Utilities', 'Others']
  };
  const DEFAULT_ACCOUNTS = [
    { id: 'acc_saving', name: 'Saving Account', type: 'bank', opening: 0 },
    { id: 'acc_current', name: 'Current Account', type: 'bank', opening: 0 },
    { id: 'acc_cash', name: 'Cash Wallet', type: 'cash', opening: 0 }
  ];

  /* ---------- money helpers (work in paise to avoid float drift) ---------- */
  const toPaise = (n) => Math.round(Number(n || 0) * 100);
  const fromPaise = (p) => p / 100;
  function sum(arr, f) { let p = 0; for (const x of arr) p += toPaise(f ? f(x) : x); return fromPaise(p); }

  const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const inrFmt2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  function inr(n, opts) {
    n = Number(n || 0);
    const neg = n < 0; const a = Math.abs(n);
    const s = (opts && opts.decimals) ? inrFmt2.format(a) : inrFmt.format(a);
    return (neg ? '-' : '') + '₹' + s;
  }
  function pct(part, total) { return total ? (part / total) * 100 : 0; }

  /* ---------- dates (stored as local 'YYYY-MM-DD') ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function todayStr(now) { return ymd(now || new Date()); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m = 1..12
  function monthKey(s) { return s.slice(0, 7); }
  function yearKey(s) { return s.slice(0, 4); }

  function rangeFor(preset, now, custom) {
    const t = todayStr(now); const d = parseYmd(t);
    switch (preset) {
      case 'today': return { from: t, to: t };
      case 'yesterday': { const y = addDays(t, -1); return { from: y, to: y }; }
      case 'week': { const dow = (d.getDay() + 6) % 7; return { from: addDays(t, -dow), to: addDays(t, 6 - dow) }; } // Mon–Sun
      case 'month': return monthRange(d.getFullYear(), d.getMonth() + 1);
      case 'year': return { from: d.getFullYear() + '-01-01', to: d.getFullYear() + '-12-31' };
      case 'all': return { from: '0000-01-01', to: '9999-12-31' };
      case 'custom': return { from: (custom && custom.from) || t, to: (custom && custom.to) || t };
      default: return { from: t, to: t };
    }
  }
  function monthRange(y, m) { return { from: y + '-' + pad(m) + '-01', to: y + '-' + pad(m) + '-' + pad(daysInMonth(y, m)) }; }

  /* ---------- validation ---------- */
  function validateTxn(t, accounts, categories) {
    const errs = [];
    const acc = (id) => accounts.find((a) => a.id === id);
    if (!KINDS.includes(t.kind)) errs.push('Unknown transaction type');
    if (!(toPaise(t.amount) > 0)) errs.push('Enter an amount greater than 0');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) errs.push('Pick a valid date');
    const from = acc(t.accountId);
    if (!from) errs.push('Choose an account');
    if (t.kind === 'expense') {
      if (!PURPOSES.includes(t.purpose)) errs.push('Choose Personal or Business');
      const cat = categories.find((c) => c.id === t.categoryId);
      if (!cat) errs.push('Choose a category');
      else if (cat.purpose !== t.purpose) errs.push('Category does not belong to ' + t.purpose);
      if (!METHODS.includes(t.method)) errs.push('Choose a payment method');
      else if (from && METHOD_ACCOUNT_TYPE[t.method] !== from.type)
        errs.push(t.method + ' must be paid from a ' + { bank: 'bank account', cash: 'cash wallet', card: 'credit card' }[METHOD_ACCOUNT_TYPE[t.method]]);
    }
    if (t.kind === 'transfer' || t.kind === 'cardpay') {
      const to = acc(t.toAccountId);
      if (!to) errs.push('Choose where the money goes');
      else if (from && to.id === from.id) errs.push('From and To must be different accounts');
      if (t.kind === 'cardpay') {
        if (to && to.type !== 'card') errs.push('Bill payment must go to a credit card');
        if (from && from.type === 'card') errs.push('Pay the card bill from a bank account or cash');
      }
      if (t.kind === 'transfer' && ((from && from.type === 'card') || (to && to.type === 'card')))
        errs.push('Use "Card Bill" to pay a credit card');
    }
    return errs;
  }

  /* ---------- balances ---------- */
  // Signed effect of one transaction on each account (in paise).
  function effects(t) {
    const a = toPaise(t.amount); const e = {};
    const add = (id, v) => { if (id) e[id] = (e[id] || 0) + v; };
    switch (t.kind) {
      case 'expense': case 'out': add(t.accountId, -a); break;
      case 'income': add(t.accountId, a); break;
      case 'transfer': case 'cardpay': add(t.accountId, -a); add(t.toAccountId, a); break;
    }
    return e;
  }
  // opening: for bank/cash = money you had; for card = outstanding you owed (positive number)
  function openingSigned(acc) { return acc.type === 'card' ? -toPaise(acc.opening) : toPaise(acc.opening); }

  function balances(accounts, txns, uptoDate) {
    const b = {};
    for (const acc of accounts) b[acc.id] = openingSigned(acc);
    for (const t of txns) {
      if (uptoDate && t.date > uptoDate) continue;
      const e = effects(t);
      for (const id in e) if (id in b) b[id] += e[id];
    }
    const out = {};
    for (const id in b) out[id] = fromPaise(b[id]);
    return out;
  }

  function cardSummary(card, txns) {
    const purchases = sum(txns.filter((t) => t.kind === 'expense' && t.accountId === card.id), (t) => t.amount);
    const payments = sum(txns.filter((t) => t.kind === 'cardpay' && t.toAccountId === card.id), (t) => t.amount);
    const refunds = sum(txns.filter((t) => t.kind === 'income' && t.accountId === card.id), (t) => t.amount);
    const outstanding = fromPaise(toPaise(card.opening) + toPaise(purchases) - toPaise(payments) - toPaise(refunds));
    const limit = Number(card.limit || 0);
    return {
      opening: Number(card.opening || 0), purchases, payments, refunds, outstanding,
      limit, available: limit ? fromPaise(toPaise(limit) - toPaise(outstanding)) : null,
      used: limit ? pct(outstanding, limit) : null
    };
  }

  // Ledger with running balance for one account (oldest -> newest)
  function accountLedger(acc, txns) {
    const rows = txns.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id)
      .slice().sort(cmpTxnAsc);
    let bal = openingSigned(acc); const out = [];
    for (const t of rows) {
      const delta = effects(t)[acc.id] || 0; bal += delta;
      out.push({ txn: t, delta: fromPaise(delta), balance: fromPaise(bal) });
    }
    return out;
  }

  function cmpTxnAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0); }
  function cmpTxnDesc(a, b) { return -cmpTxnAsc(a, b); }

  /* ---------- reports (expenses ONLY) ---------- */
  function expensesIn(txns, range, purpose) {
    return txns.filter((t) => t.kind === 'expense' && t.date >= range.from && t.date <= range.to &&
      (!purpose || purpose === 'both' || t.purpose === purpose));
  }
  function groupSum(list, keyFn) {
    const m = new Map();
    for (const t of list) { const k = keyFn(t); m.set(k, (m.get(k) || 0) + toPaise(t.amount)); }
    return m;
  }
  function toSortedRows(m, total) {
    return [...m.entries()].map(([key, p]) => ({ key, amount: fromPaise(p), pct: pct(fromPaise(p), total) }))
      .sort((a, b) => b.amount - a.amount);
  }

  /** Full summary of expenses inside a range. All screens use this one function. */
  function summarize(txns, range, purpose) {
    const list = expensesIn(txns, range, purpose);
    const total = sum(list, (t) => t.amount);
    const personal = sum(list.filter((t) => t.purpose === 'personal'), (t) => t.amount);
    const business = sum(list.filter((t) => t.purpose === 'business'), (t) => t.amount);
    const methodMap = groupSum(list, (t) => t.method);
    for (const m of METHODS) if (!methodMap.has(m)) methodMap.set(m, 0);
    const byMethod = METHODS.map((m) => ({ key: m, amount: fromPaise(methodMap.get(m)), pct: pct(fromPaise(methodMap.get(m)), total) }));
    const byCategory = toSortedRows(groupSum(list, (t) => t.categoryId), total);
    const byCategoryPurpose = toSortedRows(groupSum(list, (t) => t.purpose + '|' + t.categoryId), total);
    const byAccount = toSortedRows(groupSum(list, (t) => t.accountId), total);
    const dayMap = groupSum(list, (t) => t.date);
    const byDay = [...dayMap.entries()].map(([key, p]) => ({ key, amount: fromPaise(p) })).sort((a, b) => a.key < b.key ? -1 : 1);
    const monthMap = groupSum(list, (t) => monthKey(t.date));
    const byMonth = [...monthMap.entries()].map(([key, p]) => ({ key, amount: fromPaise(p) })).sort((a, b) => a.key < b.key ? -1 : 1);
    let highestDay = null;
    for (const d of byDay) if (!highestDay || d.amount > highestDay.amount) highestDay = d;
    return { list, count: list.length, total, personal, business, byMethod, byCategory, byCategoryPurpose, byAccount, byDay, byMonth, highestDay };
  }

  /** Average per day. For the current (unfinished) period, divides by days elapsed. */
  function dailyAverage(total, range, now) {
    const t = todayStr(now);
    const end = range.to < t ? range.to : t;
    if (end < range.from) return 0;
    const days = Math.round((parseYmd(end) - parseYmd(range.from)) / 86400000) + 1;
    return days > 0 ? total / days : 0;
  }

  /** Compare two summaries row by row (category / method / purpose). */
  function compare(a, b, keys) {
    // a = earlier (e.g. October), b = later (e.g. November)
    const mapA = new Map(a.map((r) => [r.key, r.amount]));
    const mapB = new Map(b.map((r) => [r.key, r.amount]));
    const all = keys || [...new Set([...mapA.keys(), ...mapB.keys()])];
    return all.map((k) => {
      const x = mapA.get(k) || 0; const y = mapB.get(k) || 0;
      return { key: k, a: x, b: y, diff: fromPaise(toPaise(y) - toPaise(x)), pctChange: x ? ((y - x) / x) * 100 : (y ? null : 0) };
    }).sort((p, q) => Math.abs(q.diff) - Math.abs(p.diff));
  }

  /* ---------- search ---------- */
  function search(txns, f, lookup) {
    const q = (f.text || '').trim().toLowerCase();
    return txns.filter((t) => {
      if (f.kind && f.kind !== 'any' && t.kind !== f.kind) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.purpose && f.purpose !== 'both' && t.purpose !== f.purpose) return false;
      if (f.categoryId && t.categoryId !== f.categoryId) return false;
      if (f.method && t.method !== f.method) return false;
      if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
      if (f.min != null && f.min !== '' && Number(t.amount) < Number(f.min)) return false;
      if (f.max != null && f.max !== '' && Number(t.amount) > Number(f.max)) return false;
      if (q) {
        const hay = [t.notes, String(t.amount), lookup ? lookup(t) : ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort(cmpTxnDesc);
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

  const KIND_LABEL = { expense: 'Expense', income: 'Money Added', transfer: 'Transfer', cardpay: 'Card Bill Payment', out: 'Money Out (not expense)' };

  /* ---------- backup format ---------- */
  const BACKUP_APP = 'my-expense-manager';
  const BACKUP_VERSION = 1;
  function makeBackup(state) {
    return {
      app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
      accounts: state.accounts, categories: state.categories, txns: state.txns, meta: state.meta || {}
    };
  }
  function checkBackup(obj) {
    const errs = [];
    if (!obj || typeof obj !== 'object') return ['File is not a valid backup'];
    if (obj.app !== BACKUP_APP) errs.push('This file is not a My Expense Manager backup');
    for (const k of ['accounts', 'categories', 'txns']) if (!Array.isArray(obj[k])) errs.push('Backup is missing ' + k);
    if (errs.length) return errs;
    const accIds = new Set(obj.accounts.map((a) => a.id));
    const catIds = new Set(obj.categories.map((c) => c.id));
    let bad = 0;
    for (const t of obj.txns) {
      if (!t.id || !KINDS.includes(t.kind) || !accIds.has(t.accountId)) bad++;
      else if (t.kind === 'expense' && !catIds.has(t.categoryId)) bad++;
    }
    if (bad) errs.push(bad + ' transaction(s) in the backup are damaged');
    return errs;
  }

  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  const Core = {
    METHODS, METHOD_ACCOUNT_TYPE, PURPOSES, KINDS, KIND_LABEL, DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS,
    toPaise, fromPaise, sum, inr, pct,
    ymd, parseYmd, addDays, todayStr, daysInMonth, monthKey, yearKey, rangeFor, monthRange,
    validateTxn, effects, balances, cardSummary, accountLedger, cmpTxnAsc, cmpTxnDesc,
    expensesIn, summarize, dailyAverage, compare, search, toCsv, makeBackup, checkBackup, uid,
    BACKUP_APP, BACKUP_VERSION
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof self !== 'undefined' ? self : this);
