import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStoreId, parseIdList, batches, merge, paidStatus, rankChange, spark, toRows, highlights, toMarkdown, toCsv, toChat } from '../signals.js';

const resp = JSON.parse(readFileSync(new URL('../examples/signals.json', import.meta.url)));

test('store ids from numbers, id prefixes and App Store links', () => {
  assert.equal(parseStoreId('1000000001'), '1000000001');
  assert.equal(parseStoreId('id1000000001'), '1000000001');
  assert.equal(parseStoreId('https://apps.apple.com/us/app/example/id1000000001?l=en'), '1000000001');
  assert.equal(parseStoreId('Example'), null);
  assert.deepEqual(parseIdList('1, 2\n# rivals\nid3 # mine\n2'), ['1', '2', '3']);
  assert.throws(() => parseIdList('1\nnope'), /nope/);
});

test('batches of at most 600 and merge dedupes by storeId', () => {
  const ids = Array.from({ length: 1201 }, (_, i) => String(i + 1));
  assert.deepEqual(batches(ids).map((b) => b.length), [600, 600, 1]);
  const m = merge([resp, { apps: [resp.apps[0]] }]);
  assert.equal(m.apps.length, 3);
  assert.equal(m.country, 'us');
});

test('a null paid signal is read through paidCollection freshness', () => {
  assert.equal(paidStatus(resp.apps[0]), 'ads');
  assert.equal(paidStatus(resp.apps[1]), 'no ads found');
  assert.equal(paidStatus(resp.apps[2]), 'not collected');
  assert.equal(paidStatus({ paid: null, paidCollection: { freshness: 'stale' } }), 'no ads found (stale collection)');
});

test('rank change is positive when the app climbs', () => {
  assert.equal(rankChange({ rank: 8, previousRank: 19 }), 11);
  assert.equal(rankChange({ rank: 31, previousRank: 24 }), -7);
  assert.equal(rankChange({ rank: 3, previousRank: null }), null);
  assert.equal(rankChange(null), null);
});

test('rows, highlights and outputs', () => {
  const [a, b, c] = toRows(resp);
  assert.equal(a.startedLast7Days, 6);
  assert.equal(b.liveAds, null);
  assert.equal(c.rank, null);
  const h = highlights(resp);
  assert.equal(h.climbers[0].name, 'Example Calorie Tracker');
  assert.equal(h.fallers[0].name, 'Example Meal Prep');
  assert.equal(h.notCollected, 1);
  assert.equal(spark([0, 0]), '▁▁');
  assert.equal(spark([0, 4, 8]).length, 3);
  const md = toMarkdown(resp);
  assert.match(md, /#8 ▲11/);
  assert.match(md, /not collected/);
  assert.match(md, /last week is partial/);
  const csv = toCsv(resp).split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^storeId,name,rank/);
  assert.match(toChat(resp), /Chart climbers: Example Calorie Tracker #19 → #8/);
});
