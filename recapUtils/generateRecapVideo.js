import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises'; // use promises version
import { buildRecapForRow } from './buildGameRecap.js';
import { generateTTS, createVideo } from './generateTTS.js';
import { google } from 'googleapis';
import { AttachmentBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOX_SCORE_DIR = path.join(__dirname, "boxScores");
const PROCESSED_DIR = path.join(__dirname, "processedBoxScores");
const OUTPUT_DIR = './videos';
const TEMPLATE_PATH = path.join(__dirname, 'assets', 'recapTemplate.png');

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PROCESSED_DIR, { recursive: true });

// --- Google Sheets setup ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Helper to get sheet row from gameID ---
async function getRowByGameId(gameId) {
  const range = `RawData!A2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];
  const index = rows.findIndex(r => Number(r[1]) === gameId);
  if (index === -1) throw new Error(`Game ID ${gameId} not found`);
  return index + 2;
}

// --- Overlay functions ---
async function overlayRecapElements(templatePath, boxScorePath, homeLogoPath, awayLogoPath, outputPath) {
  const BOX_SLOT = { width: 494, height: 367, top: 37, left: 227 };
  const HOME_LOGO_SLOT = { top: 343, left: 530 };
  const AWAY_LOGO_SLOT = { top: 343, left: 310 };

  const boxMeta = await sharp(boxScorePath).metadata();
  const resizedBox = await sharp(boxScorePath)
    .resize({
      width: boxMeta.width > BOX_SLOT.width ? BOX_SLOT.width : undefined,
      height: boxMeta.height > BOX_SLOT.height ? BOX_SLOT.height : undefined,
      fit: 'inside',
    })
    .toBuffer();

  const homeLogoResized = await sharp(homeLogoPath)
    .resize({ width: 60, height: 60, fit: 'inside' })
    .toBuffer();

  const awayLogoResized = await sharp(awayLogoPath)
    .resize({ width: 60, height: 60, fit: 'inside' })
    .toBuffer();

  await sharp(templatePath)
    .composite([
      { input: resizedBox, top: BOX_SLOT.top, left: BOX_SLOT.left },
      { input: awayLogoResized, top: AWAY_LOGO_SLOT.top, left: AWAY_LOGO_SLOT.left },
      { input: homeLogoResized, top: HOME_LOGO_SLOT.top, left: HOME_LOGO_SLOT.left },
    ])
    .toFile(outputPath);

  return outputPath;
}

// --- Main generate function ---
export async function generateRecapVideo(boxScoreFile, client) {
  try {
    const fileName = path.basename(boxScoreFile, path.extname(boxScoreFile));
    
    const parts = fileName.split('-');
    const gameId = parseInt(parts[parts.length - 1]); // always take last part


    const gameRow = await getRowByGameId(gameId);

    const homeTeam = await getHomeTeamFromRow(gameRow);
    const awayTeam = await getAwayTeamFromRow(gameRow);

    const combinedImage = path.join(OUTPUT_DIR, `recap${gameId}.png`);
    await overlayRecapElements(
      TEMPLATE_PATH,
      boxScoreFile,
      path.join(__dirname, 'logos', `${homeTeam}.png`),
      path.join(__dirname, 'logos', `${awayTeam}.png`),
      combinedImage
    );

    const recapText = await buildRecapForRow(gameRow);

    const audioFile = path.join(OUTPUT_DIR, `game${gameId}.mp3`);
    await generateTTS(recapText, audioFile);

    const videoFile = path.join(OUTPUT_DIR, `game${gameId}.mp4`);
    await createVideo(combinedImage, audioFile, videoFile);

    console.log('✅ Recap video complete:', videoFile);

    const processedBoxScorePath = path.join(PROCESSED_DIR, path.basename(boxScoreFile));
    await fs.rename(boxScoreFile, processedBoxScorePath);
    console.log(`✅ Box score moved to processed folder: ${processedBoxScorePath}`);

    // --- Send to Discord if client provided ---
    if (client) await sendVideoToDiscord(videoFile, client);

    return videoFile;
  } catch (err) {
    console.error('❌ Failed to generate recap video:', err);
    throw err;
  }
}

// --- Helper functions ---
async function getHomeTeamFromRow(rowNumber) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `RawData!H${rowNumber}`,
  });
  return res.data.values[0][0];
}

async function getAwayTeamFromRow(rowNumber) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `RawData!I${rowNumber}`,
  });
  return res.data.values[0][0];
}

// === Send Video to Discord ===
export async function sendVideoToDiscord(localPath, client, channelId) {
  try {
    if (!client) throw new Error('Discord client not provided');
    const channel = await client.channels.fetch(channelId || process.env.BOX_SCORE_CHANNEL_ID);
    if (!channel) throw new Error('Could not find channel to send video');

    const file = new AttachmentBuilder(localPath);
    await channel.send({ content: '🎬 Schedule Czar Highlights Ready!', files: [file] });
    console.log(`✅ Sent video ${localPath} to Discord`);
  } catch (err) {
    console.error('❌ Failed to send video to Discord:', err);
  }
}
