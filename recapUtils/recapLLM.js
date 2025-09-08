import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Define team personalities right here
const teamPersonalities = {
  BNX: "constantly tired and drunk",
  BRW: "nickname is tommy fumbles",
  CHI: "loves fall out boy and taylor swift",
  COR: "loves star wars and is the nicest guy in the league",
  DWB: "plays effeminate with down-b shots and seagulls",
  HSW: "love the movie nyad and game of thrones",
  MON: "most likable guy from Quitadelphia",
  NCJ: "sleeps outside on the patio",
  SUP: "cheats constantly",
  THC: "chokes in the playoffs",
  VFM: "usually playing Hellraisers"
};


export async function generateRecapText({ gameData, highlights, playerGoals, goalies, extraText = "" }) {
  const prompt = `
You are generating a sarcastic and insulting NHL '95 style recap.

Rules:
- Host name is "Schedule Czar".
- When describing a team, you can include their personality: ${teamPersonalities[gameData.homeTeam] || "unknown personality"} vs ${teamPersonalities[gameData.awayTeam] || "unknown personality"}.
- Write exactly 3 short paragraphs.
- Always incorporate one or both team personality into the response.
- Only use the game data, highlights, player goals, and goalies provided.
- Players must be listed with the team they played for in this game. 
- Do NOT assign any player to a different team than what is provided in the "Game Data", "Player Goal Totals", or "Goalies".
- At least once, mention the final score of the game, including both home and away scores.
- Do not invent series info, nicknames, or future games.
- Keep it funny but concise.
- Do not add headings, one-liners, or extra tags.
- Do not mention the game ID.


Game Data:
${JSON.stringify(gameData, null, 2)}

Scoring Highlights:
${highlights.join("\n")}

Player Goal Totals:
${Object.entries(playerGoals)
  .map(([p, g]) => `${p} scored ${g} goal${g > 1 ? "s" : ""}`)
  .join("\n")}

Goalies:
${goalies.join("\n") || "Unknown"}

Final Score:
${gameData.awayTeam} ${gameData.awayScore} - ${gameData.homeScore} ${gameData.homeTeam}

${extraText}
`;

  
  try {
    const response = await client.chat({
      model: "command-r-plus",
      message: prompt,
      temperature: 0.9,
      max_tokens: 400,
    });

    return response.text?.trim() || "🚨 Could not generate recap.";
  } catch (err) {
    console.error("Cohere API Error:", err);
    return "🚨 Could not generate recap.";
  }
}
