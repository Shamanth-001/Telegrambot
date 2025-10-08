import { SourceCircuitBreaker } from './circuitBreaker.js';

const breakers = new Map();
const sources = [
  { name: 'YTS', key: 'yts' },
  { name: 'PirateBay', key: 'piratebay' },
  { name: 'MovierulZ', key: 'movierulz' },
];

function getBreaker(key) {
  if (!breakers.has(key)) breakers.set(key, new SourceCircuitBreaker());
  return breakers.get(key);
}

export async function getSourcesStatus() {
  return sources.map((s) => {
    const br = getBreaker(s.key);
    return { name: s.name, status: br.state };
  });
}

export async function checkSourceAvailability() {
  return getSourcesStatus();
}

export { getBreaker };


