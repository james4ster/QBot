import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';
import { buildRecapForRow } from './buildGameRecap.js';
import { generateTTS, createVideo } from './generateTTS.js';
import { google } from 'googleapis';

// === Box Score Setup ===
import { AttachmentBuilder } from 'discord.js';
const BOX_SCORE_DIR = path.join(__dirname, "boxScores");
const PROCESSED_DIR = path.join(__dirname, "processedBoxScores");
  
const OUTPUT_DIR = './videos';
const TEMPLATE_PATH = path.join(__dirname, 'assets', 'recapTemplate.png');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

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
  const range = `RawData!A2:B`; // column B = gameID
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];
  const index = rows.findIndex(r => Number(r[1]) === gameId);
  if (index === -1) throw new Error(`Game ID ${gameId} not found`);
  return index + 2; // +2 because A2 = row 2
}

// --- Overlay functions ---
async function overlayBoxScore(templatePath, boxScorePath, outputPath) {
  const SLOT = { width: 494, height: 367, top: 37, left: 227 };
  const templateMeta = await sharp(templatePath).metadata();
  const boxMeta = await sharp(boxScorePath).metadata();

  const maxWidth = Math.min(SLOT.width, templateMeta.width - SLOT.left);
  const maxHeight = Math.min(SLOT.height, templateMeta.height - SLOT.top);

  const resizedBox = await sharp(boxScorePath)
    .resize({ width: boxMeta.width > maxWidth ? maxWidth : undefined, 
              height: boxMeta.height > maxHeight ? maxHeight : undefined,
              fit: 'inside' })
    .toBuffer();

  await sharp(templatePath)
    .composite([{ input: resizedBox, top: SLOT.top, left: SLOT.left }])
    .toFile(outputPath);

  return outputPath;
}

async function overlayRecapElements(templatePath, boxScorePath, homeLogoPath, awayLogoPath, outputPath) {
  const BOX_SLOT = { width: 494, height: 367, top: 37, left: 227 };
  const HOME_LOGO_SLOT = { top: 343, left: 530 };  
  const AWAY_LOGO_SLOT = { top: 343, left: 310 };  

  const boxMeta = await sharp(boxScorePath).metadata();
  const resizedBox = await sharp(boxScorePath)
    .resize({ width: boxMeta.width > BOX_SLOT.width ? BOX_SLOT.width : undefined,
              height: boxMeta.height > BOX_SLOT.height ? BOX_SLOT.height : undefined,
              fit: 'inside' })
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
export async function generateRecapVideo(boxScoreFile) {
  try {
    const fileName = path.basename(boxScoreFile, path.extname(boxScoreFile)); 
    const gameId = parseInt(fileName.split('-')[1]); // second part after dash
  
    // Lookup sheet row for this gameID
    const gameRow = await getRowByGameId(gameId);

    // --- fetch home/away team codes from the sheet row ---
    const homeTeam = await getHomeTeamFromRow(gameRow);
    const awayTeam = await getAwayTeamFromRow(gameRow);
    
    // 1️⃣ Combine template + box score + logos
    const combinedImage = path.join(OUTPUT_DIR, `recap${gameId}.png`);
    await overlayRecapElements(
      TEMPLATE_PATH,
      boxScoreFile,
      path.join(__dirname, 'logos', `${homeTeam}.png`),
      path.join(__dirname, 'logos', `${awayTeam}.png`),
      combinedImage
    );

    // 2️⃣ Get recap text
    const recapText = await buildRecapForRow(gameRow);

    // 3️⃣ Generate TTS audio (optional for testing)
    const audioFile = path.join(OUTPUT_DIR, `game${gameId}.mp3`);
    await generateTTS(recapText, audioFile);

    // 4️⃣ Create video
    const videoFile = path.join(OUTPUT_DIR, `game${gameId}.mp4`);
    await createVideo(combinedImage, audioFile, videoFile);

    console.log('✅ Recap video complete:', videoFile);

    // ✅ Move processed box score to processedBoxScores folder
    const processedBoxScorePath = path.join(PROCESSED_DIR, path.basename(boxScoreFile));
    fs.rename(boxScoreFile, processedBoxScorePath, (err) => {
      if (err) console.error('❌ Failed to move box score:', err);
      else console.log(`✅ Box score moved to processed folder: ${processedBoxScorePath}`);
    });

    return videoFile;
  } catch (err) {
    console.error('❌ Failed to generate recap video:', err);
    throw err;
  }
}

// --- Example usage: process all box scores in folder ---
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const files = fs.readdirSync(BOX_SCORE_DIR).filter(f => f.endsWith('.png'));
    for (const file of files) {
      const boxScorePath = path.join(BOX_SCORE_DIR, file);
      await generateRecapVideo(boxScorePath);
    }
  })();
}

async function getHomeTeamFromRow(rowNumber) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `RawData!H${rowNumber}`, // column H = home team
  });
  return res.data.values[0][0]; 
}

async function getAwayTeamFromRow(rowNumber) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `RawData!I${rowNumber}`, // column I = away team
  });
  return res.data.values[0][0]; 
}

// === Send Video to Discord ===
async function sendVideoToDiscord(localPath) {
  try {
    const channel = await client.channels.fetch(process.env.BOX_SCORE_CHANNEL_ID);
    if (!channel) {
      console.error('❌ Could not find channel to send video.');
      return;
    }

    const file = new AttachmentBuilder(localPath);
    await channel.send({ content: '🎬 Recap video ready!', files: [file] });
    console.log(`✅ Sent video ${localPath} to Discord`);
  } catch (err) {
    console.error('❌ Failed to send video to Discord:', err);
  }
}