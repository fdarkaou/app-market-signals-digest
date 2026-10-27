// Pure helpers for the market signals digest. Works in Node and in the browser (index.html imports it).
// Input: one or more GET /v1/market/signals responses. Output: rows, highlights, Markdown, CSV, a chat summary.

export const MAX_IDS = 600; // documented per-request limit of unique store IDs

export function compact(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e3) return trim(n / 1e3) + 'k';
  return String(Math.round(n));
}
function trim(x) { return (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString(); }

// Accepts "1018368216", "id1018368216" or an apps.apple.com/.../id<digits> app link.
export function parseStoreId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/apps\.apple\.com\/.*\/id(\d{1,20})/i) || s.match(/^(?:id)?(\d{1,20})$/i);
  return m ? m[1] : null;
}

// Text list of ids/links (one per line or comma separated, # starts a comment) -> unique ids, in order.
export function parseIdList(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    for (const part of line.replace(/#.*/, '').split(/[\s,]+/)) {
      if (!part) continue;
      const id = parseStoreId(part);
      if (!id) throw new Error(`Not a numeric App Store id or app link: "${part}"`);
      out.push(id);
    }
  }
  return [...new Set(out)];
}

export function batches(ids, size = MAX_IDS) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// Several batch responses -> one response shape (country/weeks from the first, apps concatenated, deduped by storeId).
export function merge(resps) {
  const list = Array.isArray(resps) ? resps : [resps];
  const seen = new Map();
  for (const r of list) for (const a of r?.apps ?? []) if (a?.storeId && !seen.has(String(a.storeId))) seen.set(String(a.storeId), a);
  const first = list[0] ?? {};
  return { country: first.country, weeks: first.weeks ?? [], keywordsObservedAt: first.keywordsObservedAt ?? null, organicViewsCountedAt: first.organicViewsCountedAt ?? null, apps: [...seen.values()] };
}

// What a null paid signal means depends on paidCollection.freshness (docs: never | stale | fresh).
export function paidStatus(app) {
  const f = app?.paidCollection?.freshness ?? 'never';
  if (app?.paid) return f === 'stale' ? 'ads (stale collection)' : 'ads';
  if (f === 'fresh') return 'no ads found';
  if (f === 'stale') return 'no ads found (stale collection)';
  return 'not collected';
}

// Positive = moved up the chart (rank number went down). null when either day is missing.
export function rankChange(p) {
  if (!p || !Number.isFinite(p.rank) || !Number.isFinite(p.previousRank)) return null;
  return p.previousRank - p.rank;
}

const BARS = '▁▂▃▄▅▆▇█';
export function spark(series) {
  if (!Array.isArray(series) || !series.length) return '';
  const max = Math.max(...series);
  return series.map((v) => (max ? BARS[Math.min(7, Math.round((v / max) * 7))] : BARS[0])).join('');
}

export function toRows(resp) {
  return (resp?.apps ?? []).map((a) => {
    const p = a.placement, paid = a.paid, org = a.organic, kw = a.keywords;
    return {
      storeId: String(a.storeId), name: a.name ?? null,
      rank: p?.rank ?? null, previousRank: p?.previousRank ?? null, rankChange: rankChange(p),
      chart: p ? `${p.chartType} · ${p.categoryName ?? p.categoryId}` : null, chartDay: p?.day ?? null,
      paidStatus: paidStatus(a), paidCollectedAt: a.paidCollection?.lastCollectedAt ?? null,
      liveAds: paid?.liveAds ?? null, totalAds: paid?.totalAds ?? null, startedLast7Days: paid?.startedLast7Days ?? null,
      medianDaysLive: paid?.medianDaysLive ?? null, weeklyStarts: paid?.weeklyStarts ?? null,
      videoAds: paid?.formats?.video ?? null, topCallToAction: paid?.topCallToAction ?? null,
      organicPosts: org?.matchedPosts ?? null, organicViews: org?.views ?? null, bestPostViews: org?.bestPostViews ?? null,
      postsOverMillion: org?.postsOverMillion ?? null, newestPost: org?.newestPublishedAt?.slice(0, 10) ?? null,
      keywordsRanked: kw?.ranked ?? null, keywordsTop10: kw?.top10 ?? null,
      bestKeyword: kw?.best ? `${kw.best.query} #${kw.best.position}` : null,
    };
  });
}

const label = (r) => r.name ?? `id ${r.storeId}`;
const top = (rows, key, n, filter = (v) => v > 0) => rows.filter((r) => r[key] != null && filter(r[key])).sort((a, b) => b[key] - a[key]).slice(0, n);

// Short, factual call-outs. Each list is empty when no app has that signal.
export function highlights(resp, n = 3) {
  const rows = toRows(resp);
  return {
    climbers: top(rows, 'rankChange', n),
    fallers: top(rows.map((r) => ({ ...r, drop: r.rankChange == null ? null : -r.rankChange })), 'drop', n),
    adLaunchers: top(rows, 'startedLast7Days', n),
    organic: top(rows, 'bestPostViews', n),
    keywords: top(rows, 'keywordsTop10', n),
    notCollected: rows.filter((r) => r.paidStatus === 'not collected').length,
    noPlacement: rows.filter((r) => r.rank == null).length,
  };
}

export function highlightLines(resp) {
  const h = highlights(resp);
  const L = [];
  if (h.climbers.length) L.push('Chart climbers: ' + h.climbers.map((r) => `${label(r)} #${r.previousRank} → #${r.rank}`).join(', '));
  if (h.fallers.length) L.push('Chart fallers: ' + h.fallers.map((r) => `${label(r)} #${r.previousRank} → #${r.rank}`).join(', '));
  if (h.adLaunchers.length) L.push('Most new paid ads (last 7 days): ' + h.adLaunchers.map((r) => `${label(r)} ${r.startedLast7Days}`).join(', '));
  if (h.organic.length) L.push('Best organic post: ' + h.organic.map((r) => `${label(r)} ${compact(r.bestPostViews)} views`).join(', '));
  if (h.keywords.length) L.push('Most top-10 searches: ' + h.keywords.map((r) => `${label(r)} ${r.keywordsTop10}`).join(', '));
  const gaps = [];
  if (h.notCollected) gaps.push(`${h.notCollected} app(s) with paid ads never collected`);
  if (h.noPlacement) gaps.push(`${h.noPlacement} app(s) on no stored chart`);
  if (gaps.length) L.push('Unknown, not zero: ' + gaps.join('; '));
  return L;
}

const signed = (x) => (x == null ? '' : x > 0 ? `▲${x}` : x < 0 ? `▼${-x}` : '=');
const md = (s) => String(s ?? '').replace(/\|/g, '\\|');
const or = (v, d = 'unknown') => (v == null ? d : v);

export function toMarkdown(resp) {
  const rows = toRows(resp);
  const w = resp.weeks ?? [];
  const head = [`## Market signals: ${rows.length} apps, storefront ${String(resp.country ?? 'us').toUpperCase()}`, ''];
  const dates = [];
  if (rows.find((r) => r.chartDay)) dates.push(`chart day ${rows.find((r) => r.chartDay).chartDay}`);
  if (resp.keywordsObservedAt) dates.push(`keywords observed ${resp.keywordsObservedAt.slice(0, 10)}`);
  if (resp.organicViewsCountedAt) dates.push(`organic views counted ${resp.organicViewsCountedAt.slice(0, 10)}`);
  if (w.length) dates.push(`ad-start weeks ${w[0]} → ${w.at(-1)} (last week is partial)`);
  if (dates.length) head.push(`_${dates.join(' · ')}_`, '');
  for (const l of highlightLines(resp)) head.push(`- ${l}`);
  head.push('', '| App | Best chart rank | Chart | Paid ads | New ads 7d | Ad starts / week | Organic posts | Best post views | Top-10 searches | Best search |',
    '| --- | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    const paid = r.liveAds != null ? `${r.liveAds} live / ${r.totalAds}` : r.paidStatus;
    head.push(`| ${md(label(r))} | ${r.rank == null ? 'none' : `#${r.rank} ${signed(r.rankChange)}`} | ${md(or(r.chart, ''))} | ${paid} | ${or(r.startedLast7Days, '')} | ${spark(r.weeklyStarts)} | ${or(r.organicPosts)} | ${compact(r.bestPostViews)} | ${or(r.keywordsTop10)} | ${md(or(r.bestKeyword, ''))} |`);
  }
  return head.join('\n');
}

const CSV_COLS = ['storeId', 'name', 'rank', 'previousRank', 'rankChange', 'chart', 'chartDay', 'paidStatus', 'paidCollectedAt', 'liveAds', 'totalAds', 'startedLast7Days', 'medianDaysLive', 'videoAds', 'topCallToAction', 'organicPosts', 'organicViews', 'bestPostViews', 'postsOverMillion', 'newestPost', 'keywordsRanked', 'keywordsTop10', 'bestKeyword', 'weeklyStarts'];
const cell = (v) => { const s = Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(resp) {
  return [CSV_COLS.join(','), ...toRows(resp).map((r) => CSV_COLS.map((c) => cell(r[c])).join(','))].join('\n');
}

export function toChat(resp) {
  const lines = highlightLines(resp);
  return [`Market signals (${String(resp.country ?? 'us').toUpperCase()}, ${(resp.apps ?? []).length} apps)`, ...(lines.length ? lines.map((l) => `• ${l}`) : ['• No chart, ad, organic or keyword signal stored for these apps.'])].join('\n');
}
