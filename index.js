// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import { buildRecapForRow } from './recapUtils/buildGameRecap.js';

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

// === Phrase message tracking ===
const repliedMessages = new Set();

// === Discord Events ===
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});

// === Message Handling ===
client.on('messageCreate', async message => {
  if (message.author.bot || message.webhookId) return;
  if (repliedMessages.has(message.id)) return;

  const msgLower = message.content.toLowerCase();

  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 60 * 1000);
    return;
  }

  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(t => t.toLowerCase());
    if (triggers.some(trigger => new RegExp(`\\b${trigger}\\b`, 'i').test(msgLower))) {
      repliedMessages.add(message.id);
      await message.channel.send(phraseObj.response);
      setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
      break;
    }
  }
});

// === Slash Commands ===
const commands = [
  {
    name: 'testrecap',
    description: 'Generate a test recap for a single game',
    options: [{ name: 'gamerow', description: 'The row number of the game in your sheet', type: 4, required: false }],
  },
  {
    name: 'matchup',
    description: 'Compare two team stats',
    options: [
      { name: 'team1', description: 'First team abbreviation (e.g., SUP, BNX)', type: 3, required: true },
      { name: 'team2', description: 'Second team abbreviation (e.g., THS, NCJ)', type: 3, required: true },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('⚡ Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registered!');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();

// === Interaction Handling ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ==== /testrecap ====
  if (interaction.commandName === 'testrecap') {
    try {
      await interaction.deferReply();
      const recapText = await buildRecapForRow(gameData);
      await interaction.editReply({
        content: recapText,
        files: ['./recapUtils/output/test_game.png'],
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error generating recap");
    }
  }

  // ==== /matchup ====
  if (interaction.commandName === 'matchup') {
    try {
      await interaction.deferReply();

      const team1Abbr = interaction.options.getString('team1').toUpperCase();
      const team2Abbr = interaction.options.getString('team2').toUpperCase();

      const stats = await getTeamStats();
      const team1Stats = stats[team1Abbr];
      const team2Stats = stats[team2Abbr];

      if (!team1Stats || !team2Stats) {
        return interaction.editReply("❌ Stats not found for one or both teams.");
      }

      // Fetch emojis from Google Sheets BSB Settings
      const emojiMap = await getDiscordEmojiMap();
      const team1Emoji = emojiMap[team1Abbr] || team1Abbr;
      const team2Emoji = emojiMap[team2Abbr] || team2Abbr;

      // Stats to compare
      const statsToCompare = [
        'GP','W','L','T','OTL','PTS','W%','GF','GF/G','GA','GA/G',
        'SH','S/G','SH%','SHA','SA/G','SD','FOW','FO','FO%',
        'H','H/G','HA','HD','BAG','BA','BA%','1xG','1xA','1x%',
        'PS','PSA','PS%'
      ];

      const statPreference = {
        'W%':'higher','GF':'higher','GF/G':'higher','GA':'lower','GA/G':'lower',
        'SH':'higher','S/G':'higher','SH%':'higher','SHA':'lower','SA/G':'lower','SD':'lower',
        'FOW':'higher','FO':'higher','FO%':'higher',
        'H':'higher','H/G':'higher','HA':'lower','HD':'lower',
        'BAG':'higher','BA':'lower','BA%':'higher','1xG':'higher','1xA':'higher','1x%':'higher',
        'PS':'higher','PSA':'lower','PS%':'higher','GP':'higher','W':'higher','L':'lower','T':'higher',
        'OTL':'lower','PTS':'higher'
      };

      // Show emojis and abbreviations above the table
      let tableHeader = `${team1Emoji} ${team1Abbr} | ${team2Emoji} ${team2Abbr}`;
      let table = "```"; // start code block

      statsToCompare.forEach(stat => {
        const t1 = team1Stats[stat] ?? '-';
        const t2 = team2Stats[stat] ?? '-';
        let t1Display = t1;
        let t2Display = t2;

        if (t1 !== '-' && t2 !== '-' && statPreference[stat]) {
          if ((statPreference[stat] === 'higher' && t1 > t2) ||
              (statPreference[stat] === 'lower' && t1 < t2)) {
            t1Display = `**${t1}**`;
          } else if (t1 !== t2) {
            t2Display = `**${t2}**`;
          }
        }

        table += `\n${stat.padEnd(6)} | ${t1Display.toString().padEnd(6)} | ${t2Display}`;
      });

      table += "\n```";

      await interaction.editReply(`${tableHeader}\n${table}`);

    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error generating matchup.");
    }
  }

});

// === Get Team Stats ===
async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30',
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return {};

  // Column mapping for RawTeam sheet
  const statColumnMap = {
    'GP': 4,  'W': 5,  'L': 6,  'T': 7,  'OTL': 8,  'PTS': 9, 'W%': 10,
    'GF': 11, 'GF/G': 12, 'GA': 13, 'GA/G': 14,
    'SH': 15, 'S/G': 16, 'SH%': 17, 'SHA': 18, 'SA/G': 19, 'SD': 20,
    'FOW': 31, 'FO': 32, 'FO%': 33, 'H': 34, 'H/G': 35, 'HA': 36, 'HD': 37,
    'BAG': 39, 'BA': 40, 'BA%': 41,
    '1xG': 42, '1xA': 43, '1x%': 44,
    'PS': 45, 'PSA': 46, 'PS%': 47
  };

  const headers = Object.keys(statColumnMap);
  const data = {};

  rows.forEach(row => {
    if (!row[0]) return;
    const abbr = row[0].trim();
    data[abbr] = {};
    headers.forEach(header => {
      const colIndex = statColumnMap[header];
      const val = parseFloat(row[colIndex]);
      data[abbr][header] = isNaN(val) ? row[colIndex] ?? '-' : val;
    });
  });

  return data;
}

// === Get Discord Emoji Map from BSB Settings ===
async function getDiscordEmojiMap() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'BSB Settings!B25:F40',
  });
  const rows = res.data.values || [];
  const map = {};
  rows.forEach(row => {
    if (!row[3] || !row[2]) return; // Emoji ID or Team missing
    map[row[2].trim()] = `<:${row[4] || row[2]}:${row[3]}>`; // use custom emoji
  });
  return map;
}

// === Login ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
