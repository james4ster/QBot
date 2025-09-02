// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { google } from 'googleapis';
import fetch from 'node-fetch'; // Make sure node-fetch is installed

import fs from 'fs';
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));



// === Express Server ===
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('QBot is alive!');
});


// === Start Express Server ===
app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

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

// === Login to Discord ===
client.login(process.env.DISCORD_BOT_TOKEN)
  .catch(err => {
    console.error('❌ Discord login failed:', err);
  });


// === Bot Ready & Listener ===

const tickleCooldown = new Set();

client.once('clientReady', () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msgLower = message.content.toLowerCase();
    const msgWords = msgLower.split(/\s+/);

    // === Handle ticklebot mention / keyword with 1-minute cooldown ===
    if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
      if (!tickleCooldown.has(message.author.id)) {
        tickleCooldown.add(message.author.id);
        await message.reply("🐺 What do you want? I'm busy watching Nyad.");
        setTimeout(() => tickleCooldown.delete(message.author.id), 60 * 1000); // 1 minute
      }
      return; // stop further processing
    }

    // === Normal phrases ===
    for (const obj of phrases) {
      for (const trigger of obj.triggers) {
        const triggerLower = trigger.toLowerCase();

        // Use word boundary regex for everything, including short triggers
        const regex = new RegExp(`\\b${triggerLower}\\b`, 'i');
        if (regex.test(msgLower)) {
          await message.channel.send(obj.response);
          return; // respond only once per message
        }
      }
    }
  });
});