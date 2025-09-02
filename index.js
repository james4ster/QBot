// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import fs from 'fs';

// Load phrases
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));

// === Express Server ===
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.get('/', (req, res) => res.send('QBot is alive!'));
app.listen(PORT, () => console.log(`🌐 Express server listening on port ${PORT}`));

// === Discord Bot ===
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

// === Google Sheets Setup ===
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// === Login to Discord (only once) ===
client.login(process.env.DISCORD_BOT_TOKEN)
  .catch(err => console.error('❌ Discord login failed:', err));

// === Message Handling ===
const repliedMessages = new Set();

client.on('messageCreate', async message => {
  if (message.author.bot || message.webhookId) return;
  if (repliedMessages.has(message.id)) return;

  const msgLower = message.content.toLowerCase();

  // ✅ Ticklebot mention / keyword with 1-minute cooldown
  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 60 * 1000);
    return;
  }

  // ✅ phrases.json triggers with 10-minute cooldown
  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(t => t.toLowerCase());
    const triggerMatches = triggers.some(trigger => new RegExp(`\\b${trigger}\\b`, 'i').test(msgLower));
    if (triggerMatches) {
      repliedMessages.add(message.id);
      await message.channel.send(phraseObj.response);
      setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
      break;
    }
  }
});

client.once('clientReady', () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});
