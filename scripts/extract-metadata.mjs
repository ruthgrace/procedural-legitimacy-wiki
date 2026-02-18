import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const PAPERS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'docs', 'papers');
const OUTPUT = join(import.meta.dirname, 'paper-metadata.json');

async function extractMetadata() {
  const files = (await readdir(PAPERS_DIR)).filter(f => f.endsWith('.mdx'));
  const papers = [];

  for (const file of files) {
    const content = await readFile(join(PAPERS_DIR, file), 'utf-8');

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      console.warn(`No frontmatter in ${file}, skipping`);
      continue;
    }
    const fm = fmMatch[1];

    // Extract description (clean paper title)
    const descMatch = fm.match(/^description:\s*"(.+)"$/m);
    const title = descMatch ? descMatch[1] : '';

    // Extract authors from body
    const authorsMatch = content.match(/\*\*Authors:\*\*\s*(.+)/);
    const authors = authorsMatch ? authorsMatch[1].trim() : '';

    // Extract year from Published line
    const pubMatch = content.match(/\*\*Published:\*\*\s*(\d{4})/);
    const year = pubMatch ? parseInt(pubMatch[1]) : null;

    papers.push({ file, title, authors, year });
  }

  await writeFile(OUTPUT, JSON.stringify(papers, null, 2));
  console.log(`Extracted metadata for ${papers.length} papers -> ${OUTPUT}`);
}

extractMetadata().catch(console.error);
