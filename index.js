// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import { buildRecapForRow } from './recapUtils/buildGameRecap.js';

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

  // ✅ Ticklebot mention / keyword
  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 60 * 1000); // 1-minute cooldown
    return;
  }

  // === phrases.json triggers ===
  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(t => t.toLowerCase());
    const triggerMatches = triggers.some(trigger => new RegExp(`\\b${trigger}\\b`, 'i').test(msgLower));
    if (triggerMatches) {
      repliedMessages.add(message.id);
      await message.channel.send(phraseObj.response);
      setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
      break; // Only respond once per message
    }
  }
});

// === Register /testrecap slash command ===
const commands = [
  {
    name: 'testrecap',
    description: 'Generate a test recap for a single game',
    options: [
      {
        name: 'gamerow',
        description: 'The row number of the game in your sheet',
        type: 4, // INTEGER
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⚡ Registering /testrecap command...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ /testrecap command registered (guild)!');
  } catch (err) {
    console.error('❌ Error registering command:', err);
  }
})();

// === Handle /testrecap interactions ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'testrecap') {
    try {
      // safely defer reply
      await interaction.deferReply();

      const gameRow = interaction.options.getInteger('gamerow') || 2; // default to row 2
      const recapText = await buildRecapForRow(gameRow);

      await interaction.editReply(`✅ Recap generated for row ${gameRow}:\n${recapText}`);
    } catch (err) {
      console.error(err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(`❌ Error generating recap: ${err.message}`);
        } else {
          await interaction.reply(`❌ Error generating recap: ${err.message}`);
        }
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
});

// === Login to Discord ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
