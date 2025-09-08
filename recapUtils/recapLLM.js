import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function generateRecapText({ gameData, highlights, playerGoals, goalies, extraText = "" }) {
  const prompt = `
You are generating a sarcastic and insulting NHL '95 style recap.

Rules:
- Host name is "Schedule Czar".
- Write exactly 3 short paragraphs.
- Only use the game data, highlights, player goals, and goalies provided.
- Keep players on their correct teams.
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
