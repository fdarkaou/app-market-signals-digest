#!/usr/bin/env node
// Market signals digest on the PeekPanda API. Node 18+, no dependencies.
// GET /v1/market/signals: chart, paid-ad, organic and keyword signals for up to 600 iOS apps per call.
import { readFile } from 'node:fs/promises';
import { parseIdList, batches, merge, toMarkdown, toCsv, toChat } from './signals.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js <storeId|apps.apple.com app link> [more ...] [options]
  PEEKPANDA_TOKEN=... node cli.js --list apps.txt [options]
  node cli.js --file signals.json [options]

Up to 600 unique apps per API call; longer lists are split into batches of 600 (one call each).

Options:
  --list <path>          text file of store ids or App Store links (one per line, # comments)
  --country <cc>         Apple storefront, two lowercase letters (default us)
  --format md|csv|json   output format (default md)
  --webhook <url>        also POST the highlights to a Slack or Discord incoming webhook
  --tenancy <value>      x-genviral-tenancy header (default personal)
  --api <url>            API base (default https://api.peekpanda.com)
  --file <path>          read a saved GET /v1/market/signals response instead of calling the API`;

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', country: 'us', ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o.ids.push(a);
  }
  return o;
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function fetchBatch(ids, o, retried = false) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const url = new URL('/v1/market/signals', o.api);
  url.searchParams.set('country', o.country);
  url.searchParams.set('storeIds', ids.join(','));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? '';
    const retry = Number(res.headers.get('retry-after'));
    // Docs: on 429 rate_limited wait Retry-After then send the same request again. daily_call_limit waits until 00:00 UTC, so stop.
    if (res.status === 429 && code !== 'daily_call_limit' && retry > 0 && retry <= 120 && !retried) { await sleep(retry); return fetchBatch(ids, o, true); }
    throw new Error(`PeekPanda API ${res.status} ${code}: ${body?.error?.message ?? res.statusText}${retry ? ` (retry after ${retry}s)` : ''}`);
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help || (!o.ids.length && !o.file && !o.list)) { console.log(HELP); return; }
  if (!/^[a-z]{2}$/.test(o.country)) throw new Error('--country must be two lowercase letters, like us or gb.');
  let resp;
  if (o.file) resp = merge(JSON.parse(await readFile(o.file, 'utf8')));
  else {
    const ids = parseIdList([...o.ids, o.list ? await readFile(o.list, 'utf8') : ''].join('\n'));
    if (!ids.length) throw new Error('No store ids given.');
    const out = [];
    for (const b of batches(ids)) out.push(await fetchBatch(b, o));
    resp = merge(out);
  }

  if (o.format === 'json') console.log(JSON.stringify(resp, null, 2));
  else if (o.format === 'csv') console.log(toCsv(resp));
  else console.log(toMarkdown(resp) + '\n\nStored PeekPanda observations, not live data. Keyword positions are search result positions, not search volume. "unknown" or "not collected" means no evidence, not zero.');

  if (o.webhook) {
    const text = toChat(resp);
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
