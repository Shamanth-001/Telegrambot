export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs = 2000, maxMs = 8000) {
  const delta = Math.max(0, maxMs - minMs);
  const jitter = Math.floor(Math.random() * (delta + 1));
  return sleep(minMs + jitter);
}
