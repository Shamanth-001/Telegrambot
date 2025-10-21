import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('close', code => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

export async function ensureUnderSize(inputPath, maxSizeMB = 1900) {
  if (!fs.existsSync(inputPath)) return inputPath;
  const stats = fs.statSync(inputPath);
  const sizeMB = stats.size / (1024 * 1024);
  if (sizeMB <= maxSizeMB) return inputPath;

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${base}.fit.mkv`);

  // Re-encode with size cap using -fs. Use medium preset and constrained bitrate to avoid too aggressive truncation.
  const targetBytes = Math.floor(maxSizeMB * 1024 * 1024);
  const args = [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-fs', String(targetBytes),
    outputPath,
  ];

  await runFfmpeg(args);

  // Replace original if new file is valid and smaller
  if (fs.existsSync(outputPath)) {
    const outStats = fs.statSync(outputPath);
    if (outStats.size < stats.size) {
      try { fs.unlinkSync(inputPath); } catch {}
      return outputPath;
    }
  }
  return inputPath;
}


