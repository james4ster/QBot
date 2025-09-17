console.log("🚀 Bot process started, PID:", process.pid, "at", new Date().toISOString());

// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import path from "path";

import { buildRecapForRow } from './recapUtils/buildGameRecap.js';
import { generateRecapVideo, sendVideoToDiscord } from './recapUtils/generateRecapVideo.js';
import { abbrToFullName, teamEmojiMap } from './teamMappings.js';
import { summarizeChat } from './tldr.js'; // TL;DR logic

import sharp from 'sharp';
import fetch from 'node-fetch';

// === Phrase triggers ===
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));

// === Express Server ===
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.get('/', (req, res) => res.send('QBot is alive!'));
app.listen(PORT, () => console.log(`🌐 Express server listening on port ${PORT}`));

// === Discord Bot ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// === Google Sheets Setup ===
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// === Queue Setup For Managing Box Scores ===
const boxScoreQueue = [];
let processing = false;

async function processQueue(client) {
  if (processing || boxScoreQueue.length === 0) return;
  processing = true;

  while (boxScoreQueue.length > 0) {
    const { filePath, channelId } = boxScoreQueue.shift();
    try {
      console.log(`🎬 Processing box score: ${filePath}`);
      await generateRecapVideo(filePath, client);
      console.log(`✅ Done processing: ${filePath}`);
    } catch (err) {
      console.error(`❌ Failed to process ${filePath}:`, err);
    }
  }

  processing = false;
}

// === Message tracking for duplicates ===
const repliedMessages = new Set();
const processedMessages = new Set();

// === Discord Events ===
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});

// === Message Handling ===
client.on("messageCreate", async (message) => {
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);

  const isBotBoxScore = message.author.bot && message.channelId === process.env.BOX_SCORE_CHANNEL_ID;
  if (message.author.bot && !isBotBoxScore) return;

  console.log("📩 Message handler fired! PID:", process.pid, "Listener count:", client.listenerCount("messageCreate"));
  console.log(`📩 Message received: id=${message.id}, author=${message.author.username}, bot=${message.author.bot}`);

  // --- BOX SCORE CHANNEL HANDLER ---
  if (message.channelId === process.env.BOX_SCORE_CHANNEL_ID) {
    console.log('📊 Message is in BOX_SCORE_CHANNEL, checking for attachments...');

    for (const attachment of message.attachments.values()) {
      if (!attachment.name.endsWith(".png")) continue;

      try {
        const BOX_SCORE_DIR = path.join('recapUtils', 'boxScores');
        const PROCESSED_DIR = path.join('recapUtils', 'processedBoxScores');

        if (!fs.existsSync(BOX_SCORE_DIR)) fs.mkdirSync(BOX_SCORE_DIR, { recursive: true });
        if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

        const res = await fetch(attachment.url);
        const buffer = Buffer.from(await res.arrayBuffer());

        const normalizedPath = path.join(BOX_SCORE_DIR, `normalized-${attachment.name}`);
        await sharp(buffer).png({ force: true }).toFile(normalizedPath);

        console.log(`📥 Saved box score (normalized PNG): ${normalizedPath}`);

        boxScoreQueue.push({ filePath: normalizedPath, channelId: message.channelId });
        console.log(`📝 Added to queue: ${normalizedPath} (queue length: ${boxScoreQueue.length})`);

        // Process the queue
        await processQueue(client);
      } catch (err) {
        console.error(`❌ Failed to process ${attachment.name}:`, err);
      }
    }

    // Stop box score messages from triggering phrase handler
    return;
  }

  // --- PHRASE HANDLER (humans only, any channel) ---
  if (!message.content || typeof message.content !== 'string' || !message.content.trim()) return;

  const normalizedContent = message.content.trim().toLowerCase();
  console.log(`💬 Message content (normalized): "${normalizedContent}"`);

  let matched = false;

  for (const phrase of phrases) {
    if (!phrase?.triggers || !phrase?.response) continue;

    const triggers = Array.isArray(phrase.triggers) ? phrase.triggers : [phrase.triggers];

    for (const trigger of triggers) {
      if (!trigger) continue;

      const regex = new RegExp(`\\b${escapeRegex(trigger.toLowerCase())}\\b`, 'i');
      if (regex.test(normalizedContent)) {
        if (repliedMessages.has(message.id)) {
          console.log(`⏩ Already replied to message ${message.id}`);
          matched = true;
          break;
        }

        try {
          await message.reply(phrase.response);
          repliedMessages.add(message.id);
          console.log(`💬 Replied to message ${message.id} for trigger "${trigger}"`);
          matched = true;
          break;
        } catch (err) {
          console.error(`❌ Failed to reply to message ${message.id}:`, err);
        }
      }
    }

    if (matched) break;
  }

  if (!matched) console.log('❌ No phrase matched this message.');
});

// === Helper to escape regex - needed for phrase matching ===
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// === Slash Commands ===
const commands = [
  {
    name: 'matchup',
    description: 'Compare two team stats',
    options: [
      { name: 'team1', description: 'First team abbreviation (e.g., SUP, BNX)', type: 3, required: true },
      { name: 'team2', description: 'Second team abbreviation (e.g., THS, NCJ)', type: 3, required: true },
    ],
  },
];

// === TLDR Command ===
const tldrCommand = [
  new SlashCommandBuilder()
    .setName('tldr')
    .setDescription('Ask Ticklebot to TLDR the last X hours of chatter')
    .addIntegerOption(option =>
      option.setName('hours')
        .setDescription('Number of hours')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⚡ Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [...commands, ...tldrCommand] }
    );
    console.log('✅ Commands registered!');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();

// === Safe Reply Helper ===
async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply(content);
    }
  } catch (err) {
    console.error("❌ Failed to safely reply:", err);
  }
}

// === Interaction Handling ===
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "tldr") {
    try {
      // Defer immediately to avoid "Unknown interaction"
      await interaction.deferReply();

      const hours = interaction.options.getInteger("hours") || 2;
      const cutoff = Date.now() - hours * 60 * 60 * 1000;

      let chatPayload = [];

      for (const [channelId, channel] of interaction.guild.channels.cache) {
        if (!channel.isTextBased() || !channel.viewable) continue;

        // Also check ReadMessageHistory permission
        const perms = channel.permissionsFor(interaction.guild.members.me);
        if (!perms || !perms.has("ReadMessageHistory")) continue;

        try {
          const messages = await channel.messages.fetch({ limit: 50 });
          const humanMessages = Array.from(messages.values())
            .filter(m => m.author && !m.author.bot && m.createdTimestamp >= cutoff)
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

          chatPayload.push(...humanMessages);
        } catch (err) {
          console.error(`❌ Failed to fetch messages from channel ${channelId}:`, err);
        }
      }

      console.log(`🛠 Fetched ${chatPayload.length} human messages across accessible channels`);

      if (!chatPayload.length) {
        await interaction.editReply(`⚠️ No human messages found in the last ${hours} hours.`);
        return;
      }

      // Prepare payload that matches tldr.js expectations
      const payloadForCohere = chatPayload.map(msg => ({
        author: { username: msg.author.username || "Unknown" },
        content: msg.content || ""
      }));

      const summary = await summarizeChat(payloadForCohere, hours);

      console.log("📝 About to send summary:", summary);

      let finalSummary = typeof summary === "string" ? summary : JSON.stringify(summary);

      // Handle Discord’s 2000 char limit
      if (finalSummary.length > 2000) {
        finalSummary = finalSummary.slice(0, 1990) + "… (truncated)";
      }

      await interaction.editReply(finalSummary);
      console.log("✅ Reply posted to Discord");

    } catch (err) {
      console.error("❌ Error in /tldr handler:", err);
      try {
        if (interaction.deferred) {
          await interaction.editReply("⚠️ Failed to generate TL;DR.");
        } else {
          await interaction.reply("⚠️ Failed to generate TL;DR.");
        }
      } catch (e2) {
        console.error("❌ Fallback reply also failed:", e2);
      }
    }
  }

  // --- /matchup command ---
  else if (interaction.commandName === "matchup") {
    try {
      console.log("✅ /matchup command triggered");
      await interaction.deferReply();

      const team1Abbr = interaction.options.getString("team1")?.toUpperCase();
      const team2Abbr = interaction.options.getString("team2")?.toUpperCase();

      if (!team1Abbr || !team2Abbr) {
        await interaction.editReply("❌ Both teams must be provided.");
        return;
      }

      const stats = await getTeamStats();
      const team1Stats = stats[team1Abbr];
      const team2Stats = stats[team2Abbr];

      if (!team1Stats || !team2Stats) {
        await interaction.editReply("❌ Stats not found for one or both teams.");
        return;
      }

      const statsToCompare = [
        "GP","W","L","T","OTL","PTS","W%","GF","GF/G","GA","GA/G",
        "SH","S/G","SH%","SHA","SA/G","SD","FOW","FO","FO%",
        "H","H/G","HA","HD","BAG","BA","BA%","1xG","1xA","1x%",
        "PS","PSA","PS%"
      ];

      const pad = (str, len = 7) => str.toString().padEnd(len, " ");

      let message = "";
      message += `${pad("", 10)}${pad(team1Abbr, 8)}${pad(team2Abbr, 10)}\n`;
      message += "----------------------------\n";

      statsToCompare.forEach((stat) => {
        const t1 = team1Stats[stat] ?? "-";
        const t2 = team2Stats[stat] ?? "-";
        message += `${pad(stat)} | ${pad(t1)} | ${pad(t2)}\n`;
      });

      // Head-to-Head
      message += `\nHead-to-Head:\n`;
      const seasonResults = await getHeadToHeadResults(team1Abbr, team2Abbr);

      if (!seasonResults.length) {
        message += "No games played between these teams this season.\n";
      } else {
        const record = {
          [team1Abbr]: { W: 0, L: 0, T: 0, OTL: 0 },
          [team2Abbr]: { W: 0, L: 0, T: 0, OTL: 0 },
        };

        seasonResults.forEach((game) => {
          const { Home, Away, HomeScore, AwayScore, OT } = game;
          const hs = parseInt(HomeScore, 10);
          const as = parseInt(AwayScore, 10);
          if (isNaN(hs) || isNaN(as)) return;

          if (hs === as) {
            record[Home].T++;
            record[Away].T++;
          } else if (hs > as) {
            if (OT && OT.toLowerCase().includes("ot")) record[Away].OTL++;
            else record[Away].L++;
            record[Home].W++;
          } else {
            if (OT && OT.toLowerCase().includes("ot")) record[Home].OTL++;
            else record[Home].L++;
            record[Away].W++;
          }
        });

        message += `${team1Abbr}: ${record[team1Abbr].W}-${record[team1Abbr].L}-${record[team1Abbr].T}-${record[team1Abbr].OTL}\n`;
        message += `${team2Abbr}: ${record[team2Abbr].W}-${record[team2Abbr].L}-${record[team2Abbr].T}-${record[team2Abbr].OTL}\n`;

        message += `\nGame Scores:\n`;
        seasonResults.forEach((game) => {
          message += `${game.Away} ${game.AwayScore}-${game.HomeScore} ${game.Home}\n`;
        });
      }

      await interaction.editReply({ content: `\`\`\`\n${message}\`\`\`` });
    } catch (err) {
      console.error("❌ Error in /matchup handler:", err);
      await safeReply(interaction, "❌ Error generating matchup stats.");
    }
  }
});

// === Get Head-to-Head Results ===
async function getHeadToHeadResults(team1, team2) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawSchedule!A2:Z1000',
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return [];

  const results = [];

  rows.forEach(row => {
    const Home = row[8];       // column I
    const HomeScore = row[10]; // column K
    const Away = row[11];      // column L
    const AwayScore = row[13]; // column N
    const OT = row[14];        // column O

    if (!Home || !Away || HomeScore === undefined || AwayScore === undefined) return;

    if ((Home === team1 && Away === team2) || (Home === team2 && Away === team1)) {
      results.push({ Home, Away, HomeScore, AwayScore, OT });
    }
  });

  return results;
}

// === Get Team Stats ===
async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30',
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return {};

  const statColumnMap = {
    'GP':4,'W':5,'L':6,'T':7,'OTL':8,'PTS':9,'W%':10,'GF':11,'GF/G':12,'GA':13,'GA/G':14,
    'SH':15,'S/G':16,'SH%':17,'SHA':18,'SA/G':19,'SD':20,'FOW':28,'FO':29,'FO%':30,'H':31,
    'H/G':32,'HA':33,'HD':34,'BAG':36,'BA':37,'BA%':38,'1xG':39,'1xA':40,'1x%':41,'PS':42,'PSA':43,
    'PS%':44
  };

  const headers = Object.keys(statColumnMap);
  const data = {};

  rows.forEach(row => {
    if (!row[0]) return;
    const abbr = row[0].trim();
    data[abbr] = {};
    headers.forEach(header => {
      const colIndex = statColumnMap[header];
      const val = row[colIndex];
      const numVal = parseFloat(val);
      data[abbr][header] = isNaN(numVal) ? val ?? '-' : numVal;
    });
  });

  return data;
}

// === Discord Login ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
