import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const INPUT = join(import.meta.dirname, 'paper-metadata.json');
const OUTPUT = join(import.meta.dirname, 'citation-data.json');
const API_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';
const DELAY_MS = 3500; // More conservative rate limit
const RETRY_DELAY_MS = 10000; // Wait longer after a 429
const MAX_RETRIES = 3;

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const aNorm = normalize(a);
  const bNorm = normalize(b);
  if (aNorm === bNorm) return 1.0;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.85;

  const aWords = new Set(aNorm.split(' '));
  const bWords = new Set(bNorm.split(' '));
  const intersection = [...aWords].filter(w => bWords.has(w));
  const union = new Set([...aWords, ...bWords]);
  return intersection.length / union.size;
}

function getFirstAuthorLastName(authors) {
  const firstAuthor = authors.split(',')[0].trim();
  const parts = firstAuthor.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 429) {
      const wait = RETRY_DELAY_MS * (attempt + 1);
      console.log(`    Rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/${retries + 1})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`API error ${res.status}`);
  }
  throw new Error('Rate limited after all retries');
}

async function lookupCitations() {
  const papers = JSON.parse(await readFile(INPUT, 'utf-8'));

  // Load existing results to resume
  let existing = {};
  if (existsSync(OUTPUT)) {
    const prev = JSON.parse(await readFile(OUTPUT, 'utf-8'));
    for (const p of prev) {
      if (p.matched) existing[p.file] = p;
    }
    console.log(`Resuming: ${Object.keys(existing).length} already matched\n`);
  }

  const results = [];
  let matched = 0;
  let unmatched = 0;

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];

    // Skip already matched
    if (existing[paper.file]) {
      results.push(existing[paper.file]);
      matched++;
      console.log(`[${i + 1}/${papers.length}] Already matched: ${paper.file}`);
      continue;
    }

    console.log(`[${i + 1}/${papers.length}] Looking up: ${paper.title.substring(0, 60)}...`);

    try {
      const query = encodeURIComponent(paper.title);
      const url = `${API_BASE}?query=${query}&fields=title,citationCount,year,authors&limit=5`;
      const res = await fetchWithRetry(url);
      const data = await res.json();
      const candidates = data.data || [];

      if (candidates.length === 0) {
        console.warn(`  No results for ${paper.file}`);
        results.push({ ...paper, citationCount: null, matched: false, note: 'No results' });
        unmatched++;
        await sleep(DELAY_MS);
        continue;
      }

      const authorLastName = getFirstAuthorLastName(paper.authors);
      let bestScore = -1;
      let bestCandidate = null;

      for (const c of candidates) {
        let score = similarity(paper.title, c.title || '');
        if (paper.year && c.year === paper.year) score += 0.15;
        else if (paper.year && c.year && Math.abs(c.year - paper.year) === 1) score += 0.05;
        if (c.authors && c.authors.length > 0) {
          const cAuthorLast = c.authors[0].name.split(/\s+/).pop().toLowerCase();
          if (cAuthorLast === authorLastName) score += 0.2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = c;
        }
      }

      if (bestScore >= 0.6 && bestCandidate) {
        console.log(`  ✓ Matched (score=${bestScore.toFixed(2)}): ${bestCandidate.title} [${bestCandidate.citationCount} citations]`);
        results.push({
          ...paper,
          citationCount: bestCandidate.citationCount,
          matched: true,
          matchedTitle: bestCandidate.title,
          matchScore: Math.round(bestScore * 100) / 100,
        });
        matched++;
      } else {
        console.warn(`  ✗ No confident match (best score=${bestScore.toFixed(2)})`);
        results.push({
          ...paper,
          citationCount: null,
          matched: false,
          note: `Best score ${bestScore.toFixed(2)}: "${bestCandidate?.title}"`,
        });
        unmatched++;
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      results.push({ ...paper, citationCount: null, matched: false, note: err.message });
      unmatched++;
    }

    await sleep(DELAY_MS);
  }

  await writeFile(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nDone! Matched: ${matched}, Unmatched: ${unmatched}`);
  console.log(`Output: ${OUTPUT}`);
}

lookupCitations().catch(console.error);
