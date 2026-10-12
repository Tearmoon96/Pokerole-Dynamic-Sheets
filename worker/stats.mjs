/* How much the rolling table is used, day by day, from the relay's counter
   (Workers Analytics Engine, dataset `pokerole_table`; see `count` in
   src/index.ts).

     npm run stats            the last 30 days
     npm run stats -- 90      the last 90 (the data is kept about three months)

   Needs an API token with Account > Account Analytics > Read, either in
   CF_STATS_TOKEN or in `worker/.stats-token` (gitignored). The account is the
   one the token reaches; CF_ACCOUNT_ID picks one if it reaches several.

   The columns:
     tables   sessions with two or more people at once (a GM alone is "solo")
     people   the sum of each table's peak: a head count, not a count of
              connections, so reloads and dropped Wi-Fi do not add to it
     hours    time those tables were open, first socket to last
     joins    every socket opened, reloads included */

import { existsSync, readFileSync } from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';
const days = Math.max(1, Math.min(92, Number(process.argv[2]) || 30));

const tokenFile = new URL('./.stats-token', import.meta.url);
const token = process.env.CF_STATS_TOKEN
    || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) {
    console.error('No token. Put one with "Account Analytics: Read" in worker/.stats-token or CF_STATS_TOKEN.');
    process.exit(1);
}
const auth = { Authorization: 'Bearer ' + token };

async function accountId() {
    if (process.env.CF_ACCOUNT_ID) return process.env.CF_ACCOUNT_ID;
    const r = await fetch(API + '/accounts', { headers: auth });
    const j = await r.json();
    if (!j.success || !j.result?.length) {
        console.error('The token reaches no account:', JSON.stringify(j.errors || j));
        process.exit(1);
    }
    if (j.result.length > 1) console.error('Several accounts; using ' + j.result[0].name + ' (set CF_ACCOUNT_ID for another).');
    return j.result[0].id;
}

async function sql(account, query) {
    const r = await fetch(API + '/accounts/' + account + '/analytics_engine/sql', {
        method: 'POST', headers: auth, body: query,
    });
    const body = await r.text();
    if (!r.ok) {
        console.error('Query refused (' + r.status + '): ' + body);
        process.exit(1);
    }
    return JSON.parse(body).data;
}

/* Every count is weighted by _sample_interval: Analytics Engine may keep one
   point in N under heavy load, and says so per row. */
const TABLE = "blob1 = 'session' AND double1 >= 2";
const rows = await sql(await accountId(), `
    SELECT
        toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
        sumIf(_sample_interval, ${TABLE}) AS tables,
        sumIf(_sample_interval * double1, ${TABLE}) AS people,
        sumIf(_sample_interval * double2, ${TABLE}) AS minutes,
        sumIf(_sample_interval, blob1 = 'session' AND double1 < 2) AS solo,
        sumIf(_sample_interval, blob1 = 'join') AS joins
    FROM pokerole_table
    WHERE timestamp > now() - INTERVAL '${days}' DAY
    GROUP BY day
    ORDER BY day
    FORMAT JSON`);

const n = (v) => Math.round(Number(v) || 0);
const hours = (m) => (n(m) / 60).toFixed(1);
const cols = ['day', 'tables', 'people', 'hours', 'solo', 'joins'];
const line = (c) => c.map((v, i) => String(v).padStart(i ? 8 : 10)).join('');

console.log('\nRolling table, the last ' + days + ' days\n');
console.log(line(cols));
const total = { tables: 0, people: 0, minutes: 0, solo: 0, joins: 0 };
for (const r of rows) {
    for (const k of Object.keys(total)) total[k] += n(r[k]);
    console.log(line([String(r.day).slice(0, 10), n(r.tables), n(r.people), hours(r.minutes), n(r.solo), n(r.joins)]));
}
if (!rows.length) console.log('  (nothing yet: a table is counted once everyone has left it)');
console.log('-'.repeat(50));
console.log(line(['total', total.tables, total.people, hours(total.minutes), total.solo, total.joins]));
if (total.tables) {
    console.log('\n' + (total.people / total.tables).toFixed(1) + ' people a table, '
        + Math.round(total.minutes / total.tables) + ' minutes a table on average.');
}
