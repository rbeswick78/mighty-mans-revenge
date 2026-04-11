import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MapData } from '../types/map.js';
import { validateMap } from './map-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads a map by name from the shared/maps directory.
 * Intended for Node.js server usage. For the client, import the JSON directly.
 */
export function loadMap(name: string): MapData {
  const mapPath = resolve(__dirname, '../../maps', `${name}.json`);
  const raw = readFileSync(mapPath, 'utf-8');
  const mapData: MapData = JSON.parse(raw) as MapData;

  const result = validateMap(mapData);
  if (!result.valid) {
    throw new Error(
      `Invalid map "${name}": ${result.errors.join('; ')}`,
    );
  }

  return mapData;
}
