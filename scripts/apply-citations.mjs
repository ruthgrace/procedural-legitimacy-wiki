import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PAPERS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'docs', 'papers');
const CITATION_DATA = join(import.meta.dirname, 'citation-data.json');

function roundCitations(count) {
  if (count >= 10000) return Math.round(count / 500) * 500;
  if (count >= 1000) return Math.round(count / 100) * 100;
  return Math.round(count / 50) * 50;
}

function formatCount(count) {
  const rounded = roundCitations(count);
  return rounded.toLocaleString('en-US');
}

async function applyCitations() {
  const citations = JSON.parse(await readFile(CITATION_DATA, 'utf-8'));
  let applied = 0;
  let skipped = 0;

  for (const paper of citations) {
    if (!paper.matched || paper.citationCount == null) {
      console.warn(`Skipping ${paper.file}: no citation data`);
      skipped++;
      continue;
    }

    const filePath = join(PAPERS_DIR, paper.file);
    const content = await readFile(filePath, 'utf-8');

    // Check if already has an Aside block
    if (content.includes("import { Aside }")) {
      console.log(`Already has Aside: ${paper.file}`);
      skipped++;
      continue;
    }

    // Split at frontmatter closing ---
    const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
    if (fmEnd === -1) {
      console.warn(`No frontmatter end in ${paper.file}, skipping`);
      skipped++;
      continue;
    }

    const frontmatter = content.substring(0, fmEnd + 3);
    const body = content.substring(fmEnd + 3);

    const importLine = `import { Aside } from '@astrojs/starlight/components';`;
    const asideBlock = [
      `<Aside type="tip" title="Impact">`,
      `**Tier:** ${paper.tier} | **Citations:** ~${formatCount(paper.citationCount)} (Semantic Scholar)`,
      `</Aside>`,
    ].join('\n');

    const newContent = `${frontmatter}\n\n${importLine}\n\n${asideBlock}\n${body}`;

    await writeFile(filePath, newContent);
    console.log(`✓ ${paper.file} — ${paper.tier} (~${formatCount(paper.citationCount)})`);
    applied++;
  }

  console.log(`\nDone! Applied: ${applied}, Skipped: ${skipped}`);
}

applyCitations().catch(console.error);
