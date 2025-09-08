import fs from 'fs';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const client = new TextToSpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
});

/**
 * Convert text to speech using SSML
 * @param {string} text - The recap text
 * @param {string} outputFile - Filename for MP3 output
 */
export async function generateTTS(text, outputFile = 'recap.mp3') {
  // Wrap text in SSML with sports announcer style
  const ssmlText = `
    <speak>
      <prosody rate="1.05" pitch="+2st">
        ${text}
      </prosody>
    </speak>
  `;

  const [response] = await client.synthesizeSpeech({
    input: { text },   // or use ssml if you want, but some tags may be ignored
    voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
    audioConfig: { audioEncoding: 'MP3' }
  });

  fs.writeFileSync(outputFile, response.audioContent, 'binary');
  console.log('✅ Audio saved to', outputFile);
  return outputFile;
}

/**
 * Combine an image and audio into a video (max 40s)
 * @param {string} imageFile - Path to PNG/JPG image
 * @param {string} audioFile - Path to MP3 audio
 * @param {string} outputFile - Path for MP4 output
 */
export function createVideo(imageFile, audioFile, outputFile = "recapVideo.mp4") {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput(imageFile)
      .loop()
      .addInput(audioFile)
      .outputOptions([
        "-c:v libx264",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-r 30",
        "-shortest",
        "-t 70",          // max 40 seconds
        "-vf scale=1280:720"
      ])
      .on("end", () => {
        console.log("✅ Video created:", outputFile);
        resolve();
      })
      .on("error", (err) => reject(err))
      .save(outputFile);
  });
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleText = "And here we go! The Naked City Junkies face off against Troy Hill Cookiepuss in an epic showdown!";
  (async () => {
    try {
      const audioFile = await generateTTS(sampleText);
      await createVideo('testImage.png', audioFile);
    } catch (err) {
      console.error('❌ Test failed:', err);
    }
  })();
}
