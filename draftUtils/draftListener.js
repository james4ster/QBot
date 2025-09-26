import { Client, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';
import { assignPick } from './draftController.js';
import { getDraftOrder } from './sheets.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds
  ],
  partials: ['CHANNEL'] // Needed to receive DMs
});

// TEST MODE: map managers to your Discord ID
const TEST_DISCORD_ID = '582240735793774618';
const MANAGER_MAP = {
  'Puss': TEST_DISCORD_ID,
  'Yoda': TEST_DISCORD_ID,
  'Krav': TEST_DISCORD_ID,
  'Magnus': TEST_DISCORD_ID,
  // add others if needed
};

const DRAFT_CHANNEL_ID = '1412409609674555464';
const respondedIds = new Set();

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  try {
    const user = await client.users.fetch(TEST_DISCORD_ID);
    await user.send('📬 DM channel open — send me your picks - be sure to spell the name right!');
    console.log('📩 DM channel successfully opened');
  } catch (err) {
    console.error('❌ Failed to open DM channel:', err);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.guild) return;
    if (message.author.bot) return;
    if (respondedIds.has(message.id)) return;
    respondedIds.add(message.id);

    const age = Date.now() - message.createdTimestamp;
    if (age > 5000) return;

    const senderId = message.author.id;

    // Validate sender is a manager
    const managerNameFromDM = Object.keys(MANAGER_MAP).find(
      name => MANAGER_MAP[name] === senderId
    );
    if (!managerNameFromDM) {
      return message.reply("🚫 You are not registered as a manager for testing.");
    }

    const playerName = message.content.trim();
    console.log(`📝 Attempting pick (TEST MODE): ${managerNameFromDM} -> ${playerName}`);

    // Assign pick based on first empty row in spreadsheet order
    const draftOrder = await getDraftOrder();
    const currentPick = draftOrder.find(p => !p.picked);
    if (!currentPick) {
      return message.reply("🏁 Draft completed — no picks left.");
    }

    // Assign pick using the row from spreadsheet
    await assignPick(currentPick.managerName, playerName);

    // DM confirmation
    const user = await client.users.fetch(TEST_DISCORD_ID);
    await user.send(
      `✅ Pick confirmed → Round ${currentPick.round}, Pick ${currentPick.pickNumber}: ` +
      `${currentPick.managerName} selects ${playerName}`
    );

    // Post to draft channel
    const draftChannel = await client.channels.fetch(DRAFT_CHANNEL_ID);
    await draftChannel.send(
      `📝 Round ${currentPick.round}, Pick ${currentPick.pickNumber}: ` +
      `${currentPick.managerName} selects ${playerName}`
    );

    // Post "next up" to draft channel
    const currentIndex = draftOrder.findIndex(p => p.rowNumber === currentPick.rowNumber);
    const nextPick = draftOrder.slice(currentIndex + 1).find(p => !p.picked);

    if (nextPick) {
      await draftChannel.send(
        `📣 Next Up → Round ${nextPick.round}, Pick ${nextPick.pickNumber}: ${nextPick.managerName} ` +
        `is on the clock until ${nextPick.time}`
      );
    } else {
      await draftChannel.send("🏁 Draft completed — no more managers left.");
    }

  } catch (err) {
    console.error('❌ Error handling DM:', err);
    try {
      const user = await client.users.fetch(message.author.id);
      await user.send(`🚫 Failed to process your pick: ${err.message}`);
    } catch {}
  }
});

export function startDraftListener() {
  client.login(process.env.DISCORD_TOKEN);
}
