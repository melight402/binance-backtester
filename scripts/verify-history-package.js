import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeHistoryChunk, getHistoryChunkBounds } from '../src/backtester/historyChunkFormat.js';
import { readJson, sha256 } from './history-utils.js';

const ROOT = fileURLToPath(new URL('../public/historical-data', import.meta.url));
const manifest = await readJson(join(ROOT, 'manifest.json'));
if (!manifest || manifest.schemaVersion !== 1) throw new Error('Invalid history manifest');
for (const [symbol, intervals] of Object.entries(manifest.symbols)) {
  for (const [interval, coverage] of Object.entries(intervals)) {
    let count = 0;
    for (const chunk of coverage.chunks) {
      const compressed = await readFile(join(ROOT, chunk.path));
      const raw = gunzipSync(compressed);
      if (sha256(raw) !== chunk.sha256) throw new Error(`Checksum mismatch: ${symbol} ${interval} ${chunk.path}`);
      const bounds = getHistoryChunkBounds(raw);
      const candles = decodeHistoryChunk(raw);
      if (bounds.count !== chunk.count || candles.length !== chunk.count) throw new Error(`Count mismatch: ${symbol} ${interval} ${chunk.path}`);
      count += candles.length;
    }
    if (count !== coverage.candleCount) throw new Error(`Coverage mismatch: ${symbol} ${interval}`);
  }
}
console.log('History package verified');