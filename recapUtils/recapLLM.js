import fetch from "node-fetch";

export async function generateRecapText(gameData, highlights) {
  const prompt = `
Generate a concise, funny hockey recap using this info:

Home Team: ${gameData.homeTeam}
Away Team: ${gameData.awayTeam}
Score: ${gameData.homeScore}-${gameData.awayScore}
Highlights: ${highlights.join("; ")}

Make it entertaining, like a sports news blurb.
`;

  const response = await fetch("https://api.openrouter.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
