import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Project root assumed two levels up from util folder
export const projectRoot = path.resolve(__dirname, '..', '..');
export const stagingDir = path.join(projectRoot, 'staging');
export const dataDir = path.join(projectRoot, 'data');

export function resolveInRoot(...segments) {
  return path.join(projectRoot, ...segments);
}