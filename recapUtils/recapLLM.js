import fetch from "node-fetch";

/**
 * Generate a concise, funny hockey recap (4-5 sentences) using OpenRouter.
 * Always returns a string, even if the API fails.
 */
export async function generateRecapText(gameData, highlights) {
  const prompt = `
You are a sarcastic sports journalist. 
Write a concise, sarcastic recap of this hockey game in 4-5 sentences. 
Do NOT include internal reasoning—just the recap text.

Home Team: ${gameData.homeTeam}
Away Team: ${gameData.awayTeam}
Score: ${gameData.homeScore}-${gameData.awayScore}
Highlights: ${highlights.join("; ")}
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
        max_tokens: 700,  // give enough room for 4-5 sentences
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenRouter API error: ${response.status} ${errorText}`);
      return "No recap text could be generated due to API error.";
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.warn("⚠️ OpenRouter returned empty content:", JSON.stringify(data, null, 2));
      return "No recap text could be generated at this time.";
    }

    return content;
  } catch (err) {
    console.error("❌ Recap generation failed:", err);
    return "No recap text could be generated due to an internal error.";
  }
}
