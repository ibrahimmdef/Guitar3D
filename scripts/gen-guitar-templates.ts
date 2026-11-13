/**
 * Writes the guitar templates (apps/web/public/guitar/templates/<id>.profile.json + index.json)
 * from the parametric specs in apps/web/src/fretboard/templates.ts.
 *
 *   npx tsx scripts/gen-guitar-templates.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateProfile, templateIndexEntry, TEMPLATE_SPECS } from '../apps/web/src/fretboard/templates';

const out = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/guitar/templates');
mkdirSync(out, { recursive: true });
for (const spec of TEMPLATE_SPECS) {
  const p = buildTemplateProfile(spec);
  writeFileSync(join(out, `${spec.id}.profile.json`), `${JSON.stringify(p)}\n`);
  console.log(`${spec.id}: ${p.totalLengthCm} cm, ${p.body.outline.length} outline points`);
}
writeFileSync(join(out, 'index.json'), `${JSON.stringify(TEMPLATE_SPECS.map(templateIndexEntry), null, 2)}\n`);
