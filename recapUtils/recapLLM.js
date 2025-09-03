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

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,      // limit the length
        temperature: 0.7,     // optional: makes it a bit more creative
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Recap generation failed:", err);
    throw err;
  }
}
