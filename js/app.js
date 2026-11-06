/* My Expense Manager — UI layer. All maths lives in core.js; all storage in db.js. */
(function () {
  'use strict';
  const C = window.Core;
  const $ = (s, r) => (r || document).querySelector(s);
  const view = $('#view');

  /* ======================= STATE ======================= */
  const S = { accounts: [], categories: [], txns: [], meta: {} };
  const R = { // per-screen UI state (not persisted except where noted)
    dash: 'month', dashCustom: null,
    day: null, month: null, cmpMonth: null, mPurpose: 'both', year: null, yPurpose: 'both',
    mPreset: 'month', mPurposeM: 'both', mCustom: null,
    q: { kind: 'expense', text: '', from: '', to: '', purpose: 'both', categoryId: '', method: '', accountId: '', min: '', max: '' }
  };
  let F = null; // add/edit form state
  let navCount = 0;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = C.inr;
  const today = () => C.todayStr();
  const acc = (id) => S.accounts.find((a) => a.id === id);
  const cat = (id) => S.categories.find((c) => c.id === id);
  const accName = (id) => (acc(id) || { name: '(deleted account)' }).name;
  const catName = (id) => (cat(id) || { name: '(deleted category)' }).name;
  const accountsOf = (type) => S.accounts.filter((a) => a.type === type);
  const catsOf = (p) => S.categories.filter((c) => c.purpose === p).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.name === 'Others') - (b.name === 'Others'));
  const P_LABEL = { personal: 'Personal', business: 'Business', both: 'Both' };
  const METHOD_COLOR = { 'UPI': 'var(--m-upi)', 'Cash': 'var(--m-cash)', 'Bank Transfer': 'var(--m-bank)', 'Cheque': 'var(--m-cheque)', 'Credit Card': 'var(--m-card)' };
  const METHOD_HEX = { 'UPI': '#2a78d6', 'Cash': '#eb6834', 'Bank Transfer': '#1baf7a', 'Cheque': '#eda100', 'Credit Card': '#e87ba4' };
  const fmtDate = (s, o) => C.parseYmd(s).toLocaleDateString('en-IN', o || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
  const fmtMonthShort = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' }); };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const ICON = {
    back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    search: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    help: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>'
  };

  /* ======================= INIT ======================= */
  async function init() {
    try {
      Object.assign(S, await DB.loadAll());
      await ensureDefaults();
    } catch (e) {
      view.innerHTML = '<div class="pad"><div class="err">Could not open the on-device database: ' + esc(e.message) + '</div></div>';
      return;
    }
    R.day = today(); R.month = today().slice(0, 7); R.cmpMonth = shiftMonth(R.month, -1); R.year = today().slice(0, 4);
    if (S.meta.dash) R.dash = S.meta.dash;
    window.addEventListener('hashchange', () => { navCount++; render(true); });
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    render(true);
    // Ask the browser to keep our data permanently (granted automatically for installed apps).
    if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  async function ensureDefaults() {
    const ops = [];
    if (!S.accounts.length) {
      S.accounts = C.DEFAULT_ACCOUNTS.map((a, i) => Object.assign({}, a, { order: i, createdAt: Date.now() }));
      S.accounts.forEach((a) => ops.push({ store: 'accounts', put: a }));
    }
    if (!S.categories.length) {
      let i = 0;
      for (const p of C.PURPOSES) for (const name of C.DEFAULT_CATEGORIES[p]) {
        const c = { id: (p === 'personal' ? 'p_' : 'b_') + name.toLowerCase().replace(/[^a-z]+/g, '_'), name, purpose: p, order: i++, system: name === 'Others' };
        S.categories.push(c); ops.push({ store: 'categories', put: c });
      }
    }
    if (ops.length) await DB.batch(ops);
  }

  async function setMeta(k, v) { S.meta[k] = v; await DB.setMeta(k, v); }

  /* ======================= DATA OPERATIONS ======================= */
  async function saveTxn(t) {
    const errs = C.validateTxn(t, S.accounts, S.categories);
    if (errs.length) return errs;
    t.amount = C.fromPaise(C.toPaise(t.amount));
    t.updatedAt = Date.now(); if (!t.createdAt) t.createdAt = Date.now();
    await DB.put('txns', t);
    const i = S.txns.findIndex((x) => x.id === t.id);
    if (i >= 0) S.txns[i] = t; else S.txns.push(t);
    return [];
  }
  async function deleteTxn(id) { await DB.del('txns', id); S.txns = S.txns.filter((t) => t.id !== id); }

  /* ======================= ROUTER ======================= */
  function route() {
    const h = location.hash.replace(/^#/, '') || 'home';
    const [name, ...rest] = h.split('/');
    return { name, arg: rest.join('/') };
  }
  function go(hash) { if (location.hash === '#' + hash) render(true); else location.hash = hash; }
  function back(fallback) { if (navCount > 0) history.back(); else go(fallback || 'home'); }

  let lastRouteKey = '';
  function render(routeChanged) {
    const r = route();
    const key = r.name + '/' + r.arg;
    const isNew = key !== lastRouteKey; lastRouteKey = key;
    const tab = { home: 'home', add: 'add', edit: 'add', reports: 'reports', accounts: 'accounts', account: 'accounts', 'account-edit': 'accounts', settings: 'settings', categories: 'settings', help: 'settings' }[r.name] || 'home';
    document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    if (routeChanged && isNew && (r.name === 'add' || r.name === 'edit')) { if (F && F.preset) delete F.preset; else F = null; } // fresh form on navigation
    let html;
    try {
      switch (r.name) {
        case 'home': html = viewHome(); break;
        case 'add': html = viewForm(r.arg || 'expense'); break;
        case 'edit': html = viewForm(null, r.arg); break;
        case 'reports': html = viewReports(r.arg || 'daily'); break;
        case 'accounts': html = viewAccounts(); break;
        case 'account': html = viewAccount(r.arg); break;
        case 'account-edit': html = viewAccountEdit(r.arg); break;
        case 'settings': html = viewSettings(); break;
        case 'categories': html = viewCategories(); break;
        case 'help': html = viewHelp(); break;
        default: html = viewHome();
      }
    } catch (e) { console.error(e); html = '<div class="pad"><div class="err">Something went wrong: ' + esc(e.message) + '</div></div>'; }
    view.innerHTML = html;
    if (routeChanged && isNew) window.scrollTo(0, 0);
    if ((r.name === 'add' || r.name === 'edit') && routeChanged && isNew && !F.editing) {
      const a = $('#f-amount'); if (a) setTimeout(() => a.focus(), 60);
    }
  }
  const rerender = () => { const y = window.scrollY; render(false); window.scrollTo(0, y); };

  /* ======================= SMALL UI PIECES ======================= */
  function topbar(title, opts) {
    opts = opts || {};
    return '<header class="top">' + (opts.back ? '<button class="icon-btn" data-act="back" aria-label="Back">' + ICON.back + '</button>' : '') +
      '<h1>' + title + (opts.sub ? '<span class="sub">' + opts.sub + '</span>' : '') + '</h1>' + (opts.right || '') + '</header>';
  }
  function tile(label, value, o) {
    o = o || {};
    return '<div class="tile' + (o.hero ? ' hero' : '') + '"' + (o.act ? ' data-act="' + o.act + '"' : '') + '><div class="lbl">' + (o.dot ? '<span class="dot ' + o.dot + '"></span>' : '') + label + '</div><div class="val' + (o.big ? ' big' : '') + '">' + value + '</div>' + (o.note ? '<div class="note">' + o.note + '</div>' : '') + '</div>';
  }
  function chips(name, options, current, extraAttr) {
    return '<div class="chips">' + options.map(([v, l]) => '<button class="chip' + (v === current ? ' on' : '') + '" data-act="' + name + '" data-v="' + esc(v) + '"' + (extraAttr || '') + '>' + l + '</button>').join('') + '</div>';
  }
  function seg(name, options, current) {
    return '<div class="seg">' + options.map(([v, l]) => '<button class="' + (v === current ? 'on' : '') + '" data-act="' + name + '" data-v="' + esc(v) + '">' + l + '</button>').join('') + '</div>';
  }
  function barList(rows, o) {
    o = o || {};
    const max = Math.max(0, ...rows.map((r) => r.amount));
    if (!rows.length || !max) return '<div class="empty small">No expenses in this period</div>';
    return '<div class="bars">' + rows.map((r) => '<div class="bar-row"' + (r.act ? ' data-act="' + r.act + '" data-v="' + esc(r.v || '') + '" style="cursor:pointer"' : '') + '><div class="bl"><span class="name">' +
      (r.color ? '<span class="dot" style="background:' + r.color + '"></span>' : '') + '<span class="n">' + esc(r.label) + '</span>' + (r.tag ? ' <span class="tag ' + r.tag + '">' + P_LABEL[r.tag] + '</span>' : '') +
      '</span><span class="v">' + inr(r.amount) + (o.pct !== false && r.pct != null ? '<small>' + r.pct.toFixed(r.pct < 10 && r.pct > 0 ? 1 : 0) + '%</small>' : '') + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + (r.amount / max * 100).toFixed(2) + '%;' + (r.color ? 'background:' + r.color : '') + '"></div></div></div>').join('') + '</div>';
  }
  function splitBar(personal, business) {
    const t = personal + business;
    const pp = t ? personal / t * 100 : 0, bp = t ? business / t * 100 : 0;
    const segs = [];
    if (personal > 0) segs.push('<div style="width:' + pp + '%;background:var(--personal)" title="Personal ' + inr(personal) + '"></div>');
    if (business > 0) segs.push('<div style="width:' + bp + '%;background:var(--business)" title="Business ' + inr(business) + '"></div>');
    if (!segs.length) segs.push('<div style="width:100%;background:var(--line-2)"></div>');
    return '<div class="split">' + segs.join('') + '</div><div class="legend"><span><i class="dot personal"></i>Personal ' + inr(personal) + ' · ' + pp.toFixed(0) + '%</span><span><i class="dot business"></i>Business ' + inr(business) + ' · ' + bp.toFixed(0) + '%</span></div>';
  }
  /** Vertical column chart (SVG). data: [{label, value, tip, key}] */
  let chartSeq = 0;
  function columns(data, o) {
    o = o || {};
    const W = 340, H = o.h || 150, padL = 4, padB = 18, padT = 8;
    const max = Math.max(0, ...data.map((d) => d.value));
    if (!max) return '<div class="empty small">No expenses in this period</div>';
    const n = data.length, slot = (W - padL) / n, bw = Math.max(2, Math.min(28, slot - 2));
    const scale = (H - padB - padT) / max;
    const every = o.labelEvery || Math.ceil(n / 8);
    const id = 'ch' + (++chartSeq);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'Chart') + '">';
    for (const f of [0.5, 1]) { const y = H - padB - max * f * scale; svg += '<line class="grid" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; svg += '<text class="axis" x="' + W + '" y="' + (y - 3) + '" text-anchor="end">' + inr(Math.round(max * f)) + '</text>'; }
    svg += '<line class="grid" x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '"/>';
    data.forEach((d, i) => {
      const x = padL + i * slot + (slot - bw) / 2; const h = d.value * scale; const y = H - padB - h;
      const r = Math.min(4, bw / 2, h);
      if (d.value > 0) svg += '<path class="colp" d="M' + x + ',' + (H - padB) + 'V' + (y + r) + 'q0,-' + r + ' ' + r + ',-' + r + 'H' + (x + bw - r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + (H - padB) + 'z" fill="' + (o.color || 'var(--green-600)') + '"/>';
      svg += '<rect class="hit" x="' + (padL + i * slot) + '" y="0" width="' + slot + '" height="' + H + '" data-act="tip" data-chart="' + id + '" data-tip="' + esc(d.tip || (d.label + ': ' + inr(d.value))) + '"' + (d.key && o.tapAct ? ' data-go="' + esc(o.tapAct + d.key) + '"' : '') + '><title>' + esc(d.tip || (d.label + ': ' + inr(d.value))) + '</title></rect>';
      if (i % every === 0 || i === n - 1) svg += '<text class="axis" x="' + (x + bw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(d.label) + '</text>';
    });
    svg += '</svg>';
    return '<div class="chart">' + svg + '<div class="chart-tip" id="' + id + '">' + esc(o.hint || 'Tap a bar to see the amount') + '</div></div>';
  }
  /** Donut chart with 2px gaps; rows: [{key,label,amount,color}] */
  function donut(rows, centerTop, centerVal) {
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const R0 = 60, r0 = 40, cx = 75, cy = 75;
    let svg = '<svg viewBox="0 0 150 150" role="img" aria-label="Pie chart">';
    if (!total) svg += '<circle cx="75" cy="75" r="50" fill="none" stroke="var(--line-2)" stroke-width="20"/>';
    else {
      let a0 = -Math.PI / 2; const live = rows.filter((r) => r.amount > 0);
      for (const r of live) {
        const frac = r.amount / total; let a1 = a0 + frac * Math.PI * 2;
        if (live.length === 1) { svg += '<circle cx="75" cy="75" r="50" fill="none" stroke="' + r.color + '" stroke-width="20"><title>' + esc(r.label) + '</title></circle>'; break; }
        const gap = Math.min(0.02, frac * Math.PI); const s = a0 + gap / 2, e = a1 - gap / 2;
        const large = (e - s) > Math.PI ? 1 : 0;
        const p = (rad, ang) => (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2);
        svg += '<path d="M' + p(R0, s) + 'A' + R0 + ',' + R0 + ' 0 ' + large + ' 1 ' + p(R0, e) + 'L' + p(r0, e) + 'A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + p(r0, s) + 'Z" fill="' + r.color + '"><title>' + esc(r.label + ': ' + inr(r.amount) + ' (' + (frac * 100).toFixed(1) + '%)') + '</title></path>';
        a0 = a1;
      }
    }
    svg += '<text x="75" y="70" text-anchor="middle" class="donut-c1">' + esc(centerTop) + '</text><text x="75" y="90" text-anchor="middle" class="donut-c2">' + esc(centerVal) + '</text></svg>';
    return svg;
  }
  function txnItem(t, o) {
    o = o || {};
    let ic, cls, t1, t2, amt, amtCls = '';
    const parts = [];
    if (o.showDate) parts.push(fmtDate(t.date, { day: 'numeric', month: 'short' }));
    if (t.kind === 'expense') {
      cls = t.purpose; ic = esc(catName(t.categoryId).charAt(0).toUpperCase());
      t1 = esc(catName(t.categoryId)) + ' <span class="tag ' + t.purpose + '">' + P_LABEL[t.purpose] + '</span>';
      parts.push(t.method, accName(t.accountId)); amt = inr(t.amount);
    } else if (t.kind === 'transfer') {
      cls = 'neutral'; ic = '⇄'; t1 = 'Transfer'; parts.push(accName(t.accountId) + ' → ' + accName(t.toAccountId)); amt = inr(t.amount); amtCls = 'neutral';
    } else if (t.kind === 'cardpay') {
      cls = 'neutral'; ic = '✓'; t1 = 'Card bill paid'; parts.push(accName(t.accountId) + ' → ' + accName(t.toAccountId)); amt = inr(t.amount); amtCls = 'neutral';
    } else if (t.kind === 'income') {
      cls = 'neutral'; ic = '+'; t1 = 'Money added'; parts.push('to ' + accName(t.accountId)); amt = '+' + inr(t.amount); amtCls = 'in';
    } else {
      cls = 'neutral'; ic = '↗'; t1 = 'Money out <span class="tag">not expense</span>'; parts.push('from ' + accName(t.accountId)); amt = inr(t.amount); amtCls = 'neutral';
    }
    if (o.delta != null) { amt = (o.delta > 0 ? '+' : '') + inr(o.delta); amtCls = o.delta > 0 ? 'in' : ''; }
    if (t.notes) parts.push(t.notes);
    t2 = esc(parts.join(' · '));
    if (t.sample) t1 += ' <span class="tag sample">sample</span>';
    return '<a class="item" href="#edit/' + esc(t.id) + '"><div class="ic ' + cls + '">' + ic + '</div><div class="grow"><div class="t1">' + t1 + '</div><div class="t2">' + t2 + '</div></div><div><div class="amt ' + amtCls + '">' + amt + '</div>' +
      (o.balance != null ? '<div class="tiny muted" style="text-align:right">bal ' + inr(o.balance) + '</div>' : '') + '</div></a>';
  }
  function txnListByDay(list) {
    if (!list.length) return '<div class="list"><div class="empty">No transactions</div></div>';
    let html = '<div class="list">', cur = null;
    for (const t of list) {
      if (t.date !== cur) {
        cur = t.date;
        const dayExp = C.sum(list.filter((x) => x.date === cur && x.kind === 'expense'), (x) => x.amount);
        html += '<div class="day-head"><span>' + fmtDate(cur) + '</span><span>' + (dayExp ? 'Spent ' + inr(dayExp) : '') + '</span></div>';
      }
      html += txnItem(t);
    }
    return html + '</div>';
  }

  /* ======================= HOME / DASHBOARD ======================= */
  const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['custom', 'Custom']];
  function dashRange() { return C.rangeFor(R.dash, null, R.dashCustom || { from: C.rangeFor('month').from, to: today() }); }

  function viewHome() {
    const t = today();
    const todaySum = C.summarize(S.txns, { from: t, to: t });
    const monthSum = C.summarize(S.txns, C.rangeFor('month'));
    const range = dashRange();
    const s = C.summarize(S.txns, range);
    const bal = C.balances(S.accounts, S.txns);
    const cards = accountsOf('card');
    const cardOut = C.sum(cards, (c) => C.cardSummary(c, S.txns).outstanding);
    const presetLabel = (PRESETS.find((p) => p[0] === R.dash) || [])[1];
    const rangeText = range.from === range.to ? fmtDate(range.from) : fmtDate(range.from, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' });

    let h = topbar('My Expenses', { sub: fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), right: '<a class="icon-btn" href="#reports/search" aria-label="Search">' + ICON.search + '</a>' });

    // banners
    const realTx = S.txns.filter((x) => !x.sample).length;
    if (!S.txns.length && !S.meta.welcomeDone) {
      h += '<div class="banner welcome" style="display:block"><b>Welcome! 👋</b><div class="small muted" style="margin:4px 0 10px">Start by entering your current account balances. You can also load sample data to explore — it can be removed with one tap later.</div>' +
        '<div class="btn-row"><a class="btn primary sm" href="#accounts">Set balances</a><button class="btn ghost sm" data-act="loadSample">Load sample data</button></div></div>';
    }
    if (S.txns.some((x) => x.sample)) h += '<div class="banner warn"><div class="grow small">You are viewing <b>sample data</b>. Remove it before real use.</div><button class="btn danger" data-act="removeSample">Remove</button></div>';
    else if (realTx >= 5) {
      const lb = S.meta.lastBackupAt; const days = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
      if (days == null || days >= 7) h += '<div class="banner warn"><div class="grow small">' + (days == null ? 'You have never backed up your data.' : 'Last backup was ' + days + ' days ago.') + '</div><button class="btn primary" data-act="backup">Back up</button></div>';
    }

    h += '<div class="section"><div class="grid2" style="margin-top:12px">' +
      tile('Today', inr(todaySum.total), { hero: true, big: true, note: todaySum.count + ' expense' + (todaySum.count === 1 ? '' : 's'), act: 'goToday' }) +
      tile('This Month', inr(monthSum.total), { big: true, note: fmtMonth(t.slice(0, 7)), act: 'goMonth' }) + '</div></div>';

    h += '<div class="section" style="margin-top:12px"><a class="add-big" href="#add">' + ICON.plus + 'Add Expense</a></div>';

    // period card
    h += '<div class="section"><div class="section-title">Spending — ' + esc(presetLabel) + '</div>' + chips('dash', PRESETS, R.dash);
    if (R.dash === 'custom') h += '<div class="grid2" style="margin:4px 0 8px"><input class="input" type="date" data-in="dashFrom" value="' + range.from + '"><input class="input" type="date" data-in="dashTo" value="' + range.to + '"></div>';
    h += '<div class="card"><div class="row"><div class="grow"><div class="small muted">' + esc(rangeText) + '</div><div style="font-size:1.8rem;font-weight:800;letter-spacing:-.02em" class="num">' + inr(s.total) + '</div></div><div class="small muted">' + s.count + ' expenses</div></div>' +
      '<div class="grid2" style="margin-top:10px">' + tile('Personal', inr(s.personal), { dot: 'personal' }) + tile('Business', inr(s.business), { dot: 'business' }) + '</div>' +
      splitBar(s.personal, s.business) + '</div></div>';

    // balances
    h += '<div class="section"><div class="section-title">Balances <a href="#accounts">Manage</a></div><div class="acc-grid">';
    for (const a of S.accounts.filter((x) => x.type !== 'card')) h += '<a class="acc" href="#account/' + a.id + '"><div class="an">' + esc(a.name) + '</div><div class="ab' + (bal[a.id] < 0 ? ' neg' : '') + '">' + inr(bal[a.id]) + '</div></a>';
    h += '<a class="acc card-acc" href="#accounts"><div class="an">Credit Card Outstanding</div><div class="ab">' + inr(cardOut) + '</div><div class="tiny muted">' + cards.length + ' card' + (cards.length === 1 ? '' : 's') + '</div></a>';
    h += '</div></div>';

    // payment methods
    h += '<div class="section"><div class="section-title">Payment Methods <a href="#reports/methods">Details</a></div><div class="card">' +
      barList(s.byMethod.map((m) => ({ label: m.key, amount: m.amount, pct: m.pct, color: METHOD_COLOR[m.key] })).filter((r) => r.amount > 0)) + '</div></div>';

    // categories
    h += '<div class="section"><div class="section-title">Top Categories</div><div class="card">' +
      barList(s.byCategory.slice(0, 6).map((r) => { const c = cat(r.key) || {}; return { label: c.name || '?', tag: c.purpose, amount: r.amount, pct: r.pct, color: c.purpose === 'business' ? 'var(--business)' : 'var(--personal)' }; })) + '</div></div>';

    // recent
    const recent = S.txns.filter((x) => x.date >= range.from && x.date <= range.to).sort(C.cmpTxnDesc);
    h += '<div class="section"><div class="section-title">Transactions <button data-act="seeAll">See all ›</button></div>' + txnListByDay(recent.slice(0, 15)) + '</div>';
    return h;
  }

  /* ======================= ADD / EDIT FORM ======================= */
  function defaultAccount(method, purpose) {
    const type = C.METHOD_ACCOUNT_TYPE[method];
    const remembered = S.meta['acc:' + method + ':' + purpose];
    if (remembered && acc(remembered) && acc(remembered).type === type) return remembered;
    if (type === 'bank') {
      const pref = purpose === 'business' ? 'acc_current' : 'acc_saving';
      if (acc(pref)) return pref;
    }
    const first = accountsOf(type)[0]; return first ? first.id : '';
  }
  function newForm(mode) {
    const purpose = S.meta.lastPurpose || 'personal';
    const method = S.meta.lastMethod || 'UPI';
    const f = { mode, editing: false, amount: '', purpose, categoryId: '', method, accountId: '', toAccountId: '', date: today(), notes: '', err: [] };
    if (mode === 'expense') f.accountId = defaultAccount(method, purpose);
    if (mode === 'transfer') { f.accountId = acc('acc_saving') ? 'acc_saving' : ''; f.toAccountId = acc('acc_current') ? 'acc_current' : ''; }
    if (mode === 'withdraw') { const b = accountsOf('bank')[0]; f.accountId = b ? b.id : ''; const c = accountsOf('cash')[0]; f.toAccountId = c ? c.id : '__out'; }
    if (mode === 'cardpay') { const c = accountsOf('card')[0]; f.toAccountId = c ? c.id : ''; f.accountId = acc('acc_saving') ? 'acc_saving' : ''; f.method = 'UPI'; }
    if (mode === 'income') { f.accountId = acc('acc_saving') ? 'acc_saving' : ''; }
    return f;
  }
  function formFromTxn(t) {
    const modeOf = { expense: 'expense', transfer: 'transfer', cardpay: 'cardpay', income: 'income', out: 'withdraw' };
    const f = Object.assign({}, t, { mode: modeOf[t.kind], editing: true, amount: String(t.amount), err: [], accTouched: true });
    if (t.kind === 'out') f.toAccountId = '__out';
    return f;
  }

  function accChips(act, list, current, showBal) {
    const bal = showBal ? C.balances(S.accounts, S.txns) : null;
    return '<div class="chips wrap">' + list.map((a) => {
      let extra = '';
      if (showBal) extra = a.type === 'card' ? ' <small>owe ' + inr(-bal[a.id]) + '</small>' : ' <small>' + inr(bal[a.id]) + '</small>';
      return '<button class="chip' + (a.id === current ? ' on' : '') + '" data-act="' + act + '" data-v="' + a.id + '">' + esc(a.name) + extra + '</button>';
    }).join('') + '</div>';
  }
  function dateField() {
    const y = C.addDays(today(), -1);
    return '<div class="field"><label>Date</label><div class="row"><div class="chips" style="flex:none">' +
      '<button class="chip' + (F.date === today() ? ' on' : '') + '" data-act="fDate" data-v="' + today() + '">Today</button>' +
      '<button class="chip' + (F.date === y ? ' on' : '') + '" data-act="fDate" data-v="' + y + '">Yesterday</button></div>' +
      '<input class="input grow" type="date" id="f-date" data-in="fDateInput" value="' + esc(F.date) + '" max="9999-12-31"></div></div>';
  }
  function amountField(label) {
    return '<div class="field"><label for="f-amount">' + (label || 'Amount') + '</label><div class="amount-wrap"><span>₹</span><input id="f-amount" data-in="fAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(F.amount) + '"></div></div>';
  }
  function notesField(ph) {
    return '<div class="field"><label for="f-notes">Notes <span class="muted" style="text-transform:none;font-weight:500">(optional)</span></label><input class="input" id="f-notes" data-in="fNotes" type="text" placeholder="' + esc(ph || 'e.g. lunch with client') + '" value="' + esc(F.notes) + '" maxlength="200"></div>';
  }

  function viewForm(mode, editId) {
    if (editId) {
      if (!F || F.id !== editId) {
        const t = S.txns.find((x) => x.id === editId);
        if (!t) return topbar('Not found', { back: true }) + '<div class="empty">This transaction no longer exists.</div>';
        F = formFromTxn(t);
      }
    } else if (!F || F.editing) F = newForm(mode);

    const titles = { expense: 'Add Expense', transfer: 'Transfer Money', cardpay: 'Pay Card Bill', income: 'Add Money', withdraw: 'Withdraw Money' };
    let h = topbar(F.editing ? 'Edit ' + ({ expense: 'Expense', transfer: 'Transfer', cardpay: 'Card Bill Payment', income: 'Money Added', withdraw: 'Withdrawal' }[F.mode]) : titles[F.mode], { back: F.editing || F.mode !== 'expense' });
    h += '<div class="pad" style="padding-bottom:0">';
    if (!F.editing) h += seg('fMode', [['expense', 'Expense'], ['transfer', 'Transfer'], ['cardpay', 'Card Bill'], ['income', 'Add Money']], F.mode === 'withdraw' ? 'transfer' : F.mode);

    if (F.mode === 'expense') {
      h += amountField();
      h += '<div class="field"><label>Expense Type</label><div class="purpose"><button class="personal' + (F.purpose === 'personal' ? ' on' : '') + '" data-act="fPurpose" data-v="personal">Personal</button><button class="business' + (F.purpose === 'business' ? ' on' : '') + '" data-act="fPurpose" data-v="business">Business</button></div></div>';
      h += '<div class="field"><label>Category</label><div class="chips wrap">' + catsOf(F.purpose).map((c) => '<button class="chip' + (c.id === F.categoryId ? ' on' : '') + '" data-act="fCat" data-v="' + c.id + '">' + esc(c.name) + '</button>').join('') +
        '<button class="chip add" data-act="newCat">+ New</button></div></div>';
      h += '<div class="field"><label>Payment Method</label><div class="chips wrap">' + C.METHODS.map((m) => '<button class="chip' + (m === F.method ? ' on' : '') + '" data-act="fMethod" data-v="' + m + '">' + m + '</button>').join('') + '</div></div>';
      const type = C.METHOD_ACCOUNT_TYPE[F.method];
      const list = accountsOf(type);
      h += '<div class="field"><label>' + (type === 'card' ? 'Which Credit Card' : 'Paid From') + '</label>';
      if (!list.length) h += type === 'card' ? '<div class="warn">No credit card added yet. <a href="#account-edit/new-card">Add a credit card</a></div>' : '<div class="warn">No ' + type + ' account. <a href="#account-edit/new-' + type + '">Add one</a></div>';
      else h += accChips('fAcc', list, F.accountId, true);
      if (type === 'card') h += '<div class="tiny muted" style="margin-top:4px">Counted as an expense today. Paying the card bill later will not be counted again.</div>';
      h += '</div>';
      h += dateField() + notesField();
    } else if (F.mode === 'transfer' || F.mode === 'withdraw') {
      const own = S.accounts.filter((a) => a.type !== 'card');
      if (!F.editing) h += '<div class="chips" style="margin-top:12px">' + [['transfer', 'Between my accounts'], ['withdraw', 'Withdraw']].map(([v, l]) => '<button class="chip' + (F.mode === v ? ' on' : '') + '" data-act="fMode" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
      h += amountField();
      h += '<div class="field"><label>From</label>' + accChips('fAcc', own, F.accountId, true) + '</div>';
      if (F.mode === 'transfer') h += '<div class="field"><label>To</label>' + accChips('fTo', own.filter((a) => a.id !== F.accountId), F.toAccountId, true) + '</div>';
      else h += '<div class="field"><label>Money goes to</label><div class="chips wrap">' + accountsOf('cash').map((a) => '<button class="chip' + (F.toAccountId === a.id ? ' on' : '') + '" data-act="fTo" data-v="' + a.id + '">' + esc(a.name) + '</button>').join('') +
        '<button class="chip' + (F.toAccountId === '__out' ? ' on' : '') + '" data-act="fTo" data-v="__out">Outside (loan given, investment…)</button></div></div>';
      h += '<div class="info">' + (F.mode === 'withdraw' && F.toAccountId === '__out' ? 'Reduces the account balance but is <b>not counted as an expense</b>. If you actually spent it, record an Expense instead.' : 'Moving money between your own accounts is <b>not an expense</b>. Only the two balances change.') + '</div>';
      h += dateField() + notesField('e.g. ATM withdrawal');
    } else if (F.mode === 'cardpay') {
      const cards = accountsOf('card');
      if (!cards.length) h += '<div class="warn" style="margin-top:14px">You have no credit cards yet. <a href="#account-edit/new-card">Add a credit card</a></div>';
      else {
        const cs = F.toAccountId && acc(F.toAccountId) ? C.cardSummary(acc(F.toAccountId), S.txns) : null;
        h += '<div class="field"><label>Credit Card</label>' + accChips('fTo', cards, F.toAccountId, true) + '</div>';
        if (cs && !F.editing) h += '<div class="row small" style="margin:-4px 0 4px"><span class="grow muted">Outstanding: <b>' + inr(cs.outstanding) + '</b></span>' + (cs.outstanding > 0 ? '<button class="btn ghost sm" data-act="payFull">Pay full ' + inr(cs.outstanding) + '</button>' : '') + '</div>';
        h += amountField('Amount paid');
        h += '<div class="field"><label>Paid From</label>' + accChips('fAcc', S.accounts.filter((a) => a.type !== 'card'), F.accountId, true) + '</div>';
        const fromType = acc(F.accountId) ? acc(F.accountId).type : 'bank';
        if (fromType === 'bank') h += '<div class="field"><label>Paid Using</label>' + chips('fMethod', [['UPI', 'UPI'], ['Bank Transfer', 'Bank Transfer'], ['Cheque', 'Cheque']], F.method) + '</div>';
        h += '<div class="info">This is a <b>bill settlement, not a new expense</b>. Your card purchases were already counted on the day you made them.</div>';
        h += dateField() + notesField('e.g. October statement');
      }
    } else if (F.mode === 'income') {
      h += amountField();
      h += '<div class="field"><label>Add To</label>' + accChips('fAcc', S.accounts, F.accountId, true) + '</div>';
      h += '<div class="info">Use this for salary, payments received, cash deposits or refunds. Added money is <b>not</b> mixed into expense reports.</div>';
      h += dateField() + notesField('e.g. client payment, salary');
    }
    h += '<div id="f-err">' + (F.err && F.err.length ? '<div class="err">' + F.err.map(esc).join('<br>') + '</div>' : '') + '</div>';
    h += '</div><div class="form-actions">';
    if (F.editing) h += '<button class="btn primary block" data-act="fSave" data-v="close">Save Changes</button><button class="btn danger block" data-act="fDelete">' + ICON.trash + ' Delete</button>';
    else if (F.mode === 'expense') h += '<div class="btn-row"><button class="btn outline" data-act="fSave" data-v="again">Save &amp; Add Another</button><button class="btn primary" data-act="fSave" data-v="close">Save</button></div>';
    else h += '<button class="btn primary block" data-act="fSave" data-v="close">Save</button>';
    h += '</div>';
    return h;
  }

  function parseAmount(s) {
    s = String(s || '').replace(/[,₹\s]/g, '');
    if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return NaN;
    return Number(s);
  }

  async function submitForm(after) {
    const amount = parseAmount(F.amount);
    const base = { id: F.id || C.uid('t'), date: F.date, amount, notes: (F.notes || '').trim(), createdAt: F.createdAt, sample: F.editing ? F.sample : undefined };
    let t;
    if (F.mode === 'expense') t = Object.assign(base, { kind: 'expense', purpose: F.purpose, categoryId: F.categoryId, method: F.method, accountId: F.accountId });
    else if (F.mode === 'transfer') t = Object.assign(base, { kind: 'transfer', accountId: F.accountId, toAccountId: F.toAccountId });
    else if (F.mode === 'withdraw') t = F.toAccountId === '__out' ? Object.assign(base, { kind: 'out', accountId: F.accountId }) : Object.assign(base, { kind: 'transfer', accountId: F.accountId, toAccountId: F.toAccountId });
    else if (F.mode === 'cardpay') t = Object.assign(base, { kind: 'cardpay', accountId: F.accountId, toAccountId: F.toAccountId, method: acc(F.accountId) && acc(F.accountId).type === 'cash' ? 'Cash' : F.method });
    else t = Object.assign(base, { kind: 'income', accountId: F.accountId });
    if (!t.sample) delete t.sample;
    let errs = [];
    if (isNaN(amount)) errs.push('Enter a valid amount (numbers only, up to 2 decimals)');
    if (F.mode === 'expense' && !F.categoryId) errs.push('Choose a category');
    if (!errs.length) {
      try { errs = await saveTxn(t); } catch (e) { errs = ['Could not save: ' + e.message]; }
    }
    if (errs.length) {
      F.err = [...new Set(errs)];
      $('#f-err').innerHTML = '<div class="err">' + F.err.map(esc).join('<br>') + '</div>';
      $('#f-err').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (t.kind === 'expense') {
      await setMeta('lastPurpose', t.purpose); await setMeta('lastMethod', t.method);
      await setMeta('acc:' + t.method + ':' + t.purpose, t.accountId);
    }
    const what = t.kind === 'expense' ? inr(t.amount) + ' · ' + catName(t.categoryId) + ' (' + P_LABEL[t.purpose] + ')' : inr(t.amount) + ' · ' + C.KIND_LABEL[t.kind];
    if (F.editing) { toast('Updated ' + what); F = null; back('home'); return; }
    if (after === 'again') {
      const keep = { purpose: F.purpose, method: F.method, accountId: F.accountId, date: F.date, categoryId: '' };
      F = Object.assign(newForm('expense'), keep);
      rerender(); toast('Saved ' + what); window.scrollTo(0, 0);
      const a = $('#f-amount'); if (a) a.focus();
    } else {
      F = null; toast('Saved ' + what, t.kind === 'expense' ? { label: '+ Add another', act: () => go('add') } : null);
      go(t.kind === 'expense' ? 'home' : (t.kind === 'cardpay' ? 'account/' + t.toAccountId : 'accounts'));
    }
  }

  /* ======================= REPORTS ======================= */
  function reportTabs(cur) {
    return '<div class="pad" style="padding-bottom:4px"><div class="seg">' + [['daily', 'Daily'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['methods', 'Methods'], ['search', 'Search']]
      .map(([v, l]) => '<button class="' + (v === cur ? 'on' : '') + '" data-act="goto" data-v="reports/' + v + '">' + l + '</button>').join('') + '</div></div>';
  }
  function viewReports(sub) {
    let h = topbar('Reports') + reportTabs(sub);
    if (sub === 'daily') h += viewDaily();
    else if (sub === 'monthly') h += viewMonthly();
    else if (sub === 'yearly') h += viewYearly();
    else if (sub === 'methods') h += viewMethods();
    else h += viewSearch();
    return h;
  }
  function datenav(act, label, inputType, value) {
    return '<div class="datenav"><button class="icon-btn" data-act="' + act + '" data-v="-1" aria-label="Previous">' + ICON.back + '</button><div class="lab">' + label +
      (inputType ? '<input type="' + inputType + '" data-in="' + act + 'Pick" value="' + esc(value) + '" aria-label="Pick">' : '') + '</div><button class="icon-btn" data-act="' + act + '" data-v="1" aria-label="Next">' + ICON.next + '</button></div>';
  }
  function methodTiles(s) {
    return '<div class="grid3" style="margin-top:10px">' + s.byMethod.map((m) => '<div class="tile" style="padding:10px"><div class="lbl"><span class="dot" style="background:' + METHOD_COLOR[m.key] + '"></span>' + m.key + '</div><div class="val" style="font-size:1.02rem">' + inr(m.amount) + '</div></div>').join('') + '</div>';
  }

  function viewDaily() {
    const d = R.day; const s = C.summarize(S.txns, { from: d, to: d });
    const other = S.txns.filter((t) => t.date === d && t.kind !== 'expense').sort(C.cmpTxnAsc);
    let h = '<div class="section">' + datenav('dayNav', fmtDate(d, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }), 'date', d);
    if (d !== today()) h += '<div class="center" style="margin-top:6px"><button class="btn ghost sm" data-act="dayToday">Go to today</button></div>';
    h += '<div style="margin-top:12px">' + tile('Total spent', inr(s.total), { hero: true, big: true, note: s.count + ' expense' + (s.count === 1 ? '' : 's') }) + '</div>';
    h += '<div class="grid2" style="margin-top:10px">' + tile('Personal', inr(s.personal), { dot: 'personal' }) + tile('Business', inr(s.business), { dot: 'business' }) + '</div>';
    h += '<div class="section-title">By payment method</div>' + methodTiles(s);
    h += '<div class="section-title">Expenses</div>';
    if (!s.list.length) h += '<div class="card empty">No expenses on this day</div>';
    else {
      h += '<div class="card tbl-wrap" style="padding:6px 8px"><table class="tbl"><thead><tr><th>Category</th><th>Purpose</th><th>Payment</th><th class="r">Amount</th></tr></thead><tbody>' +
        s.list.slice().sort(C.cmpTxnAsc).map((t) => '<tr data-act="goto" data-v="edit/' + t.id + '"><td><b>' + esc(catName(t.categoryId)) + '</b>' + (t.notes ? '<div class="tiny muted">' + esc(t.notes) + '</div>' : '') + '</td><td><span class="tag ' + t.purpose + '">' + P_LABEL[t.purpose] + '</span></td><td>' + esc(t.method) + '<div class="tiny muted">' + esc(accName(t.accountId)) + '</div></td><td class="r"><b>' + inr(t.amount) + '</b></td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="3">Daily Total</td><td class="r">' + inr(s.total) + '</td></tr></tfoot></table></div>';
    }
    if (other.length) h += '<div class="section-title">Not counted as expenses</div><div class="list">' + other.map((t) => txnItem(t)).join('') + '</div><div class="tiny muted" style="margin-top:6px">Transfers, card bill payments and money added only change account balances.</div>';
    return h + '</div>';
  }

  function purposeSeg(act, cur) { return seg(act, [['both', 'Both'], ['personal', 'Personal'], ['business', 'Business']], cur); }
  function catRows(s, limit) {
    return s.byCategoryPurpose.slice(0, limit || 50).map((r) => { const [p, id] = r.key.split('|'); return { label: catName(id), tag: p, amount: r.amount, pct: r.pct, color: p === 'business' ? 'var(--business)' : 'var(--personal)' }; });
  }
  function accRows(s) { return s.byAccount.map((r) => ({ label: accName(r.key), amount: r.amount, pct: r.pct })); }

  function viewMonthly() {
    const ym = R.month; const [y, m] = ym.split('-').map(Number);
    const range = C.monthRange(y, m);
    const s = C.summarize(S.txns, range, R.mPurpose);
    const avg = C.dailyAverage(s.total, range);
    let h = '<div class="section">' + datenav('monthNav', fmtMonth(ym), 'month', ym) + '<div style="margin-top:10px">' + purposeSeg('mPurpose', R.mPurpose) + '</div>';
    h += '<div style="margin-top:12px">' + tile('Total expenses' + (R.mPurpose !== 'both' ? ' (' + P_LABEL[R.mPurpose] + ')' : ''), inr(s.total), { hero: true, big: true, note: s.count + ' expenses' }) + '</div>';
    h += '<div class="grid2" style="margin-top:10px">' + tile('Personal', inr(s.personal), { dot: 'personal' }) + tile('Business', inr(s.business), { dot: 'business' }) +
      tile('Average per day', inr(Math.round(avg)), { note: ym === today().slice(0, 7) ? 'so far this month' : 'over ' + C.daysInMonth(y, m) + ' days' }) +
      tile('Highest day', s.highestDay ? inr(s.highestDay.amount) : '—', { note: s.highestDay ? fmtDate(s.highestDay.key, { weekday: 'short', day: 'numeric', month: 'short' }) : '' }) + '</div>';
    // daily chart
    const days = C.daysInMonth(y, m); const dm = new Map(s.byDay.map((d) => [d.key, d.amount]));
    const data = []; for (let i = 1; i <= days; i++) { const k = ym + '-' + String(i).padStart(2, '0'); data.push({ label: String(i), value: dm.get(k) || 0, key: k, tip: fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' }) + ': ' + inr(dm.get(k) || 0) }); }
    h += '<div class="section-title">Daily spending</div><div class="card">' + columns(data, { labelEvery: 5, aria: 'Daily spending', hint: 'Tap a bar to see that day', tapAct: 'day?' }) + '</div>';
    h += '<div class="section-title">By category</div><div class="card">' + barList(catRows(s)) + '</div>';
    h += '<div class="section-title">By payment method</div><div class="card">' + barList(s.byMethod.map((x) => ({ label: x.key, amount: x.amount, pct: x.pct, color: METHOD_COLOR[x.key] }))) + '</div>';
    h += '<div class="section-title">By account (spent from)</div><div class="card">' + barList(accRows(s)) + '</div>';
    // compare
    const cm = R.cmpMonth; const [cy, cmm] = cm.split('-').map(Number);
    const c = C.summarize(S.txns, C.monthRange(cy, cmm), R.mPurpose);
    const opts = []; for (let i = -24; i <= 0; i++) { const k = shiftMonth(today().slice(0, 7), i); opts.push(k); }
    if (!opts.includes(cm)) opts.unshift(cm);
    h += '<div class="section-title">Compare months</div><div class="card"><div class="row small"><span>Compare</span><select class="input grow" data-in="cmpMonth" style="min-height:40px;padding:6px 10px">' + opts.reverse().map((k) => '<option value="' + k + '"' + (k === cm ? ' selected' : '') + '>' + fmtMonth(k) + '</option>').join('') + '</select><span>with <b>' + fmtMonthShort(ym) + '</b></span></div>';
    h += compareTable(c, s, fmtMonthShort(cm), fmtMonthShort(ym));
    h += '</div>';
    h += '<div class="spacer"></div><button class="btn outline block" data-act="exportMonth">Export ' + esc(fmtMonth(ym)) + ' report (Excel CSV)</button>';
    return h + '</div>';
  }
  function compareTable(a, b, la, lb) {
    const rowsHtml = (rows, labelFn) => rows.filter((r) => r.a || r.b).map((r) => {
      const cls = r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : 'muted';
      const pc = r.pctChange == null ? 'new' : (r.pctChange > 0 ? '+' : '') + r.pctChange.toFixed(0) + '%';
      return '<tr><td>' + labelFn(r.key) + '</td><td class="r">' + inr(r.a) + '</td><td class="r">' + inr(r.b) + '</td><td class="r ' + cls + '">' + (r.diff > 0 ? '▲ ' : r.diff < 0 ? '▼ ' : '') + inr(Math.abs(r.diff)) + '<div class="tiny">' + (r.diff ? pc : '') + '</div></td></tr>';
    }).join('');
    const main = C.compare([{ key: 'Total', amount: a.total }, { key: 'Personal', amount: a.personal }, { key: 'Business', amount: a.business }], [{ key: 'Total', amount: b.total }, { key: 'Personal', amount: b.personal }, { key: 'Business', amount: b.business }], ['Total', 'Personal', 'Business']);
    const cats = C.compare(a.byCategoryPurpose, b.byCategoryPurpose);
    const meth = C.compare(a.byMethod, b.byMethod, C.METHODS);
    const catLabel = (k) => { const [p, id] = k.split('|'); return esc(catName(id)) + ' <span class="tag ' + p + '">' + P_LABEL[p].charAt(0) + '</span>'; };
    let note = '';
    if (a.total || b.total) {
      const d = C.fromPaise(C.toPaise(b.total) - C.toPaise(a.total));
      note = '<div class="small" style="margin:10px 0 2px">' + (d > 0 ? 'You spent <b class="up">' + inr(d) + ' more</b>' : d < 0 ? 'You spent <b class="down">' + inr(-d) + ' less</b>' : 'Same spending') + ' in ' + lb + ' than ' + la + '.' +
        (cats[0] && cats[0].diff ? ' Biggest change: <b>' + catLabel(cats[0].key) + '</b> (' + (cats[0].diff > 0 ? '+' : '−') + inr(Math.abs(cats[0].diff)) + ').' : '') + '</div>';
    }
    return note + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">' + esc(la) + '</th><th class="r">' + esc(lb) + '</th><th class="r">Change</th></tr></thead><tbody>' +
      rowsHtml(main, (k) => '<b>' + k + '</b>') +
      '<tr><td colspan="4" class="tiny muted" style="padding-top:14px"><b>CATEGORIES</b></td></tr>' + (rowsHtml(cats, catLabel) || '<tr><td colspan="4" class="muted small">No data</td></tr>') +
      '<tr><td colspan="4" class="tiny muted" style="padding-top:14px"><b>PAYMENT METHODS</b></td></tr>' + (rowsHtml(meth, (k) => esc(k)) || '<tr><td colspan="4" class="muted small">No data</td></tr>') +
      '</tbody></table></div><div class="tiny muted" style="margin-top:6px">▲ red = spent more, ▼ green = spent less</div>';
  }

  function viewYearly() {
    const y = R.year; const range = { from: y + '-01-01', to: y + '-12-31' };
    const s = C.summarize(S.txns, range, R.yPurpose);
    const pers = C.summarize(S.txns, range, 'personal'), bus = C.summarize(S.txns, range, 'business');
    const mm = new Map(s.byMonth.map((x) => [x.key, x.amount]));
    const pm = new Map(pers.byMonth.map((x) => [x.key, x.amount])), bm = new Map(bus.byMonth.map((x) => [x.key, x.amount]));
    const months = []; for (let i = 1; i <= 12; i++) months.push(y + '-' + String(i).padStart(2, '0'));
    const monthsWithData = s.byMonth.length;
    let h = '<div class="section">' + datenav('yearNav', y, null) + '<div style="margin-top:10px">' + purposeSeg('yPurpose', R.yPurpose) + '</div>';
    h += '<div style="margin-top:12px">' + tile('Total annual expenses' + (R.yPurpose !== 'both' ? ' (' + P_LABEL[R.yPurpose] + ')' : ''), inr(s.total), { hero: true, big: true, note: s.count + ' expenses' }) + '</div>';
    h += '<div class="grid2" style="margin-top:10px">' + tile('Personal', inr(s.personal), { dot: 'personal' }) + tile('Business', inr(s.business), { dot: 'business' }) +
      tile('Average per month', inr(Math.round(monthsWithData ? s.total / monthsWithData : 0)), { note: monthsWithData + ' month' + (monthsWithData === 1 ? '' : 's') + ' with expenses' }) +
      tile('Highest month', s.byMonth.length ? inr(Math.max(...s.byMonth.map((x) => x.amount))) : '—', { note: s.byMonth.length ? fmtMonth(s.byMonth.reduce((a, b) => b.amount > a.amount ? b : a).key) : '' }) + '</div>';
    h += '<div class="section-title">Monthly comparison</div><div class="card">' + columns(months.map((k) => ({ label: fmtMonthShort(k).charAt(0), value: mm.get(k) || 0, key: k, tip: fmtMonth(k) + ': ' + inr(mm.get(k) || 0) })), { labelEvery: 1, aria: 'Monthly spending', hint: 'Tap a bar to see the month', tapAct: 'month?' });
    h += '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Month</th><th class="r">Personal</th><th class="r">Business</th><th class="r">Total</th></tr></thead><tbody>' +
      months.map((k) => '<tr data-act="openMonth" data-v="' + k + '"><td>' + fmtMonthShort(k) + '</td><td class="r">' + inr(pm.get(k) || 0) + '</td><td class="r">' + inr(bm.get(k) || 0) + '</td><td class="r"><b>' + inr(C.sum([pm.get(k) || 0, bm.get(k) || 0])) + '</b></td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="r">' + inr(pers.total) + '</td><td class="r">' + inr(bus.total) + '</td><td class="r">' + inr(C.sum([pers.total, bus.total])) + '</td></tr></tfoot></table></div><div class="tiny muted">Tap a month to open its monthly report.</div></div>';
    h += '<div class="section-title">By category</div><div class="card">' + barList(catRows(s)) + '</div>';
    h += '<div class="section-title">By payment method</div><div class="card">' + barList(s.byMethod.map((x) => ({ label: x.key, amount: x.amount, pct: x.pct, color: METHOD_COLOR[x.key] }))) + '</div>';
    h += '<div class="section-title">By account (spent from)</div><div class="card">' + barList(accRows(s)) + '</div>';
    h += '<div class="spacer"></div><button class="btn outline block" data-act="exportYear">Export ' + y + ' report (Excel CSV)</button>';
    return h + '</div>';
  }

  const M_PRESETS = [['month', 'This Month'], ['lastmonth', 'Last Month'], ['year', 'This Year'], ['all', 'All Time'], ['custom', 'Custom']];
  function methodsRange() {
    if (R.mPreset === 'lastmonth') { const k = shiftMonth(today().slice(0, 7), -1).split('-').map(Number); return C.monthRange(k[0], k[1]); }
    return C.rangeFor(R.mPreset, null, R.mCustom || { from: C.rangeFor('month').from, to: today() });
  }
  function viewMethods() {
    const range = methodsRange();
    const s = C.summarize(S.txns, range, R.mPurposeM);
    let h = '<div class="section">' + chips('mPreset', M_PRESETS, R.mPreset);
    if (R.mPreset === 'custom') h += '<div class="grid2" style="margin:4px 0 8px"><input class="input" type="date" data-in="mFrom" value="' + range.from + '"><input class="input" type="date" data-in="mTo" value="' + range.to + '"></div>';
    h += purposeSeg('mPurposeM', R.mPurposeM);
    const rows = s.byMethod.map((m) => ({ key: m.key, label: m.key, amount: m.amount, pct: m.pct, color: METHOD_HEX[m.key] }));
    h += '<div class="card" style="margin-top:12px"><div class="donut-wrap">' + donut(rows, 'Total', inr(s.total)) + '<div class="legend" style="flex-direction:column;gap:8px">' +
      rows.map((r) => '<span><i class="dot" style="background:' + r.color + '"></i><span class="grow">' + r.label + '</span></span>').join('') + '</div></div></div>';
    h += '<div class="card" style="margin-top:10px;padding:6px 10px"><table class="tbl"><thead><tr><th>Method</th><th class="r">Amount</th><th class="r">Share</th><th class="r">Count</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td><span class="dot" style="background:' + r.color + ';margin-right:6px"></span>' + r.label + '</td><td class="r"><b>' + inr(r.amount) + '</b></td><td class="r">' + r.pct.toFixed(1) + '%</td><td class="r">' + s.list.filter((t) => t.method === r.key).length + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="r">' + inr(s.total) + '</td><td class="r">' + (s.total ? '100%' : '0%') + '</td><td class="r">' + s.count + '</td></tr></tfoot></table></div>';
    const top = rows.slice().sort((a, b) => b.amount - a.amount)[0];
    if (top && top.amount) {
      const topCount = C.METHODS.map((m) => [m, s.list.filter((t) => t.method === m).length]).sort((a, b) => b[1] - a[1])[0];
      h += '<div class="info" style="margin-top:10px">You spend the most through <b>' + top.label + '</b> — ' + inr(top.amount) + ' (' + top.pct.toFixed(0) + '% of ' + (R.mPurposeM === 'both' ? 'all' : P_LABEL[R.mPurposeM].toLowerCase()) + ' spending). ' +
        'You use <b>' + topCount[0] + '</b> most often (' + topCount[1] + ' payment' + (topCount[1] === 1 ? '' : 's') + ').</div>';
    }
    return h + '</div>';
  }

  function viewSearch() {
    const q = R.q;
    const catOpts = C.PURPOSES.map((p) => '<optgroup label="' + P_LABEL[p] + '">' + catsOf(p).map((c) => '<option value="' + c.id + '"' + (q.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</optgroup>').join('');
    let h = '<div class="section"><input class="input" type="search" data-in="qText" placeholder="Search notes, category, amount…" value="' + esc(q.text) + '" style="margin-top:8px">' +
      '<div class="grid2" style="margin-top:10px"><div><span class="flabel">From</span><input class="input" type="date" data-in="qFrom" value="' + esc(q.from) + '"></div><div><span class="flabel">To</span><input class="input" type="date" data-in="qTo" value="' + esc(q.to) + '"></div></div>' +
      '<div style="margin-top:10px">' + purposeSeg('qPurpose', q.purpose) + '</div>' +
      '<div class="grid2" style="margin-top:10px">' +
      '<div><span class="flabel">Show</span><select class="input" data-in="qKind"><option value="expense"' + (q.kind === 'expense' ? ' selected' : '') + '>Expenses only</option><option value="any"' + (q.kind === 'any' ? ' selected' : '') + '>All entries</option><option value="transfer"' + (q.kind === 'transfer' ? ' selected' : '') + '>Transfers</option><option value="cardpay"' + (q.kind === 'cardpay' ? ' selected' : '') + '>Card bill payments</option><option value="income"' + (q.kind === 'income' ? ' selected' : '') + '>Money added</option></select></div>' +
      '<div><span class="flabel">Category</span><select class="input" data-in="qCat"><option value="">Any</option>' + catOpts + '</select></div>' +
      '<div><span class="flabel">Payment method</span><select class="input" data-in="qMethod"><option value="">Any</option>' + C.METHODS.map((m) => '<option' + (q.method === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
      '<div><span class="flabel">Account / Card</span><select class="input" data-in="qAcc"><option value="">Any</option>' + S.accounts.map((a) => '<option value="' + a.id + '"' + (q.accountId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></div>' +
      '<div><span class="flabel">Min ₹</span><input class="input" inputmode="decimal" data-in="qMin" value="' + esc(q.min) + '"></div>' +
      '<div><span class="flabel">Max ₹</span><input class="input" inputmode="decimal" data-in="qMax" value="' + esc(q.max) + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><div class="grow" id="q-summary"></div><button class="btn ghost sm" data-act="qClear">Clear</button><button class="btn outline sm" data-act="exportSearch">CSV</button></div>' +
      '<div id="q-results" style="margin-top:10px"></div></div>';
    setTimeout(updateSearchResults, 0);
    return h;
  }
  function searchLookup(t) { return [t.kind === 'expense' ? catName(t.categoryId) : C.KIND_LABEL[t.kind], accName(t.accountId), t.toAccountId ? accName(t.toAccountId) : '', t.method || '', t.purpose || ''].join(' '); }
  function updateSearchResults() {
    const sum = $('#q-summary'), out = $('#q-results'); if (!sum || !out) return;
    const res = C.search(S.txns, R.q, searchLookup);
    const expTotal = C.sum(res.filter((t) => t.kind === 'expense'), (t) => t.amount);
    sum.innerHTML = '<b>' + res.length + '</b> result' + (res.length === 1 ? '' : 's') + (expTotal ? ' · Expenses <b>' + inr(expTotal) + '</b>' : '');
    out.innerHTML = txnListByDay(res.slice(0, 300)) + (res.length > 300 ? '<div class="tiny muted center" style="margin-top:6px">Showing first 300. Narrow your filters or export CSV.</div>' : '');
  }

  /* ======================= ACCOUNTS ======================= */
  function viewAccounts() {
    const bal = C.balances(S.accounts, S.txns);
    const own = S.accounts.filter((a) => a.type !== 'card');
    const total = C.sum(own, (a) => bal[a.id]);
    let h = topbar('Accounts');
    h += '<div class="section"><div style="margin-top:12px">' + tile('Money in bank & cash', inr(total), { hero: true, big: true }) + '</div>';
    h += '<div class="grid3" style="margin-top:10px"><a class="btn ghost sm" href="#add/income">+ Add Money</a><a class="btn ghost sm" href="#add/withdraw">Withdraw</a><a class="btn ghost sm" href="#add/transfer">Transfer</a></div>';
    h += '<div class="section-title">Bank & Cash <a href="#account-edit/new-bank">+ Add</a></div><div class="list">' +
      own.map((a) => '<a class="item" href="#account/' + a.id + '"><div class="ic neutral">' + (a.type === 'cash' ? '₹' : '🏦') + '</div><div class="grow"><div class="t1">' + esc(a.name) + '</div><div class="t2">' + (a.type === 'cash' ? 'Cash' : 'Bank account') + ' · opening ' + inr(a.opening) + '</div></div><div class="amt' + (bal[a.id] < 0 ? ' up' : '') + '">' + inr(bal[a.id]) + '</div></a>').join('') + '</div>';
    const cards = accountsOf('card');
    const totalOut = C.sum(cards, (c) => C.cardSummary(c, S.txns).outstanding);
    h += '<div class="section-title">Credit Cards <a href="#account-edit/new-card">+ Add card</a></div>';
    if (!cards.length) h += '<div class="card empty small">No credit cards yet. Add one to track card purchases and bill payments.</div>';
    else {
      h += '<div class="card" style="margin-bottom:10px"><div class="row"><div class="grow small muted">Total outstanding (all cards)</div><b class="num" style="color:var(--red);font-size:1.2rem">' + inr(totalOut) + '</b></div></div>';
      h += cards.map((c) => {
        const cs = C.cardSummary(c, S.txns);
        return '<a class="acc" href="#account/' + c.id + '" style="margin-bottom:10px"><div class="row"><div class="grow"><div class="an" style="font-size:.95rem;color:var(--ink)">' + esc(c.name) + '</div><div class="tiny muted">Purchases ' + inr(cs.purchases) + ' · Paid ' + inr(cs.payments) + '</div></div><div style="text-align:right"><div class="tiny muted">Outstanding</div><div class="ab" style="color:var(--red)">' + inr(cs.outstanding) + '</div></div></div>' +
          (cs.limit ? '<div class="limit-track"><div class="limit-fill" style="width:' + Math.min(100, Math.max(0, cs.used)).toFixed(1) + '%"></div></div><div class="tiny muted" style="margin-top:4px">Limit ' + inr(cs.limit) + ' · Available ' + inr(cs.available) + '</div>' : '') + '</a>';
      }).join('');
      h += '<a class="btn primary block" href="#add/cardpay">Pay Credit Card Bill</a>';
    }
    h += '<div class="info" style="margin-top:14px">Transfers between your accounts and card bill payments are <b>never counted as expenses</b>. Only the balances change.</div>';
    return h + '</div>';
  }

  function viewAccount(id) {
    const a = acc(id);
    if (!a) return topbar('Account', { back: true }) + '<div class="empty">Account not found</div>';
    const ledger = C.accountLedger(a, S.txns).reverse();
    const bal = C.balances(S.accounts, S.txns)[a.id];
    const ms = C.summarize(S.txns.filter((t) => t.accountId === a.id), C.rangeFor('month'));
    let h = topbar(esc(a.name), { back: true, sub: a.type === 'card' ? 'Credit card' : a.type === 'cash' ? 'Cash' : 'Bank account', right: '<a class="icon-btn" href="#account-edit/' + a.id + '" aria-label="Edit">' + ICON.edit + '</a>' });
    h += '<div class="section">';
    if (a.type === 'card') {
      const cs = C.cardSummary(a, S.txns);
      h += '<div style="margin-top:12px">' + tile('Outstanding (you owe)', inr(cs.outstanding), { hero: true, big: true, note: cs.limit ? 'Limit ' + inr(cs.limit) + ' · Available ' + inr(cs.available) : '' }) + '</div>';
      h += '<div class="grid2" style="margin-top:10px">' + tile('Total purchases', inr(cs.purchases)) + tile('Total payments', inr(cs.payments)) +
        (cs.opening ? tile('Opening outstanding', inr(cs.opening)) : '') + (cs.refunds ? tile('Refunds', inr(cs.refunds)) : '') + tile('Spent this month', inr(ms.total), { note: 'Personal ' + inr(ms.personal) + ' · Business ' + inr(ms.business) }) + '</div>';
      h += '<div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="payCard" data-v="' + a.id + '">Pay Bill</button><button class="btn ghost" data-act="cardExpense" data-v="' + a.id + '">+ Card Purchase</button></div>';
    } else {
      h += '<div style="margin-top:12px">' + tile('Current balance', inr(bal), { hero: true, big: true, note: 'Opening balance ' + inr(a.opening) }) + '</div>';
      h += '<div class="grid2" style="margin-top:10px">' + tile('Spent from here this month', inr(ms.total)) + tile('Personal / Business', inr(ms.personal) + ' / ' + inr(ms.business)) + '</div>';
      h += '<div class="grid3" style="margin-top:10px"><button class="btn ghost sm" data-act="accIncome" data-v="' + a.id + '">+ Add</button><button class="btn ghost sm" data-act="accTransfer" data-v="' + a.id + '">Transfer</button><button class="btn ghost sm" data-act="accWithdraw" data-v="' + a.id + '">Withdraw</button></div>';
    }
    h += '<div class="section-title">History (' + ledger.length + ')</div>';
    if (!ledger.length) h += '<div class="card empty small">No transactions yet</div>';
    else h += '<div class="list">' + ledger.slice(0, 400).map((r) => txnItem(r.txn, { showDate: true, delta: r.delta, balance: a.type === 'card' ? null : r.balance })).join('') + '</div>';
    return h + '</div>';
  }

  function viewAccountEdit(arg) {
    const isNew = arg.startsWith('new-');
    const a = isNew ? { id: '', name: '', type: arg.slice(4), opening: 0, limit: '' } : acc(arg);
    if (!a) return topbar('Account', { back: true }) + '<div class="empty">Account not found</div>';
    const used = isNew ? 0 : S.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
    let h = topbar(isNew ? (a.type === 'card' ? 'Add Credit Card' : 'Add Account') : 'Edit ' + esc(a.name), { back: true });
    h += '<div class="pad"><form data-form="account" data-id="' + esc(a.id) + '">';
    h += '<div class="field"><label>Name</label><input class="input" name="name" required maxlength="40" value="' + esc(a.name) + '" placeholder="' + (a.type === 'card' ? 'e.g. HDFC Regalia' : 'e.g. SBI Saving') + '"></div>';
    if (isNew && a.type !== 'card') h += '<div class="field"><label>Type</label><select class="input" name="type"><option value="bank"' + (a.type === 'bank' ? ' selected' : '') + '>Bank account</option><option value="cash"' + (a.type === 'cash' ? ' selected' : '') + '>Cash wallet</option></select></div>';
    else h += '<input type="hidden" name="type" value="' + a.type + '">';
    if (a.type === 'card') {
      h += '<div class="field"><label>Outstanding when you start (₹)</label><input class="input" name="opening" inputmode="decimal" value="' + esc(a.opening || '') + '" placeholder="0"><div class="tiny muted" style="margin-top:4px">Amount you already owe on this card today. Leave 0 if none.</div></div>';
      h += '<div class="field"><label>Credit limit (₹, optional)</label><input class="input" name="limit" inputmode="decimal" value="' + esc(a.limit || '') + '" placeholder="e.g. 200000"></div>';
    } else {
      h += '<div class="field"><label>Opening balance (₹)</label><input class="input" name="opening" inputmode="decimal" value="' + esc(a.opening || '') + '" placeholder="0"><div class="tiny muted" style="margin-top:4px">Money in this account when you start using the app. Can be negative for an overdraft.</div></div>';
    }
    h += '<div id="acc-err"></div><button class="btn primary block" type="submit">Save</button></form>';
    if (!isNew) h += '<div class="spacer"></div><button class="btn danger block" data-act="delAccount" data-v="' + a.id + '">' + ICON.trash + ' Delete account</button>' + (used ? '<div class="tiny muted center" style="margin-top:6px">This account has ' + used + ' transaction(s). Delete or move them first.</div>' : '');
    return h + '</div>';
  }

  async function saveAccountForm(form) {
    const fd = new FormData(form); const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim(); const type = fd.get('type');
    const opening = parseAmountSigned(fd.get('opening')); const limit = fd.get('limit') != null ? parseAmountSigned(fd.get('limit')) : 0;
    const errs = [];
    if (!name) errs.push('Enter a name');
    if (S.accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) errs.push('An account with this name already exists');
    if (isNaN(opening)) errs.push('Opening amount must be a number');
    if (isNaN(limit) || limit < 0) errs.push('Credit limit must be a positive number');
    if (errs.length) { $('#acc-err').innerHTML = '<div class="err" style="margin-bottom:10px">' + errs.join('<br>') + '</div>'; return; }
    const existing = id ? acc(id) : null;
    const a = Object.assign({}, existing || { id: C.uid('acc'), createdAt: Date.now(), order: S.accounts.length }, { name, type, opening });
    if (type === 'card') a.limit = limit || 0;
    await DB.put('accounts', a);
    if (existing) Object.assign(existing, a); else S.accounts.push(a);
    toast(existing ? 'Account updated' : 'Account added');
    back('accounts');
  }
  function parseAmountSigned(s) { s = String(s == null ? '' : s).replace(/[,₹\s]/g, ''); if (s === '') return 0; return /^-?\d*\.?\d{0,2}$/.test(s) ? Number(s) : NaN; }

  /* ======================= SETTINGS ======================= */
  function viewSettings() {
    const lb = S.meta.lastBackupAt;
    const nSample = S.txns.filter((t) => t.sample).length;
    let h = topbar('Settings', { right: '<a class="icon-btn" href="#help" aria-label="Help">' + ICON.help + '</a>' });
    h += '<div class="section">';
    h += '<div class="section-title">Categories</div><div class="list"><a class="item" href="#categories"><div class="grow"><div class="t1">Manage categories</div><div class="t2">' + catsOf('personal').length + ' personal · ' + catsOf('business').length + ' business</div></div>' + ICON.next + '</a></div>';
    h += '<div class="section-title">Backup & Restore</div><div class="card"><div class="small" style="margin-bottom:10px">Last backup: <b>' + (lb ? new Date(lb).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never') + '</b><br><span class="muted">' + S.txns.length + ' transactions · ' + S.accounts.length + ' accounts</span></div>' +
      '<div class="btn-row"><button class="btn primary sm" data-act="backup">Download backup</button>' + (navigator.canShare ? '<button class="btn ghost sm" data-act="shareBackup">Share / Save to Drive</button>' : '') + '</div>' +
      '<div class="spacer"></div><label class="btn outline sm block" style="cursor:pointer">Restore from backup file<input type="file" accept=".json,application/json" data-in="restoreFile" hidden></label>' +
      '<div class="tiny muted" style="margin-top:8px">Backup files contain everything: accounts, cards, categories and all transactions. Keep a copy in Google Drive or email it to yourself.</div></div>';
    h += '<div class="section-title">Export to Excel (CSV)</div><div class="card"><button class="btn outline sm block" data-act="exportAll">All transactions</button><div class="spacer"></div>' +
      '<div class="row"><select class="input grow" id="exp-month">' + Array.from({ length: 24 }, (_, i) => shiftMonth(today().slice(0, 7), -i)).map((k) => '<option value="' + k + '">' + fmtMonth(k) + '</option>').join('') + '</select><button class="btn outline sm" data-act="exportMonthSel">Monthly</button></div><div class="spacer"></div>' +
      '<div class="row"><select class="input grow" id="exp-year">' + yearsList().map((y) => '<option>' + y + '</option>').join('') + '</select><button class="btn outline sm" data-act="exportYearSel">Yearly</button></div></div>';
    h += '<div class="section-title">Sample Data</div><div class="card">' + (nSample ? '<div class="small" style="margin-bottom:10px">' + nSample + ' sample transactions are loaded.</div><button class="btn danger sm block" data-act="removeSample">Remove all sample data</button>'
      : '<div class="small muted" style="margin-bottom:10px">Load realistic demo transactions to explore the reports. You can remove them in one tap.</div><button class="btn ghost sm block" data-act="loadSample">Load sample data</button>') + '</div>';
    h += '<div class="section-title">Storage</div><div class="card small" id="storage-info">Checking…</div>';
    h += '<div class="section-title">Danger zone</div><button class="btn danger block" data-act="eraseAll">Erase all data</button>';
    h += '<div class="center tiny muted" style="margin:18px 0">My Expense Manager · v1.0 · Data is stored only on this device</div></div>';
    setTimeout(fillStorageInfo, 0);
    return h;
  }
  function yearsList() {
    const ys = new Set([today().slice(0, 4)]); for (const t of S.txns) ys.add(t.date.slice(0, 4));
    return [...ys].sort().reverse();
  }
  async function fillStorageInfo() {
    const el = $('#storage-info'); if (!el) return;
    let txt = '';
    try {
      const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      txt = (persisted ? '✅ <b>Permanent storage is ON.</b> Android will not auto-clear your data.' : '⚠️ <b>Permanent storage not granted yet.</b> Install the app to your home screen (it is usually granted automatically), and keep regular backups.') +
        (est ? '<div class="muted" style="margin-top:6px">Using ' + (est.usage / 1024).toFixed(0) + ' KB on this device.</div>' : '') +
        (!persisted ? '<button class="btn ghost sm block" style="margin-top:10px" data-act="persist">Request permanent storage</button>' : '');
    } catch (e) { txt = 'Storage information unavailable.'; }
    el.innerHTML = txt;
  }

  function viewCategories() {
    let h = topbar('Categories', { back: true });
    h += '<div class="section">';
    for (const p of C.PURPOSES) {
      const list = catsOf(p);
      h += '<div class="section-title">' + P_LABEL[p] + ' <button data-act="addCat" data-v="' + p + '">+ Add</button></div><div class="list">' + list.map((c) => {
        const n = S.txns.filter((t) => t.categoryId === c.id).length;
        return '<div class="item" style="cursor:default"><div class="ic ' + p + '">' + esc(c.name.charAt(0).toUpperCase()) + '</div><div class="grow"><div class="t1">' + esc(c.name) + '</div><div class="t2">' + n + ' transaction' + (n === 1 ? '' : 's') + '</div></div>' +
          '<button class="icon-btn" data-act="renameCat" data-v="' + c.id + '" aria-label="Rename">' + ICON.edit + '</button>' + (c.system ? '' : '<button class="icon-btn" data-act="delCat" data-v="' + c.id + '" aria-label="Delete">' + ICON.trash + '</button>') + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="tiny muted" style="margin-top:10px">Renaming a category updates all past transactions. Deleting one moves its transactions to “Others”.</div></div>';
    return h;
  }

  function viewHelp() {
    return topbar('How to use', { back: true }) + '<div class="prose">' +
      '<h2>Add an expense (10 seconds)</h2><ol><li>Tap <b>Add</b> (or the big green button on Home).</li><li>Type the amount.</li><li>Tap <b>Personal</b> or <b>Business</b>, then a category.</li><li>Tap how you paid (UPI, Cash, Bank Transfer, Cheque, Credit Card) and which account it came from.</li><li>Tap <b>Save</b>. Use <b>Save &amp; Add Another</b> to enter several in a row.</li></ol>' +
      '<p>Personal and Business are independent of the account. A personal purchase paid from the Current Account is still a <b>Personal</b> expense.</p>' +
      '<h2>Credit cards</h2><p>Record card purchases as normal expenses with payment method <b>Credit Card</b> — they count on the day you buy. When you pay the bill, use <b>Add → Card Bill</b>. That only reduces what you owe; it is never counted as a second expense.</p>' +
      '<h2>Transfers &amp; cash withdrawals</h2><p>Use <b>Add → Transfer</b> to move money between Saving and Current, or <b>Withdraw</b> to take cash out to your Cash Wallet. These are not expenses.</p>' +
      '<h2>Edit or delete</h2><p>Tap any transaction anywhere in the app to change it or delete it. All balances and reports update instantly.</p>' +
      '<h2>Reports</h2><ul><li><b>Daily</b> – everything spent on one day, with UPI / Cash / Bank / Cheque / Card totals.</li><li><b>Monthly</b> – categories, methods, accounts, daily chart and a month-vs-month comparison.</li><li><b>Yearly</b> – month-by-month totals and annual analysis.</li><li><b>Methods</b> – which payment method you use most, with percentages.</li><li><b>Search</b> – filter by date, amount, category, purpose, method, account and notes.</li></ul>' +
      '<h2>Keep your data safe</h2><p>Your data stays on this phone only. Go to <b>Settings → Download backup</b> every week (or use <b>Share</b> to save it to Google Drive). To move to a new phone, install the app there and use <b>Restore from backup file</b>.</p></div>';
  }

  /* ======================= SAMPLE DATA ======================= */
  async function loadSample() {
    if (S.txns.some((t) => t.sample)) return toast('Sample data is already loaded');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const amt = (lo, hi, step) => Math.round((lo + rnd() * (hi - lo)) / (step || 10)) * (step || 10);
    const card = { id: C.uid('acc'), name: 'Sample Credit Card', type: 'card', opening: 0, limit: 150000, sample: true, createdAt: Date.now(), order: 99 };
    const catId = (p, name) => (S.categories.find((c) => c.purpose === p && c.name === name) || catsOf(p)[0]).id;
    const sav = acc('acc_saving') ? 'acc_saving' : accountsOf('bank')[0].id;
    const cur = acc('acc_current') ? 'acc_current' : accountsOf('bank')[0].id;
    const cash = acc('acc_cash') ? 'acc_cash' : accountsOf('cash')[0].id;
    const tx = []; let n = 0;
    const T = (o) => tx.push(Object.assign({ id: C.uid('s'), createdAt: Date.now() + (n++), sample: true, notes: '' }, o));
    const start = C.addDays(today(), -100);
    T({ kind: 'income', date: start, amount: 120000, accountId: sav, notes: 'Starting balance (sample)' });
    T({ kind: 'income', date: start, amount: 350000, accountId: cur, notes: 'Starting balance (sample)' });
    T({ kind: 'income', date: start, amount: 10000, accountId: cash, notes: 'Starting cash (sample)' });
    let cardMonth = 0;
    for (let i = 99; i >= 0; i--) {
      const d = C.addDays(today(), -i); const dd = Number(d.slice(8));
      if (rnd() < 0.85) T({ kind: 'expense', date: d, amount: amt(120, 650), purpose: 'personal', categoryId: catId('personal', 'Food'), method: pick(['UPI', 'UPI', 'Cash']), accountId: null, notes: pick(['Lunch', 'Groceries', 'Dinner', 'Tea & snacks', '']) });
      if (rnd() < 0.35) T({ kind: 'expense', date: d, amount: amt(500, 2500, 50), purpose: 'business', categoryId: catId('business', 'Petrol'), method: pick(['Cash', 'UPI', 'Credit Card']), accountId: null, notes: 'Delivery vehicle' });
      if (rnd() < 0.18) T({ kind: 'expense', date: d, amount: amt(800, 6000, 100), purpose: 'personal', categoryId: catId('personal', 'Shopping'), method: pick(['Credit Card', 'UPI', 'UPI']), accountId: rnd() < 0.3 ? cur : null, notes: pick(['Clothes', 'Amazon order', 'Home items']) });
      if (rnd() < 0.2) T({ kind: 'expense', date: d, amount: amt(4000, 25000, 500), purpose: 'business', categoryId: catId('business', 'Purchasing'), method: pick(['Bank Transfer', 'Bank Transfer', 'Cheque', 'UPI']), accountId: null, notes: pick(['Stock purchase', 'Raw material', 'Supplier payment']) });
      if (rnd() < 0.12) T({ kind: 'expense', date: d, amount: amt(300, 1500), purpose: 'business', categoryId: catId('business', 'Office Expenses'), method: pick(['UPI', 'Cash']), accountId: null, notes: pick(['Stationery', 'Courier', 'Printer ink']) });
      if (rnd() < 0.08) T({ kind: 'expense', date: d, amount: amt(1500, 5000, 100), purpose: 'personal', categoryId: catId('personal', 'Hotel'), method: pick(['Credit Card', 'UPI']), accountId: null, notes: 'Family dinner' });
      if (rnd() < 0.1) T({ kind: 'expense', date: d, amount: amt(500, 2000, 50), purpose: 'personal', categoryId: catId('personal', 'Petrol'), method: 'UPI', accountId: null, notes: 'Car' });
      if (dd === 5) T({ kind: 'expense', date: d, amount: 12500, purpose: 'personal', categoryId: catId('personal', 'EMI'), method: 'Bank Transfer', accountId: sav, notes: 'Home loan EMI' });
      if (dd === 1) { T({ kind: 'expense', date: d, amount: 18000, purpose: 'business', categoryId: catId('business', 'Salary'), method: 'Bank Transfer', accountId: cur, notes: 'Staff salary' }); T({ kind: 'expense', date: d, amount: amt(1800, 3200, 50), purpose: 'business', categoryId: catId('business', 'Utilities'), method: 'UPI', accountId: cur, notes: 'Electricity bill' }); }
      if (dd === 2) T({ kind: 'transfer', date: d, amount: 25000, accountId: cur, toAccountId: sav, notes: 'Monthly drawing' });
      if (dd === 10 || dd === 24) T({ kind: 'transfer', date: d, amount: 5000, accountId: sav, toAccountId: cash, notes: 'ATM withdrawal' });
      if (dd === 15 || dd === 28) T({ kind: 'income', date: d, amount: amt(40000, 90000, 1000), accountId: cur, notes: 'Customer payment' });
      if (dd === 18 && cardMonth > 0) { T({ kind: 'cardpay', date: d, amount: cardMonth, method: 'UPI', accountId: sav, toAccountId: card.id, notes: 'Card bill' }); cardMonth = 0; }
      if (dd === 20) cardMonth = 1; // marker to compute below
    }
    // Fill in accounts for each expense by method / purpose, then compute card bills = purchases until previous statement
    for (const t of tx) {
      if (t.kind !== 'expense') continue;
      const type = C.METHOD_ACCOUNT_TYPE[t.method];
      if (t.accountId && acc(t.accountId) && acc(t.accountId).type === type) continue;
      t.accountId = type === 'card' ? card.id : type === 'cash' ? cash : (t.purpose === 'business' ? cur : sav);
    }
    // recompute card bill amounts: pay what was spent on the card up to the 20th of previous month
    let paidUpTo = '0000-00-00';
    for (const t of tx.filter((x) => x.kind === 'cardpay').sort(C.cmpTxnAsc)) {
      const stmt = C.addDays(t.date, -28);
      t.amount = C.sum(tx.filter((x) => x.kind === 'expense' && x.accountId === card.id && x.date > paidUpTo && x.date <= stmt), (x) => x.amount) || 1000;
      paidUpTo = stmt;
    }
    await DB.put('accounts', card); S.accounts.push(card);
    await DB.putMany('txns', tx); S.txns.push(...tx);
    await setMeta('welcomeDone', true);
    toast('Loaded ' + tx.length + ' sample transactions'); rerender();
  }
  async function removeSample() {
    const ok = await confirmBox({ title: 'Remove sample data?', msg: 'All sample transactions and the sample credit card will be deleted. Your own entries are kept.', ok: 'Remove', danger: true });
    if (!ok) return;
    const ids = S.txns.filter((t) => t.sample).map((t) => t.id);
    await DB.delMany('txns', ids); S.txns = S.txns.filter((t) => !t.sample);
    const sAcc = S.accounts.filter((a) => a.sample && !S.txns.some((t) => t.accountId === a.id || t.toAccountId === a.id));
    await DB.delMany('accounts', sAcc.map((a) => a.id)); S.accounts = S.accounts.filter((a) => !sAcc.includes(a));
    toast('Sample data removed'); rerender();
  }

  /* ======================= EXPORT / BACKUP ======================= */
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  const stamp = () => { const d = new Date(); return C.ymd(d) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
  const TX_HEAD = ['Date', 'Type', 'Personal/Business', 'Category', 'Payment Method', 'Paid From / Account', 'To Account', 'Amount (INR)', 'Counted as Expense', 'Notes'];
  const txRow = (t) => [t.date, C.KIND_LABEL[t.kind], t.purpose ? P_LABEL[t.purpose] : '', t.kind === 'expense' ? catName(t.categoryId) : '', t.method || '', accName(t.accountId), t.toAccountId ? accName(t.toAccountId) : '', t.amount.toFixed(2), t.kind === 'expense' ? 'Yes' : 'No', t.notes || ''];

  function exportAll() {
    const rows = [TX_HEAD, ...S.txns.slice().sort(C.cmpTxnAsc).map(txRow)];
    download('expenses_all_' + stamp() + '.csv', C.toCsv(rows)); toast('Exported ' + S.txns.length + ' transactions');
  }
  function reportRows(title, s, extraBreak) {
    const rows = [[title], [], ['SUMMARY'], ['Total Expenses', s.total.toFixed(2)], ['Personal', s.personal.toFixed(2)], ['Business', s.business.toFixed(2)], ['Number of expenses', s.count], [],
      ['BY CATEGORY', 'Purpose', 'Amount', '%'], ...s.byCategoryPurpose.map((r) => { const [p, id] = r.key.split('|'); return [catName(id), P_LABEL[p], r.amount.toFixed(2), r.pct.toFixed(1)]; }), [],
      ['BY PAYMENT METHOD', 'Amount', '%'], ...s.byMethod.map((r) => [r.key, r.amount.toFixed(2), r.pct.toFixed(1)]), [],
      ['BY ACCOUNT (SPENT FROM)', 'Amount', '%'], ...s.byAccount.map((r) => [accName(r.key), r.amount.toFixed(2), r.pct.toFixed(1)]), []];
    rows.push(...extraBreak, [], ['ALL EXPENSES'], TX_HEAD, ...s.list.slice().sort(C.cmpTxnAsc).map(txRow));
    return rows;
  }
  function exportMonth(ym) {
    const [y, m] = ym.split('-').map(Number); const range = C.monthRange(y, m);
    const s = C.summarize(S.txns, range); const p = C.summarize(S.txns, range, 'personal'); const b = C.summarize(S.txns, range, 'business');
    const pm = new Map(p.byDay.map((d) => [d.key, d.amount])), bm = new Map(b.byDay.map((d) => [d.key, d.amount]));
    const daily = [['DAILY BREAKDOWN', 'Personal', 'Business', 'Total']];
    for (let i = 1; i <= C.daysInMonth(y, m); i++) { const k = ym + '-' + String(i).padStart(2, '0'); const a = pm.get(k) || 0, c = bm.get(k) || 0; daily.push([k, a.toFixed(2), c.toFixed(2), C.sum([a, c]).toFixed(2)]); }
    daily.push([], ['Highest spending day', s.highestDay ? s.highestDay.key : '-', s.highestDay ? s.highestDay.amount.toFixed(2) : ''], ['Average per day', C.dailyAverage(s.total, range).toFixed(2)]);
    download('expense_report_' + ym + '.csv', C.toCsv(reportRows('Monthly Expense Report - ' + fmtMonth(ym), s, daily))); toast('Exported ' + fmtMonth(ym));
  }
  function exportYear(y) {
    const range = { from: y + '-01-01', to: y + '-12-31' };
    const s = C.summarize(S.txns, range); const p = C.summarize(S.txns, range, 'personal'); const b = C.summarize(S.txns, range, 'business');
    const pm = new Map(p.byMonth.map((d) => [d.key, d.amount])), bm = new Map(b.byMonth.map((d) => [d.key, d.amount]));
    const monthly = [['MONTHLY BREAKDOWN', 'Personal', 'Business', 'Total']];
    for (let i = 1; i <= 12; i++) { const k = y + '-' + String(i).padStart(2, '0'); const a = pm.get(k) || 0, c = bm.get(k) || 0; monthly.push([fmtMonth(k), a.toFixed(2), c.toFixed(2), C.sum([a, c]).toFixed(2)]); }
    download('expense_report_' + y + '.csv', C.toCsv(reportRows('Yearly Expense Report - ' + y, s, monthly))); toast('Exported ' + y);
  }
  function backupJson() { return JSON.stringify(C.makeBackup({ accounts: S.accounts, categories: S.categories, txns: S.txns, meta: { lastPurpose: S.meta.lastPurpose, lastMethod: S.meta.lastMethod } }), null, 1); }
  async function doBackup() {
    download('my-expenses-backup_' + stamp() + '.json', backupJson(), 'application/json');
    await setMeta('lastBackupAt', Date.now()); toast('Backup downloaded — keep it safe'); rerender();
  }
  async function shareBackup() {
    const name = 'my-expenses-backup_' + stamp() + '.json';
    const file = new File([backupJson()], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Expense backup', text: 'My Expense Manager backup ' + stamp() }); await setMeta('lastBackupAt', Date.now()); toast('Backup shared'); rerender(); }
      catch (e) { if (e.name !== 'AbortError') toast('Sharing failed — use Download instead'); }
    } else doBackup();
  }
  async function restoreFrom(file) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { return alertBox('Cannot read file', 'This is not a valid backup file.'); }
    const errs = C.checkBackup(obj);
    if (errs.length) return alertBox('Backup not accepted', errs.join('. '));
    const ok = await confirmBox({ title: 'Restore this backup?', msg: 'Backup from ' + new Date(obj.exportedAt).toLocaleString('en-IN') + ' with ' + obj.txns.length + ' transactions and ' + obj.accounts.length + ' accounts.\n\nThis REPLACES all data currently on this phone.', ok: 'Replace & Restore', danger: true });
    if (!ok) return;
    const meta = Object.assign({}, obj.meta || {}, { welcomeDone: true, lastBackupAt: S.meta.lastBackupAt || Date.now() });
    await DB.replaceAll({ accounts: obj.accounts, categories: obj.categories, txns: obj.txns, meta });
    Object.assign(S, await DB.loadAll());
    toast('Restored ' + S.txns.length + ' transactions'); go('home');
  }
  async function eraseAll() {
    const ok = await confirmBox({ title: 'Erase ALL data?', msg: 'Every transaction, account and category on this phone will be permanently deleted. Download a backup first if you may need it.', ok: 'Continue', danger: true });
    if (!ok) return;
    const word = await promptBox({ title: 'Type DELETE to confirm', label: 'Confirmation', value: '' });
    if (word !== 'DELETE') return toast('Cancelled — nothing was deleted');
    await DB.replaceAll({ accounts: [], categories: [], txns: [], meta: {} });
    Object.assign(S, { accounts: [], categories: [], txns: [], meta: {} }); await ensureDefaults();
    toast('All data erased'); go('home');
  }

  /* ======================= CATEGORIES ======================= */
  async function addCategory(purpose, nameIn) {
    const name = (nameIn != null ? nameIn : await promptBox({ title: 'New ' + P_LABEL[purpose] + ' category', label: 'Category name', value: '' }) || '').trim();
    if (!name) return null;
    if (catsOf(purpose).some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast('“' + name + '” already exists'); return catsOf(purpose).find((c) => c.name.toLowerCase() === name.toLowerCase()); }
    const c = { id: C.uid('c'), name: name.slice(0, 30), purpose, order: Math.max(0, ...catsOf(purpose).filter((x) => !x.system).map((x) => x.order || 0)) + 0.5 };
    await DB.put('categories', c); S.categories.push(c); toast('Category added'); return c;
  }

  /* ======================= MODALS & TOAST ======================= */
  let toastTimer = null;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = '<span class="ok">' + ICON.check + '</span><span>' + esc(msg) + '</span>' + (action ? '<button>' + esc(action.label) + '</button>' : '');
    if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.act(); };
    el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2600);
  }
  function openSheet(html) {
    const m = $('#modal'); m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>'; m.hidden = false;
    return m;
  }
  function closeSheet() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
  function confirmBox(o) {
    return new Promise((res) => {
      const m = openSheet('<h3>' + esc(o.title) + '</h3><p style="white-space:pre-line">' + esc(o.msg) + '</p><div class="btn-row"><button class="btn outline" data-r="0">Cancel</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-r="1">' + esc(o.ok || 'OK') + '</button></div>');
      m.onclick = (e) => { const b = e.target.closest('[data-r]'); if (e.target === m || b) { closeSheet(); m.onclick = null; res(b ? b.dataset.r === '1' : false); } };
    });
  }
  function alertBox(title, msg) { return confirmBox({ title, msg, ok: 'OK' }); }
  function promptBox(o) {
    return new Promise((res) => {
      const m = openSheet('<h3>' + esc(o.title) + '</h3><form><input class="input" id="pb-in" maxlength="40" value="' + esc(o.value || '') + '" aria-label="' + esc(o.label) + '" autocomplete="off"><div class="btn-row" style="margin-top:14px"><button type="button" class="btn outline" data-r="0">Cancel</button><button type="submit" class="btn primary">OK</button></div></form>');
      const inp = $('#pb-in'); setTimeout(() => { inp.focus(); inp.select(); }, 50);
      const finish = (v) => { closeSheet(); m.onclick = null; res(v); };
      m.querySelector('form').onsubmit = (e) => { e.preventDefault(); finish(inp.value); };
      m.onclick = (e) => { if (e.target === m || e.target.closest('[data-r="0"]')) finish(null); };
    });
  }

  /* ======================= EVENTS ======================= */
  const ACT = {
    back: () => { F = null; back('home'); },
    goto: (el) => go(el.dataset.v),
    goToday: () => { R.day = today(); go('reports/daily'); },
    goMonth: () => { R.month = today().slice(0, 7); go('reports/monthly'); },
    dash: async (el) => { R.dash = el.dataset.v; await setMeta('dash', R.dash); rerender(); },
    seeAll: () => { const r = dashRange(); R.q = Object.assign({}, R.q, { kind: 'any', from: r.from === '0000-01-01' ? '' : r.from, to: r.to, text: '', purpose: 'both', categoryId: '', method: '', accountId: '', min: '', max: '' }); go('reports/search'); },
    loadSample, removeSample,
    backup: doBackup, shareBackup, exportAll,
    exportMonth: () => exportMonth(R.month), exportYear: () => exportYear(R.year),
    exportMonthSel: () => exportMonth($('#exp-month').value), exportYearSel: () => exportYear($('#exp-year').value),
    exportSearch: () => {
      const res = C.search(S.txns, R.q, searchLookup).sort(C.cmpTxnAsc);
      if (!res.length) return toast('Nothing to export');
      download('expenses_search_' + stamp() + '.csv', C.toCsv([TX_HEAD, ...res.map(txRow)])); toast('Exported ' + res.length + ' rows');
    },
    eraseAll,
    persist: async () => { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'Permanent storage granted' : 'Not granted — install the app to Home screen first'); fillStorageInfo(); },
    // form
    fMode: (el) => { const keepAmt = F ? F.amount : ''; F = newForm(el.dataset.v); F.amount = keepAmt; rerender(); },
    fPurpose: (el) => {
      const p = el.dataset.v; if (p === F.purpose) return;
      const old = cat(F.categoryId); F.purpose = p;
      const same = old && catsOf(p).find((c) => c.name.toLowerCase() === old.name.toLowerCase());
      F.categoryId = same ? same.id : '';
      if (!F.accTouched) F.accountId = defaultAccount(F.method, p);
      rerender();
    },
    fCat: (el) => { F.categoryId = el.dataset.v; rerender(); },
    newCat: async () => { const c = await addCategory(F.purpose); if (c) F.categoryId = c.id; rerender(); },
    fMethod: (el) => {
      F.method = el.dataset.v;
      if (F.mode === 'expense') { const cur = acc(F.accountId); if (!cur || cur.type !== C.METHOD_ACCOUNT_TYPE[F.method] || !F.accTouched) F.accountId = defaultAccount(F.method, F.purpose); }
      rerender();
    },
    fAcc: (el) => {
      F.accountId = el.dataset.v; F.accTouched = true;
      if (F.mode === 'transfer' && F.toAccountId === F.accountId) { const o = S.accounts.find((a) => a.type !== 'card' && a.id !== F.accountId); F.toAccountId = o ? o.id : ''; }
      if (F.mode === 'cardpay') { const t = acc(F.accountId).type; if (t === 'cash') F.method = 'Cash'; else if (F.method === 'Cash' || !['UPI', 'Bank Transfer', 'Cheque'].includes(F.method)) F.method = 'UPI'; }
      rerender();
    },
    fTo: (el) => { F.toAccountId = el.dataset.v; rerender(); },
    fDate: (el) => { F.date = el.dataset.v; rerender(); },
    payFull: () => { const cs = C.cardSummary(acc(F.toAccountId), S.txns); F.amount = String(cs.outstanding); rerender(); },
    fSave: (el) => submitForm(el.dataset.v),
    fDelete: async () => {
      const t = S.txns.find((x) => x.id === F.id); if (!t) return;
      const ok = await confirmBox({ title: 'Delete this entry?', msg: (t.kind === 'expense' ? catName(t.categoryId) + ' · ' : C.KIND_LABEL[t.kind] + ' · ') + inr(t.amount) + ' on ' + fmtDate(t.date) + '\n\nBalances and reports will update automatically. This cannot be undone.', ok: 'Delete', danger: true });
      if (!ok) return;
      await deleteTxn(t.id); F = null; toast('Deleted'); back('home');
    },
    // reports
    dayNav: (el) => { R.day = C.addDays(R.day, Number(el.dataset.v)); rerender(); },
    dayToday: () => { R.day = today(); rerender(); },
    monthNav: (el) => { R.month = shiftMonth(R.month, Number(el.dataset.v)); R.cmpMonth = shiftMonth(R.month, -1); rerender(); },
    yearNav: (el) => { R.year = String(Number(R.year) + Number(el.dataset.v)); rerender(); },
    mPurpose: (el) => { R.mPurpose = el.dataset.v; rerender(); },
    yPurpose: (el) => { R.yPurpose = el.dataset.v; rerender(); },
    mPreset: (el) => { R.mPreset = el.dataset.v; rerender(); },
    mPurposeM: (el) => { R.mPurposeM = el.dataset.v; rerender(); },
    qPurpose: (el) => { R.q.purpose = el.dataset.v; rerender(); },
    qClear: () => { R.q = { kind: 'expense', text: '', from: '', to: '', purpose: 'both', categoryId: '', method: '', accountId: '', min: '', max: '' }; rerender(); },
    openMonth: (el, ev) => { if (ev) ev.preventDefault(); R.month = el.dataset.v; R.cmpMonth = shiftMonth(R.month, -1); go('reports/monthly'); },
    tip: (el) => {
      const tip = document.getElementById(el.dataset.chart); if (!tip) return;
      const g = el.dataset.go || '';
      if (g.startsWith('day?')) tip.innerHTML = esc(el.dataset.tip) + ' · <a href="#reports/daily" data-act="openDay" data-v="' + esc(g.slice(4)) + '">open day ›</a>';
      else if (g.startsWith('month?')) tip.innerHTML = esc(el.dataset.tip) + ' · <a href="#reports/monthly" data-act="openMonth" data-v="' + esc(g.slice(6)) + '">open month ›</a>';
      else tip.textContent = el.dataset.tip;
    },
    openDay: (el) => { R.day = el.dataset.v; go('reports/daily'); },
    // accounts
    payCard: (el) => { F = newForm('cardpay'); F.preset = true; F.toAccountId = el.dataset.v; location.hash = 'add/cardpay'; },
    cardExpense: (el) => { F = newForm('expense'); F.preset = true; F.method = 'Credit Card'; F.accountId = el.dataset.v; F.accTouched = true; location.hash = 'add'; },
    accIncome: (el) => { F = newForm('income'); F.preset = true; F.accountId = el.dataset.v; location.hash = 'add/income'; },
    accTransfer: (el) => { F = newForm('transfer'); F.preset = true; F.accountId = el.dataset.v; if (F.toAccountId === F.accountId) { const o = S.accounts.find((a) => a.type !== 'card' && a.id !== F.accountId); F.toAccountId = o ? o.id : ''; } location.hash = 'add/transfer'; },
    accWithdraw: (el) => { F = newForm('withdraw'); F.preset = true; F.accountId = el.dataset.v; location.hash = 'add/withdraw'; },
    delAccount: async (el) => {
      const a = acc(el.dataset.v); const used = S.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
      if (used) return alertBox('Cannot delete yet', '“' + a.name + '” has ' + used + ' transaction(s). Delete them or edit them to use another account first, so your reports stay accurate.');
      if (S.accounts.filter((x) => x.type === a.type).length === 1 && a.type !== 'card') return alertBox('Cannot delete', 'You need at least one ' + (a.type === 'cash' ? 'cash wallet' : 'bank account') + '.');
      if (!(await confirmBox({ title: 'Delete “' + a.name + '”?', msg: 'This account has no transactions.', ok: 'Delete', danger: true }))) return;
      await DB.del('accounts', a.id); S.accounts = S.accounts.filter((x) => x.id !== a.id); toast('Account deleted'); go('accounts');
    },
    // categories
    addCat: async (el) => { await addCategory(el.dataset.v); rerender(); },
    renameCat: async (el) => {
      const c = cat(el.dataset.v); const name = ((await promptBox({ title: 'Rename category', label: 'Name', value: c.name })) || '').trim();
      if (!name || name === c.name) return;
      if (catsOf(c.purpose).some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) return toast('That name already exists');
      c.name = name.slice(0, 30); await DB.put('categories', c); toast('Renamed'); rerender();
    },
    delCat: async (el) => {
      const c = cat(el.dataset.v); const others = catsOf(c.purpose).find((x) => x.system) || catsOf(c.purpose).find((x) => x.id !== c.id);
      const used = S.txns.filter((t) => t.categoryId === c.id);
      if (!(await confirmBox({ title: 'Delete “' + c.name + '”?', msg: used.length ? used.length + ' transaction(s) will be moved to “' + others.name + '”. Amounts stay in your reports.' : 'This category has no transactions.', ok: 'Delete', danger: true }))) return;
      const ops = used.map((t) => ({ store: 'txns', put: Object.assign({}, t, { categoryId: others.id, updatedAt: Date.now() }) }));
      ops.push({ store: 'categories', del: c.id });
      await DB.batch(ops);
      for (const t of used) t.categoryId = others.id;
      S.categories = S.categories.filter((x) => x.id !== c.id); toast('Category deleted'); rerender();
    }
  };
  const IN = {
    fAmount: (el) => { F.amount = el.value; },
    fNotes: (el) => { F.notes = el.value; },
    qText: (el) => { R.q.text = el.value; updateSearchResults(); },
    qMin: (el) => { R.q.min = el.value; updateSearchResults(); },
    qMax: (el) => { R.q.max = el.value; updateSearchResults(); }
  };
  const CHANGE = {
    fDateInput: (el) => { if (el.value) { F.date = el.value; rerender(); } },
    dashFrom: (el) => { R.dashCustom = Object.assign({}, dashRange(), { from: el.value }); rerender(); },
    dashTo: (el) => { R.dashCustom = Object.assign({}, dashRange(), { to: el.value }); rerender(); },
    mFrom: (el) => { R.mCustom = Object.assign({}, methodsRange(), { from: el.value }); rerender(); },
    mTo: (el) => { R.mCustom = Object.assign({}, methodsRange(), { to: el.value }); rerender(); },
    dayNavPick: (el) => { if (el.value) { R.day = el.value; rerender(); } },
    monthNavPick: (el) => { if (el.value) { R.month = el.value; R.cmpMonth = shiftMonth(el.value, -1); rerender(); } },
    cmpMonth: (el) => { R.cmpMonth = el.value; rerender(); },
    qFrom: (el) => { R.q.from = el.value; rerender(); }, qTo: (el) => { R.q.to = el.value; rerender(); },
    qKind: (el) => { R.q.kind = el.value; rerender(); }, qCat: (el) => { R.q.categoryId = el.value; rerender(); },
    qMethod: (el) => { R.q.method = el.value; rerender(); }, qAcc: (el) => { R.q.accountId = el.value; rerender(); },
    
    restoreFile: (el) => { const f = el.files && el.files[0]; el.value = ''; if (f) restoreFrom(f); }
  };
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !ACT[el.dataset.act]) return;
    if (el.tagName === 'A') e.preventDefault();
    ACT[el.dataset.act](el, e);
  }
  function onInput(e) { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el); }
  function onChange(e) { const el = e.target.closest('[data-in]'); if (el && CHANGE[el.dataset.in]) CHANGE[el.dataset.in](el); }
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form="account"]'); if (!f) return;
    e.preventDefault(); saveAccountForm(f);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'f-amount') { e.preventDefault(); e.target.blur(); }
  });

  // expose for tests
  window.__EM = { S, R, go, C };
  init();
})();
