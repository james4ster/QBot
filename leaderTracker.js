/*===
* This script checks for changes in the leaders of the main categories.  Stat must be > 0.  If there's a new leader, it posts the top 5 in the category to Discord (TickleNews Channel).

* Stats tracked:
   const skaterMap = { "G":13, "A":14, "PTS":15, "SOG":16, "CHK":17 };
   const goalieMap  = { "W":22, "SO":16, "SV%":20, "GAA":21 };

* Set to work for both regular season and playoffs.

* Uses Supabase to cache the current leaders and top 5 for each category.  This process should be scheduled to run hourly from a GAS that UM set up.
===*/

import { google } from 'googleapis';
import fetch from 'node-fetch';
import { teamEmojiMap } from './teamMappings.js';
import { supabase } from './supabaseClient.js';

// Environment variables
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_TICKLE_NEWS;

// Stat categories
const skaterCategories = ["G","A","PTS","SOG","CHK"];
const goalieCategories = ["W","SO","SV%","GAA"];

// Discord webhook
async function postToDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.error("❌ DISCORD_WEBHOOK_URL not set");
    return;
  }
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

// Load cache from Supabase
async function loadCache() {
  const { data, error } = await supabase
    .from('leaders_cache')
    .select('*');

  if (error) {
    console.error("loadCache error:", error.message);
    throw error;
  }

  const cache = {};
  (data || []).forEach(r => {
    let top5 = [];
    if (r.top5) {
      if (typeof r.top5 === 'string') {
        try {
          top5 = JSON.parse(r.top5);
        } catch {
          console.warn("Failed to parse top5 for", r.category, "using empty array");
          top5 = [];
        }
      } else if (typeof r.top5 === 'object') {
        top5 = r.top5;
      }
    }

    cache[`${r.season_type}_${r.category}`] = {
      leader: r.leader,
      top5
    };
  });
  return cache;
}

// Save/update cache in Supabase
async function saveCache(cache) {
  for (const key in cache) {
    const [seasonType, category] = key.split('_');
    const { leader, top5 } = cache[key];

    const { error } = await supabase
      .from('leaders_cache')
      .upsert(
        {
          season_type: seasonType,
          category,
          leader,
          top5: JSON.stringify(top5)
        },
        { onConflict: ['season_type', 'category'] }
      );

    if (error) {
      console.error("saveCache error:", error.message);
    }
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
      let idx = getColumnIndex(cat, type);

      // Special handling for Wins
      if (cat === "W" && type === "goalie") {
        idx = 22;
      }

      const sorted = players
        .map(r => ({
          Player: r[10],
          Team: r[8],
          Value: Number(r[idx]) || 0
        }))
        .sort((a, b) => cat === "GAA" ? a.Value - b.Value : b.Value - a.Value)
        .slice(0, 5);

      if (!sorted.length) return;

      const leaderKey = `${seasonType}_${cat}`;
      const currentLeader = sorted[0].Player;
      const currentValue = sorted[0].Value;
      const prevLeader = cache[leaderKey]?.leader;
      const prevValue = cache[leaderKey]?.top5?.[0]?.Value;

      // Always update in-memory cache
      cache[leaderKey] = { leader: currentLeader, top5: sorted };

      // Only push Discord message if the leader changed
      if (prevLeader !== currentLeader && currentValue > 0) {
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

  // Always save cache, even if no Discord posts
  await saveCache(cache);

  if (results.length) {
    if (options.dryRun) {
      console.log("Dry run - would post:\n", results.join("\n\n"));
    } else {
      await postToDiscord(results.join("\n\n"));
    }
  }
}

// Run immediately if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkLeaderChanges("Season", { dryRun: false })
    .then(() => console.log("Leader check completed."))
    .catch(err => console.error("Error checking leaders:", err));
}
