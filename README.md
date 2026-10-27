# app-market-signals-digest

One short digest for a list of iOS apps: where each app sits on the App Store charts and how it moved since the day before, how many paid ads it is running and launched in the last 7 days, how its organic posts did, and how many searches it ranks top 10 for. Give it up to 600 App Store ids or links per call; it prints Markdown, CSV or JSON and can post the highlights to Slack or Discord.

Use it as a Monday check on your rivals, or to annotate every app on a chart page in one call.

Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/app-market-signals-digest/) that renders a pasted response and never sends it anywhere.

```
## Market signals: 3 apps, storefront US

_chart day 2026-10-21 · keywords observed 2026-10-21 · organic views counted 2026-10-18 · ad-start weeks 2026-08-31 → 2026-10-19 (last week is partial)_

- Chart climbers: Example Calorie Tracker #19 → #8
- Chart fallers: Example Meal Prep #24 → #31
- Most new paid ads (last 7 days): Example Calorie Tracker 6
- Best organic post: Example Calorie Tracker 2.9M views, Example Meal Prep 61k views
- Most top-10 searches: Example Calorie Tracker 11, Example Meal Prep 3
- Unknown, not zero: 1 app(s) with paid ads never collected; 1 app(s) on no stored chart

| App | Best chart rank | Chart | Paid ads | New ads 7d | Ad starts / week | Organic posts | Best post views | Top-10 searches | Best search |
| --- | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| Example Calorie Tracker | #8 ▲11 | free · Health & Fitness | 27 live / 42 | 6 | ▂▁▅▄▇▂█▄ | 14 | 2.9M | 11 | calorie counter #1 |
| Example Meal Prep | #31 ▼7 | grossing · Health & Fitness | no ads found |  |  | 3 | 61k | 3 | meal planner #3 |
| Example Water Reminder | none |  | not collected |  |  | unknown |  | unknown |  |
```

(Example data from `examples/signals.json`, not real apps.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that keeps dated evidence for each app. The tool calls [`GET /v1/market/signals`](https://peekpanda.com/docs/market-signals) with `country` and `storeIds`, which returns chart, paid-ad, organic and keyword signals for up to 600 apps in one batch. Over MCP the same read is the `get_market` tool with action `signals`. It only reads stored evidence and never starts a collection.

You need a PeekPanda account and an API key. Each batch of up to 600 apps is one call against your plan's daily API and MCP allowance (30 calls a day on Peek, 1,000 on Panda, reset at 00:00 UTC, per PeekPanda's plans page). Reads also share a budget of 60 requests per minute; on a `429 rate_limited` the tool waits for `Retry-After` once and sends the same request again. It stops on `daily_call_limit`.

## Use it

```bash
git clone https://github.com/fdarkaou/app-market-signals-digest && cd app-market-signals-digest
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js 1000000001 1000000002                          # a few apps, US storefront
node cli.js https://apps.apple.com/us/app/example/id1000000001 --country gb
node cli.js --list examples/apps.txt                       # one id or link per line, # comments
node cli.js --list examples/apps.txt --format csv > signals.csv
node cli.js --list examples/apps.txt --webhook "$SLACK_WEBHOOK_URL"   # Discord webhook URLs work too
```

The store id is Apple's numeric app id, the number after `id` in an App Store link. Lists longer than 600 apps are split into batches of 600.

Try it without an account on the bundled example:

```bash
node cli.js --file examples/signals.json
npm test
```

Options: `--list`, `--country`, `--format md|csv|json`, `--webhook <url>`, `--file <path>`, `--tenancy`, `--api`. Run `node cli.js --help` for details.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`), ask it to call `get_market` with:

```json
{ "request": { "action": "signals", "query": { "country": "us", "storeIds": "1000000001,1000000002" } } }
```

Then paste the result into the browser version, or save it and run `node cli.js --file`.

## How to read it

- **Best chart rank** is the app's best rank across every stored App Store chart of the storefront on the latest chart day. ▲/▼ is the move since the day before. "none" means the app is on no stored chart that day.
- **Paid ads** are Meta and TikTok ad-library observations. "no ads found" means a recent collection found none; "not collected" means no collection has finished, so it says nothing about the app's ads. "stale collection" means the last one is more than two days old.
- **Ad starts / week** is a sparkline of the 8 Monday-start weeks in `weeks`, oldest first. The last week is still running.
- **Organic** posts are matched by product name, not account ownership; views are as last counted (see the date line).
- **Searches** are observed App Store search result positions, not search volume.
- "unknown" means that stream was never collected for the app. It is unknown, not zero.

## Weekly post in GitHub Actions

`.github/workflows/weekly-signals.yml` is an example job that runs every Monday, writes the digest to the run summary, posts the highlights to a webhook and uploads a CSV. Add `PEEKPANDA_TOKEN` and `SIGNALS_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_SIGNALS` to `true`, and put your own ids in `examples/apps.txt`.

## License

MIT
