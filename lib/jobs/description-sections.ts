export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const HEADING_KEYWORDS = new Set(
  [
    // German
    'aufgaben',
    'deine aufgaben',
    'ihre aufgaben',
    'tätigkeiten',
    'tätigkeitsschwerpunkte',
    'stellenbeschreibung',
    'anforderungen',
    'anforderungsprofil',
    'ihr profil',
    'dein profil',
    'qualifikationen',
    'voraussetzungen',
    'was sie mitbringen',
    'was du mitbringst',
    'was wir bieten',
    'wir bieten',
    'unser angebot',
    'ihre benefits',
    'deine benefits',
    'benefits',
    'leistungen',
    'über uns',
    'das unternehmen',
    'der arbeitgeber',
    'arbeitszeiten',
    'arbeitszeit',
    'arbeitsort',
    'einsatzort',
    'gehalt',
    'vergütung',
    'kontakt',
    'ansprechpartner',
    'bewerbung',
    'so bewerben sie sich',
    'interessiert',
    'hiring',
    // English
    'about the role',
    'the role',
    'about you',
    'who you are',
    'about us',
    'who we are',
    'about the company',
    'responsibilities',
    'what you will do',
    "what you'll do",
    'requirements',
    'what you need',
    "what you'll need",
    'required qualifications',
    'qualifications',
    'must have',
    'must-have',
    'nice to have',
    'nice-to-have',
    'preferred qualifications',
    'what you bring',
    'your profile',
    'benefits',
    'perks',
    'what we offer',
    'compensation',
    'salary',
    'location',
    'job type',
    'employment type',
    'how to apply',
    'to apply',
  ].map((keyword) => keyword.toLowerCase())
);

const LIST_MARKER = /^([•\-*–—▪▸►·◦○●■□✓✔➢➤]|(\d{1,2}[.)])|(\([a-z0-9]+\))|([a-z]\)))\s+/u;

function stripMarker(line: string): string {
  return line.replace(LIST_MARKER, '').trim();
}

function stripHeadingDecor(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(LIST_MARKER, '')
    .replace(/^\d{1,2}[.)]\s+/, '')
    .replace(/:+\s*$/, '')
    .replace(/^\*\*(.+)\*\*$/u, '$1')
    .replace(/^__(.+)__$/u, '$1')
    .trim();
}

function isAllCapsHeading(line: string): boolean {
  if (line.length < 3 || line.length > 50) return false;
  const letters = line.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 70) return false;
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (LIST_MARKER.test(trimmed)) return false;
  const plain = stripHeadingDecor(trimmed).toLowerCase();
  if (!plain) return false;
  if (HEADING_KEYWORDS.has(plain)) return true;
  if (trimmed.endsWith(':') && trimmed.length <= 60) return true;
  if (isAllCapsHeading(trimmed)) return true;
  return false;
}

function splitLongParagraph(text: string, maxLength = 500): string[] {
  if (text.length <= maxLength) return [text];
  const sentences = text.split(/(?<=[.!?;])\s+(?=[A-ZÄÖÜA-Z0-9"„“])/u);
  if (sentences.length <= 1) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Turns flat job-ad text into readable blocks: detected headings,
 * bullet/numbered lists, and paragraphs. Never invents content —
 * unrecognized text stays a plain paragraph.
 */
export function parseDescription(text: string | undefined | null): DescriptionBlock[] {
  if (!text) return [];
  
  let cleanedText = text.replace(/\r\n/g, '\n');

  // Attempt to fix bad scraping where block elements were joined without spaces.
  // e.g. "About YouYou have a knack" -> "About You\n\nYou have a knack"
  // e.g. "About UsConstructor is..." -> "About Us\n\nConstructor is..."
  const knownHeadings = Array.from(HEADING_KEYWORDS).sort((a, b) => b.length - a.length);
  const headingRegex = new RegExp(`\\b(${knownHeadings.join('|')})([A-Z])`, 'gi');
  cleanedText = cleanedText.replace(headingRegex, (match, heading, nextChar) => {
    return `${heading}\n\n${nextChar}`;
  });

  const lines = cleanedText.split('\n');

  const blocks: DescriptionBlock[] = [];
  let pendingList: string[] = [];

  const flushList = () => {
    if (pendingList.length > 0) {
      blocks.push({ type: 'list', items: pendingList });
      pendingList = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (isHeading(line)) {
      flushList();
      blocks.push({ type: 'heading', text: stripHeadingDecor(line) });
      continue;
    }
    if (LIST_MARKER.test(line)) {
      pendingList.push(stripMarker(line));
      continue;
    }
    flushList();
    for (const chunk of splitLongParagraph(line)) {
      blocks.push({ type: 'paragraph', text: chunk });
    }
  }
  flushList();

  // A trailing heading with no content reads better as plain text.
  return blocks.map((block, index) => {
    if (block.type !== 'heading') return block;
    const hasContentAfter = blocks
      .slice(index + 1)
      .some((later) => later.type !== 'heading');
    return hasContentAfter ? block : { type: 'paragraph' as const, text: block.text };
  });
}
