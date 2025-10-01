import { writePickToSheet } from './sheets.js';

export class Draft {
  constructor(draftOrder, availablePlayers) {
    this.draftOrder = draftOrder;
    this.availablePlayers = availablePlayers;
    this.teamRoster = {};
    this.pickHistory = [];
    this.currentPickIndex = 0;
    this.paused = false;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  async pick(userId, playerName, discordClient) {
    if (this.paused) {
      return discordClient.users.send(userId, "Draft is paused. Wait a moment.");
    }

    const currentPick = this.draftOrder[this.currentPickIndex];
    if (userId !== currentPick.discordId) {
      return discordClient.users.send(userId, `It's not your turn. Current pick: ${currentPick.team}`);
    }

    const idx = this.availablePlayers.findIndex(p => p.toLowerCase() === playerName.toLowerCase());
    if (idx === -1) {
      return discordClient.users.send(userId, "That player doesn't match any available player. Be sure to type it exactly correct!");
    }

    const player = this.availablePlayers.splice(idx, 1)[0];
    this.teamRoster[currentPick.team] = this.teamRoster[currentPick.team] || [];
    this.teamRoster[currentPick.team].push(player);
    this.pickHistory.push({ team: currentPick.team, player });
    await writePickToSheet(this.currentPickIndex, player);

    const channel = await discordClient.channels.fetch(process.env.DRAFT_CHANNEL_ID);
    await channel.send(`✅ **${currentPick.team}** picked **${player}**`);

    this.currentPickIndex++;
  }

  undo(discordClient) {
    if (this.pickHistory.length === 0) return;
    const lastPick = this.pickHistory.pop();
    const { team, player } = lastPick;
    this.teamRoster[team] = this.teamRoster[team].filter(p => p !== player);
    this.availablePlayers.push(player);
    this.currentPickIndex--;

    discordClient.channels.fetch(process.env.DRAFT_CHANNEL_ID).then(channel => {
      channel.send(`↩️ Undo: ${team}'s pick of ${player} has been reverted.`);
    });
  }
}
