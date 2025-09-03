import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

export async function buildGameRecap(gameData, outputPath, highlights = []) {
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1️⃣ Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f0f0f');
  grad.addColorStop(1, '#1b1b1b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2️⃣ Logos
  const logoSize = 100;
  const homeLogoPath = `./recapUtils/logos/${gameData.homeTeam}.png`;
  const awayLogoPath = `./recapUtils/logos/${gameData.awayTeam}.png`;

  try {
    const homeLogo = await loadImage(homeLogoPath);
    const awayLogo = await loadImage(awayLogoPath);

    // Draw shadow behind logos
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 15;
    ctx.drawImage(homeLogo, 50, height / 2 - logoSize / 2, logoSize, logoSize);
    ctx.drawImage(awayLogo, width - logoSize - 50, height / 2 - logoSize / 2, logoSize, logoSize);

    // Reset shadow
    ctx.shadowBlur = 0;
  } catch (err) {
    console.error('⚠️ Error loading logos:', err);
  }

  // 3️⃣ Scores above logos
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(gameData.homeScore, 50 + logoSize / 2, height / 2 - logoSize / 2 - 10);
  ctx.fillText(gameData.awayScore, width - 50 - logoSize / 2, height / 2 - logoSize / 2 - 10);

  // 4️⃣ Highlight box on left
  const highlightX = 50;
  const highlightY = 50;
  const lineHeight = 28;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(highlightX - 10, highlightY - 25, 350, highlights.length * lineHeight + 20);

  ctx.fillStyle = '#ffdd00';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  highlights.forEach((line, idx) => {
    ctx.fillText(`• ${line}`, highlightX, highlightY + idx * lineHeight);
  });

  // 5️⃣ Save file
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(outputPath, buffer);

  console.log('✅ Recap image saved at', outputPath);
}
