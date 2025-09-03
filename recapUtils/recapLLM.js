import fetch from "node-fetch";

/**
 * Generate a concise, funny hockey recap using OpenRouter.
 * Always returns a string, even if the API fails.
 */
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
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenRouter API error: ${response.status} ${errorText}`);
      return "No recap text could be generated due to API error.";
    }

    const data = await response.json();

    // Defensive check: ensure content exists
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn("⚠️ OpenRouter returned no content:", JSON.stringify(data, null, 2));
      return "No recap text could be generated at this time.";
    }

    return content;
  } catch (err) {
    console.error("❌ Recap generation failed:", err);
    return "No recap text could be generated due to an internal error.";
  }
}

/**
 * Optional wrapper: retry once if it fails
 */
export async function safeGenerateRecapText(gameData, highlights) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const recap = await generateRecapText(gameData, highlights);
    if (recap && !recap.startsWith("No recap text")) return recap;
    console.warn(`Retrying recap generation (attempt ${attempt + 1})`);
  }
  return "No recap text could be generated after multiple attempts.";
}
