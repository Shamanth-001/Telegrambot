// Persistent background queue with retry/backoff and one-job-per-title
import fs from 'fs';
import path from 'path';

const JOBS_FILE = path.join(process.cwd(), 'jobs.json');
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 60_000; // 1 min base: 1,2,4,8,16 mins

function loadJobs() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return {};
    const raw = fs.readFileSync(JOBS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function saveJobs(jobs) {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
  } catch {}
}

const jobsState = {
  running: new Set(),
};

export function getJobsIndex() {
  return loadJobs();
}

export async function enqueueJob(title, jobFn) {
  const key = String(title || '').toLowerCase();
  const idx = loadJobs();
  if (jobsState.running.has(key)) return; // already running in-memory
  if (idx[key] && (idx[key].status === 'queued' || idx[key].status === 'running')) return; // already queued/persisted
  idx[key] = idx[key] || { attempts: 0, status: 'queued', lastError: null, updatedAt: new Date().toISOString() };
  saveJobs(idx);
  processJob(key, jobFn);
}

async function processJob(key, jobFn) {
  const idx = loadJobs();
  idx[key] = idx[key] || { attempts: 0 };
  idx[key].status = 'running';
  idx[key].updatedAt = new Date().toISOString();
  saveJobs(idx);
  jobsState.running.add(key);
  try {
    await jobFn();
    const done = loadJobs();
    done[key] = { attempts: idx[key].attempts || 0, status: 'completed', lastError: null, updatedAt: new Date().toISOString() };
    saveJobs(done);
  } catch (err) {
    const cur = loadJobs();
    const attempts = Math.min((cur[key]?.attempts || 0) + 1, MAX_RETRIES);
    cur[key] = {
      attempts,
      status: attempts >= MAX_RETRIES ? 'failed' : 'queued',
      lastError: err?.message || String(err),
      updatedAt: new Date().toISOString(),
    };
    saveJobs(cur);
    if (attempts < MAX_RETRIES) {
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempts); // 1,2,4,8,16 mins
      setTimeout(() => processJob(key, jobFn), delay);
    }
  } finally {
    jobsState.running.delete(key);
  }
}
