import pkg from 'pg';
const { Pool } = pkg;
import { google } from 'googleapis';
import fetch from 'node-fetch';
import { teamEmojiMap } from './teamMappings.js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_TICKLE_NEWS;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL
});

// Stat categories
const skaterCategories = ["G","A","PTS","SOG","CHK"];
const goalieCategories = ["W","SO","SV%","GAA"];

// Discord webhook
async function postToDiscord(content) {
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

// Google Sheets auth
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Get RawStats
async function getRawStats(seasonType = "Season") {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawStats!A4:Z400',
  });
  const rows = res.data.values || [];
  return rows.filter(r => r[3] === seasonType && r[11]); // Pos must exist
}

// Map category to column
function getColumnIndex(cat, type) {
  const skaterMap = { "G":13, "A":14, "PTS":15, "SOG":16, "CHK":17 };
  const goalieMap  = { "W":22, "SO":16, "SV%":20, "GAA":21 };
  return type === "skater" ? skaterMap[cat] : goalieMap[cat];
}

// Get cache from Postgres
async function loadCache(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await pool.query('SELECT * FROM leaders_cache');
      const cache = {};
      res.rows.forEach(r => {
        cache[`${r.season_type}_${r.category}`] = {
          leader: r.leader,
          top5: r.top5
        };
      });
      return cache;
    } catch (err) {
      console.warn(`loadCache attempt ${i+1} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000)); // wait 1 second before retry
    }
  }
}

// Save/update cache in Postgres
async function saveCache(cache) {
  for (const key in cache) {
    const [seasonType, category] = key.split('_');
    const { leader, top5 } = cache[key];

    await pool.query(`
      INSERT INTO leaders_cache (season_type, category, leader, top5)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (season_type, category)
      DO UPDATE SET leader = EXCLUDED.leader, top5 = EXCLUDED.top5
    `, [seasonType, category, leader, JSON.stringify(top5)]);
  }
}

// Main function
export async function checkLeaderChanges(seasonType = "Season", options = {}) {
  const cache = await loadCache();
  const rows = await getRawStats(seasonType);

  const skaters = rows.filter(r => ["F","D"].includes(r[11]));
  const goalies = rows.filter(r => r[11] === "G");

  const results = [];

  function processCategory(players, categories, type) {
    categories.forEach(cat => {
      const idx = getColumnIndex(cat, type);
      const sorted = players
        .map(r => ({ Player: r[10], Team: r[8], Value: parseFloat(r[idx] || 0) }))
        .sort((a,b) => cat === "GAA" ? a.Value - b.Value : b.Value - a.Value)
        .slice(0,5);

      if (!sorted.length) return;

      const leaderKey = `${seasonType}_${cat}`;
      const currentLeader = sorted[0].Player;
      const currentValue = sorted[0].Value;
      const prevLeader = cache[leaderKey]?.leader;
      const prevValue = cache[leaderKey]?.top5?.[0]?.Value;

      if (prevLeader !== currentLeader && currentValue !== prevValue && currentValue > 0) {
        cache[leaderKey] = { leader: currentLeader, top5: sorted };

        const title = seasonType === "Playoffs" 
          ? `🔥 New Playoff ${cat} Leader` 
          : `🔥 New ${cat} Leader`;

        const top5Text = sorted.map((p,i) => {
          const emoji = teamEmojiMap[p.Team] || "";
          const display = `${p.Player} (${p.Value})`;
          return i === 0 ? `**${emoji} ${display}**` : `${emoji} ${display}`;
        }).join("\n");

        results.push(`${title}\n═════════════\n${top5Text}`);
      }
    });
  }

  processCategory(skaters, skaterCategories, "skater");
  processCategory(goalies, goalieCategories, "goalie");

  if (results.length) {
    if (options.dryRun) {
      console.log("Dry run - would post:\n", results.join("\n\n"));
    } else {
      await postToDiscord(results.join("\n\n"));
    }
    await saveCache(cache);
  }
}
