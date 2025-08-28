import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';

const app = express();
const PORT = process.env.PORT;
if (!PORT) throw new Error("PORT not defined in environment");

app.get('/', (req, res) => res.send('Bot is alive!'));

app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// Discord bot
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}`));

console.log('Logging in...');
client.login(process.env.DISCORD_TOKEN?.trim())
  .then(() => console.log('🚀 Login successful'))
  .catch(err => console.error('❌ Login failed:', err));
