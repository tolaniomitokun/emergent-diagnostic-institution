import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dest = resolve(__dirname, 'public', 'data');

// Create directories
for (const dir of ['round1', 'round2', 'observer']) {
  mkdirSync(resolve(dest, dir), { recursive: true });
}

const copies = [
  ['cases/case_001_diagnostic_odyssey.json', 'case.json'],
  ['shared/debate/round_1/neurologist.json', 'round1/neurologist.json'],
  ['shared/debate/round_1/developmental_pediatrician.json', 'round1/developmental_pediatrician.json'],
  ['shared/debate/round_1/geneticist.json', 'round1/geneticist.json'],
  ['shared/debate/round_2/neurologist.json', 'round2/neurologist.json'],
  ['shared/debate/round_2/developmental_pediatrician.json', 'round2/developmental_pediatrician.json'],
  ['shared/debate/round_2/geneticist.json', 'round2/geneticist.json'],
  ['shared/observer/analysis_round_1.json', 'observer/round1.json'],
  ['shared/observer/analysis_round_2.json', 'observer/round2.json'],
  ['shared/output/final_diagnosis.json', 'diagnosis.json'],
  ['shared/output/patient_explanation.md', 'patient_explanation.md'],
  ['shared/constitution/amendments_log.json', 'amendments.json'],
];

let copied = 0;
let missing = 0;

for (const [src, dst] of copies) {
  const srcPath = resolve(root, src);
  const dstPath = resolve(dest, dst);
  if (existsSync(srcPath)) {
    cpSync(srcPath, dstPath);
    copied++;
  } else {
    console.warn(`  Warning: missing ${src}`);
    missing++;
  }
}

console.log(`Data: ${copied} files copied${missing ? `, ${missing} missing` : ''}`);
