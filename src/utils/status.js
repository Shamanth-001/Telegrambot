import { SourceCircuitBreaker } from '../circuitBreaker.js';

const breakers = new Map();
const sources = [
  { name: 'YTS', key: 'yts' },
  { name: 'PirateBay', key: 'piratebay' },
  { name: 'Movierulz', key: 'movierulz' },
  { name: 'Cataz', key: 'cataz' },
  { name: 'YTSTV', key: 'ytstv' },
  { name: 'Einthusan', key: 'einthusan' },
  { name: 'Fmovies', key: 'fmovies' },
  { name: 'Flixer', key: 'flixer' },
  { name: 'MkvCinemas', key: 'mkvcinemas' },
  { name: 'Cineby', key: 'cineby' },
  { name: 'Hicine', key: 'hicine' },
];

function getBreaker(key) {
  if (!breakers.has(key)) breakers.set(key, new SourceCircuitBreaker());
  return breakers.get(key);
}

export async function getSourcesStatus() {
  return sources.map((s) => {
    const br = getBreaker(s.key);
    const state = br.state; // 'CLOSED' (normal), 'OPEN' (tripped), 'HALF_OPEN' (testing)
    const isAvailable = state !== 'OPEN';
    return {
      name: s.name,
      key: s.key,
      state,
      isOpen: isAvailable, // for backward compatibility with UI code meaning "available"
      failureCount: br.failureCount,
      nextAttemptTs: br.nextAttemptTs
    };
  });
}

export async function checkSourceAvailability() {
  const statuses = await getSourcesStatus();
  return statuses.reduce((acc, s) => {
    acc[s.key] = s.isOpen;
    return acc;
  }, {});
}
