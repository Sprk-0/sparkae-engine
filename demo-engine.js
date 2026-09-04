/* ═══════════════════════════════════════════════════════════════════
   SparkAE demo engine — the deterministic 7-gate assessor, in-browser.

   This is the real adjudication path, not a narrative: BM25 retrieval over
   the uploaded corpus, concept extraction and coverage, evidence strength
   scoring, ODP resolution, refutation and contradiction detection, temporal
   coherence (staleness, scan cadence, future-dating, open-finding SLA), then
   confidence and defensibility scoring. It mirrors the server-side assessor;
   DIF texts come from demo-standalone-catalog.js, which mirrors
   src/catalog/controls.py.

   Extracted verbatim from the previous single-file demo so the same engine can
   back more than one page and can be reviewed as source rather than as a blob.
   Everything is wrapped in an IIFE and published under one global, because the
   demo shell defines its own fmtBytes/classifyFile/grade and a bare top-level
   `const` redeclaration across two classic scripts is a hard SyntaxError that
   would take the whole page down.

   Pure logic — no DOM access, no network, and no clock. The assessment date
   is run context the caller supplies; the four temporal gates receive it and
   the result reports it as `assessment_date` with `assessment_date_source`
   ('supplied' or 'none'). With no date the temporal gate cannot verify
   currency and fails closed ('indeterminate') rather than borrowing a date
   from the evidence under test — a package whose newest scan is years old
   must not pass the cadence gate by being assessed "as of" that scan. The
   same corpus and date therefore give the same verdicts on any machine on
   any day. Determinism is a product guarantee (repo rule 6): same corpus in,
   same verdicts out. Do not introduce new Date() with no arguments,
   Date.now(), Math.random(), or iteration that depends on object key order
   below.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';


const BM25_K1 = 1.5, BM25_B = 0.75, CONTROL_ID_BOOST = 3.0;
const STOP_WORDS = new Set(['a','an','and','are','as','at','be','by','for','from','has','have','in','is','it','its','of','on','or','that','the','this','to','was','were','will','with','we','they','their','if','but','so','than']);
const TOKEN_RE = /[A-Za-z][A-Za-z0-9_-]{1,}/g;

function tokenize(text) {
  if (!text) return [];
  return (text.match(TOKEN_RE) || []).map(t => t.toLowerCase()).filter(t => !STOP_WORDS.has(t) && t.length >= 2);
}

class BM25Retriever {
  constructor(chunks) {
    this.chunks = chunks;
    this._tokenized = chunks.map(c => tokenize(c.text || ''));
    this._docFreqs = this._tokenized.map(toks => {
      const f = {}; toks.forEach(t => f[t] = (f[t]||0)+1); return f;
    });
    this._docLens = this._tokenized.map(t => t.length);
    const n = chunks.length || 1;
    this._avgdl = this._docLens.reduce((s,l) => s+l, 0) / n || 1;
    this._df = {}; this._tokenized.forEach(toks => {
      const seen = new Set(toks);
      seen.forEach(t => this._df[t] = (this._df[t]||0)+1);
    });
    this._idf = {};
    for (const [term, df] of Object.entries(this._df)) {
      this._idf[term] = Math.log(((n - df + 0.5) / (df + 0.5)) + 1.0);
    }
  }

  _score(qtokens, idx) {
    const freqs = this._docFreqs[idx];
    const dl = this._docLens[idx] || 1;
    let score = 0;
    for (const term of qtokens) {
      const tf = freqs[term] || 0;
      if (!tf) continue;
      const idf = this._idf[term] || 0;
      score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / this._avgdl))));
    }
    return score;
  }

  query(queryText, topK = 8, controlId = null) {
    const qtokens = tokenize(queryText);
    if (!qtokens.length || !this.chunks.length) return [];
    let scored = this.chunks.map((_, i) => [this._score(qtokens, i), i]);
    if (controlId) {
      const maxRaw = Math.max(...scored.map(s => s[0]), 1e-6);
      scored = scored.map(([raw, idx]) => {
        const ids = this.chunks[idx].control_ids || [];
        if (ids.includes(controlId)) return [(raw > 0 ? raw : maxRaw) * CONTROL_ID_BOOST, idx];
        return [raw, idx];
      });
    }
    scored = scored.filter(s => s[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    if (!scored.length) return [];
    scored = scored.slice(0, topK);
    const maxS = scored[0][0] || 1;
    return scored.map(([raw, idx]) => ({...this.chunks[idx], score: Math.round(raw/maxS*10000)/10000}));
  }
}

// ════════════════════════════════════════════════════════
// DOCUMENT PARSING (in-browser)
// ════════════════════════════════════════════════════════

const CTRL_ID_RE = /\b([A-Z]{2}-\d{1,3}(?:\.\d+)?(?:\(\d+\))?)\b/g;
const VALID_FAMILIES = new Set(['AC','AT','AU','CA','CM','CP','IA','IR','MA','MP','PE','PL','PM','PS','PT','RA','SA','SC','SI','SR']);

function extractControlIds(text) {
  const ids = new Set();
  let m; CTRL_ID_RE.lastIndex = 0;
  while ((m = CTRL_ID_RE.exec(text)) && ids.size < 50) {
    const fam = m[1].split('-')[0];
    if (VALID_FAMILIES.has(fam)) ids.add(m[1]);
  }
  return [...ids];
}

function chunkText(text, filename, maxChunk = 800, minChunk = 100) {
  if (!text || !text.trim()) return [];
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '', offset = 0;
  for (const para of paragraphs) {
    if (current.length + para.length > maxChunk && current.length >= minChunk) {
      chunks.push({text: current.trim(), filename, offset, control_ids: extractControlIds(current)});
      offset += current.length;
      current = '';
    }
    current += para + '\n\n';
  }
  if (current.trim().length >= 10) {
    if (chunks.length && current.trim().length < minChunk) {
      chunks[chunks.length-1].text += '\n' + current.trim();
      chunks[chunks.length-1].control_ids = extractControlIds(chunks[chunks.length-1].text);
    } else {
      chunks.push({text: current.trim(), filename, offset, control_ids: extractControlIds(current)});
    }
  }
  return chunks;
}

async function parseFile(file) {
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'nessus' || ext === 'xml' || ext === 'json') {
    const text = await file.text();
    return chunkText(text, name);
  }
  if (ext === 'csv') {
    const text = await file.text();
    return chunkText(text, name);
  }
  if (ext === 'docx') {
    return await parseDocx(file);
  }
  // For formats we can't parse client-side (PDF, XLSX, XLS, DOC), extract what we can
  if (ext === 'pdf') {
    return [{text: '[PDF file: ' + name + ' — text extraction requires server-side processing. Upload to SparkAE server for full analysis.]', filename: name, offset: 0, control_ids: []}];
  }
  const text = await file.text().catch(() => '');
  if (text && text.trim()) return chunkText(text, name);
  return [{text: '[Binary file: ' + name + ']', filename: name, offset: 0, control_ids: []}];
}

async function parseDocx(file) {
  // DOCX is a ZIP containing XML. We use JSZip-like manual parsing.
  try {
    const buf = await file.arrayBuffer();
    const entries = await unzip(buf);
    const docXml = entries['word/document.xml'];
    if (!docXml) return [{text: '[DOCX: could not find document.xml]', filename: file.name, offset: 0, control_ids: []}];
    const text = docXml
      .replace(/<w:br[^>]*\/>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n\n')
      .replace(/<\/w:r>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return chunkText(text, file.name);
  } catch(e) {
    return [{text: '[DOCX parse error: ' + e.message + ']', filename: file.name, offset: 0, control_ids: []}];
  }
}

// Minimal ZIP extraction (no external library)
async function unzip(buffer) {
  const view = new DataView(buffer);
  const entries = {};
  let offset = 0;
  const bytes = new Uint8Array(buffer);
  while (offset < bytes.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);
    if (compMethod === 0) { // Stored
      entries[name] = new TextDecoder().decode(data);
    } else if (compMethod === 8) { // Deflated
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(data);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const result = new Uint8Array(total);
        let pos = 0;
        chunks.forEach(c => { result.set(c, pos); pos += c.length; });
        entries[name] = new TextDecoder().decode(result);
      } catch(e) { /* skip undecompressible entries */ }
    }
    offset = dataStart + compSize;
  }
  return entries;
}

async function parseZip(file) {
  const buf = await file.arrayBuffer();
  const entries = await unzip(buf);
  const allChunks = [];
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue; // directory
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['xml', 'txt', 'md', 'csv', 'json', 'nessus'].includes(ext)) {
      allChunks.push(...chunkText(content, name));
    } else if (ext === 'docx') {
      // Nested DOCX in ZIP — skip (can't easily re-parse nested zip)
      allChunks.push({text: '[Nested DOCX: ' + name + ']', filename: name, offset: 0, control_ids: []});
    }
  }
  return allChunks;
}

// ════════════════════════════════════════════════════════
// 7-GATE DETERMINISTIC ENGINE
// ════════════════════════════════════════════════════════

const MIN_EVIDENCE_SCORE = 0.15;
const MIN_CONCEPT_COVERAGE = 0.40;

// ── Gate 2: Concept Extraction & Coverage ──

const CONCEPT_VERBS = /(?:addresses|defines|includes|establishes|identifies|implements|specifies|documents|describes|covers|provides|requires|ensures|incorporates|determines if)\b/i;
const FILLER_RE = /^(?:the|an?|and|or|that|which|is|are|has|have|for)\b\s*/i;
const CLAUSE_SPLIT = /[.;:\n]| but | however | except | although /i;
const NEGATION_RE = /\b(?:not|without|lacks|lacking|absent|absence|never|cannot|can't|won't|missing|fails?\s+to|failed\s+to|no\s+longer|do(?:es)?\s+not|is\s+not|are\s+not)\b/i;

function extractConcepts(difText) {
  if (!difText) return [];
  const m = CONCEPT_VERBS.exec(difText);
  let conceptText = m ? difText.slice(m.index + m[0].length) : difText.replace(/^Determine\s+if\s+/i, '');
  conceptText = conceptText.replace(/\.$/, '').replace(/\([^)]*\)/g, '');
  const parts = conceptText.split(/[;,]|\band\b|\bor\b/);
  const concepts = [], seen = new Set();
  for (let p of parts) {
    p = p.trim().replace(FILLER_RE, '').trim().toLowerCase();
    if (p.length >= 3 && !seen.has(p)) { seen.add(p); concepts.push(p); }
  }
  return concepts;
}

function extractKeywords(concept) {
  const kws = [concept];
  const suffixes = ['tion','ment','ness','ing','ies','ity','ence','ance'];
  for (const w of concept.split(/\s+/)) {
    if (w.length > 3) {
      kws.push(w);
      for (const sfx of suffixes) {
        if (w.endsWith(sfx) && w.length > sfx.length + 2) { kws.push(w.slice(0, -sfx.length)); break; }
      }
    }
  }
  return kws;
}

function checkCoverage(concepts, evidenceText) {
  if (!concepts.length) return {covered:[], uncovered:[], ratio:1.0};
  if (!evidenceText) return {covered:[], uncovered:[...concepts], ratio:0.0};
  const evLower = evidenceText.toLowerCase();
  const clauses = evLower.split(CLAUSE_SPLIT).filter(c => c.trim());
  const covered = [], uncovered = [];
  for (const concept of concepts) {
    const kws = extractKeywords(concept);
    let found = false;
    for (const clause of clauses) {
      if (NEGATION_RE.test(clause)) continue;
      if (kws.some(kw => clause.includes(kw))) { found = true; break; }
    }
    (found ? covered : uncovered).push(concept);
  }
  return {covered, uncovered, ratio: covered.length / concepts.length};
}

// ── Gate 3: Evidence Strength ──

const STRENGTH_PATTERNS = [
  ['section_ref', /(?:section|§)\s*\d/i],
  ['page_ref', /(?:page|p\.?|pg\.?)\s*\d/i],
  ['version_ref', /(?:v(?:ersion)?\.?\s*\d|rev(?:ision)?\.?\s*\d)/i],
  ['date_ref', /\b(?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4})\b/i],
  ['quoted_text', /"[^"]{10,}"/],
  ['doc_name', /\b(?:SSP|SOP|POA&M|CIS|SRTM|BCP|DRP|IRP|ATO)\b|(?:policy|plan|procedure|standard|guide|handbook)\s+(?:v[\d.]+|version)/i],
];

function scoreEvidence(text) {
  if (!text || !text.trim()) return {tier:'unknown', score:0, signals:[]};
  const signals = [];
  for (const [name, pat] of STRENGTH_PATTERNS) { if (pat.test(text)) signals.push(name); }
  const n = signals.length;
  if (n >= 3) return {tier:'strong', score:Math.min(100, 60+n*10), signals};
  if (n >= 1) return {tier:'moderate', score:30+n*15, signals};
  return {tier:'weak', score:Math.max(10, Math.min(25, Math.floor(text.length/20))), signals};
}

// ── Gate 3b: Keyword Stuffing ──

function evidenceLooksStuffed(text) {
  if (!text) return false;
  const words = text.split(/\s+/);
  if (words.length < 40) return false;
  let longest = 0, run = 0;
  for (const w of words) {
    run++;
    if (/[.!?;:]/.test(w)) { longest = Math.max(longest, run); run = 0; }
  }
  longest = Math.max(longest, run);
  if (longest < 40) return false;
  const lowered = words.map(w => w.replace(/[.,;:!?"'()\[\]]/g, '').toLowerCase());
  const seen = new Set();
  let dupes = 0;
  for (let i = 0; i < lowered.length - 4; i++) {
    const gram = lowered.slice(i, i+5).join(' ');
    if (seen.has(gram)) dupes++;
    seen.add(gram);
  }
  return dupes >= 3;
}

// ── Gate 4: ODP Validation ──

const ODP_PLACEHOLDER = /\[([^\[\]]*organization[- ]defined[^\[\]]*)\]/gi;
const ODP_ASSIGNMENT = /\[assignment:\s*([^\[\]]+?)\]/gi;
const ODP_FREQ_KW = ['daily','weekly','monthly','quarterly','annually','yearly','every','periodic','continuous','real-time','realtime'];
const ODP_TIME_KW = ['within','hour','day','week','month','year','immediately'];
const ODP_ROLE_KW = ['isso','ciso','iso','ao','authorizing official','system owner','administrator','security officer','manager'];
const ODP_THRESH_KW = ['no more than','at least','maximum','minimum','threshold','limit','exceed','up to'];

function extractOdps(difText) {
  if (!difText) return [];
  const odps = [];
  let m;
  ODP_PLACEHOLDER.lastIndex = 0;
  while ((m = ODP_PLACEHOLDER.exec(difText))) odps.push(m[1].trim());
  ODP_ASSIGNMENT.lastIndex = 0;
  while ((m = ODP_ASSIGNMENT.exec(difText))) odps.push(m[1].trim());
  return odps;
}

function validateOdps(difText, evidenceText) {
  const odps = extractOdps(difText);
  if (!odps.length) return {required:[], missing:[], satisfied:true};
  const et = (evidenceText||'').toLowerCase();
  const stuffed = evidenceLooksStuffed(evidenceText);
  const missing = odps.filter(odp => {
    const n = odp.toLowerCase();
    if (/frequency|period/.test(n)) return !ODP_FREQ_KW.some(k => et.includes(k));
    if (/time/.test(n)) return !ODP_TIME_KW.some(k => et.includes(k)) && !ODP_FREQ_KW.some(k => et.includes(k));
    if (/personnel|role|official/.test(n)) return !ODP_ROLE_KW.some(k => et.includes(k));
    if (/threshold|limit|number|quantity/.test(n)) return !ODP_THRESH_KW.some(k => et.includes(k));
    return !et.trim() || stuffed;
  });
  return {required:odps, missing, satisfied:!missing.length};
}

// ── Gate 5: Refutation & Contradiction Detection ──

const REFUTING_PATTERNS = [
  /\bnot\s+(?:yet\s+)?(?:been\s+)?(?:fully\s+|properly\s+|completely\s+|correctly\s+|formally\s+|successfully\s+|adequately\s+)?(?:implemented|configured|enforced|deployed|established|maintained|performed|documented|disseminated|defined|reviewed|updated|applied|operational|turned\s+on|in\s+place)\b/,
  /\byet\s+to\s+be\s+(?:implemented|configured|enforced|deployed|established|completed|performed|defined|built|turned\s+on|operational|in\s+place)\b/,
  /\bremains?\s+outstanding\b/,
  /\bremains?\s+to\s+be\s+(?:implemented|configured|enforced|deployed|established|completed|performed|defined|built|turned\s+on)\b/,
  /\bpartially\s+implemented\b/,
  /\b(?:tooling|capabilit(?:y|ies)|controls?|mechanisms?|process(?:es)?|procedures?|configuration|enforcement|logging|monitoring)\s+(?:is|are|was|were|remains?)?\s*absent\b/,
  /\benforcement\s+(?:is\s+|was\s+)?disabled\b/,
  /\bnon-?compliant\b/,
  /\bno\s+(?:evidence|records?|documentation)\s+(?:of|exist|that|to)\b/,
  /\bnot\s+(?:yet\s+)?remediated\b/,
  /\bfail(?:s|ed|ing)?\s+to\s+(?:meet|implement|enforce|address|satisfy)\b/,
  /\b(?:cannot|can\s?not|unable\s+to)\s+(?:meet|implement|enforce|address|satisfy)\b/,
  /\b(?:lacks?|(?:is|are)\s+lacking)\s+(?:an?\s+|any\s+|the\s+)?(?:documented\s+|formal\s+|automated\s+|effective\s+)?(?:procedure|policy|process|mechanism|capabilit(?:y|ies)|control|enforcement|monitoring|logging|tooling|safeguards?)\b/,
  /\bno\s+(?:documented\s+|formal\s+|automated\s+|effective\s+)?(?:procedure|policy|process|mechanism|capabilit(?:y|ies)|enforcement|safeguards?)\s+(?:exists?|is\s+(?:in\s+place|defined|documented|implemented|enforced))\b/,
  /\b(?:is|are)\s+(?:still\s+|currently\s+)?being\s+implemented\b/,
  /\bimplementation\s+(?:is\s+|remains\s+)?(?:still\s+)?(?:in\s+progress|incomplete|underway|not\s+(?:yet\s+)?complete|ongoing)\b/,
];

const NEGATION_PAIRS = [
  [/not implemented/, /is implemented/],
  [/not documented/, /is documented/],
  [/not reviewed/, /is reviewed/],
  [/not required/, /is required/],
  [/not configured/, /is configured/],
  [/disabled/, /enabled/],
];

const DRAFT_RE = /\b(?:tbd|to\s+be\s+(?:determined|defined|decided|finalized)|pending\s+finalization|to-?do|placeholder)\b|[\[<]\s*(?:insert|todo|placeholder|fill[\s-]?in)\b/i;

// Proximity thresholds (chars) for scoping refuting language to a control ID.
// Shared by detectRefutationsScoped and buildRefutationIndex.
const REFUTATION_NEAR_CONTROL_CHARS = 400;  // refutation within this distance of the target control ID counts against it
const REFUTATION_NEAR_OTHER_CHARS = 200;    // refutation this close to a different control ID is attributed to that control
const REFUTATION_INDEX_SCOPE_CHARS = 600;   // corpus-index attribution window around a refuting phrase

// Execute a pattern once from the start of the string without relying on (or
// mutating) shared regex state — safe even if a pattern carries the g/y flag.
function execPattern(pattern, text) {
  if (pattern.global || pattern.sticky) {
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).exec(text);
  }
  return pattern.exec(text);
}

function nearestDistance(positions, pos) {
  let best = Infinity;
  for (const p of positions) best = Math.min(best, Math.abs(p - pos));
  return best;
}

function detectRefutations(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const found = [];
  for (const p of REFUTING_PATTERNS) {
    const m = execPattern(p, t);
    if (m && m[0]) found.push(m[0]);
  }
  return found;
}

function detectRefutationsScoped(text, controlId) {
  if (!text) return [];
  const t = text.toLowerCase();
  const cidRe = new RegExp('\\b' + controlId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
  const cidPositions = [...text.matchAll(cidRe)].map(m => m.index);
  const allCtrlRe = /\b[A-Z]{2}-\d{1,3}(?:\.\d+)?(?:\(\d+\))?\b/g;
  const otherCtrls = [...text.matchAll(allCtrlRe)].filter(m => m[0] !== controlId);
  const found = [];
  for (const p of REFUTING_PATTERNS) {
    const m = execPattern(p, t);  // match once; reuse below
    if (!m || !m[0]) continue;
    const refPos = m.index;
    const cidDist = nearestDistance(cidPositions, refPos);  // nearest occurrence, not first
    if (cidDist < REFUTATION_NEAR_CONTROL_CHARS) { found.push(m[0]); continue; }
    if (otherCtrls.length === 0) { found.push(m[0]); continue; }
    const nearOther = otherCtrls.some(oc => Math.abs(refPos - oc.index) < REFUTATION_NEAR_OTHER_CHARS);
    if (nearOther && (cidPositions.length === 0 || cidDist > REFUTATION_NEAR_CONTROL_CHARS)) continue;
    if (cidPositions.length === 0) found.push(m[0]);
  }
  return found;
}

function detectContradictions(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  return NEGATION_PAIRS.filter(([neg, pos]) => neg.test(t) && pos.test(t)).map(([neg, pos]) => neg.source + ' / ' + pos.source);
}

function detectDraftPlaceholders(text) {
  if (!text) return [];
  const matches = [];
  let m; const re = new RegExp(DRAFT_RE.source, 'gi');
  while ((m = re.exec(text))) matches.push(m[0].trim());
  return matches;
}

// ── Gate 6: Temporal Check ──

const MONTHS_MAP = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const DATE_PATTERNS = [
  [/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/g, 'ymd'],
  [/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi, 'mdy'],
  [/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{4})\b/gi, 'my'],
  [/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, 'mdy_num'],
];
const STALENESS = {review_date:365,update_date:365,effective_date:1095,creation_date:1095,document_date:365,unknown:365};
const CTX_PATTERNS = [[/(?:last\s+)?review(?:ed)?/i,'review_date'],[/(?:updated?|revised?|modified)/i,'update_date'],[/effective/i,'effective_date'],[/(?:created?|developed?|established?|drafted?)/i,'creation_date'],[/(?:dated?|version|v\.?\s*\d)/i,'document_date']];

function extractDates(text) {
  if (!text) return [];
  const found = [];
  for (const [pattern, fmt] of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text))) {
      let dateObj;
      try {
        if (fmt === 'ymd') dateObj = new Date(+m[1], +m[2]-1, +m[3]);
        else if (fmt === 'mdy') { const mo = MONTHS_MAP[m[1].toLowerCase().replace('.','')]; if (mo) dateObj = new Date(+m[3], mo-1, +m[2]); }
        else if (fmt === 'my') { const mo = MONTHS_MAP[m[1].toLowerCase().replace('.','')]; if (mo) dateObj = new Date(+m[2], mo-1, 1); }
        else if (fmt === 'mdy_num') dateObj = new Date(+m[3], +m[1]-1, +m[2]);
      } catch(e) { continue; }
      if (!dateObj || isNaN(dateObj.getTime())) continue;
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      const surrounding = text.slice(start, end);
      let ctxType = 'unknown';
      for (const [cp, ct] of CTX_PATTERNS) { if (cp.test(surrounding)) { ctxType = ct; break; } }
      found.push({dateStr: m[0], dateObj, ctxType, surrounding});
    }
  }
  const seen = new Set();
  return found.filter(d => { if (seen.has(d.dateStr)) return false; seen.add(d.dateStr); return true; })
    .sort((a, b) => b.dateObj - a.dateObj);
}

// Find the passage carrying a phrase: first in the evidence already
// retrieved for this objective, else anywhere in the corpus (the refutation
// index is corpus-wide). Returns a window around it and the file it sits in.
function locatePhrase(retriever, evidenceText, phrase) {
  const needle = String(phrase || '').toLowerCase();
  if (needle.length < 6) return { excerpt: '', filename: '' };
  const window = (text, at) => {
    const start = Math.max(0, at - 220), end = Math.min(text.length, at + needle.length + 220);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  };
  let at = evidenceText.toLowerCase().indexOf(needle);
  if (at >= 0) return { excerpt: window(evidenceText, at), filename: '' };
  for (const c of (retriever && retriever.chunks || [])) {
    const text = foldHomoglyphs(c && c.text || '');
    at = text.toLowerCase().indexOf(needle);
    if (at >= 0) return { excerpt: window(text, at), filename: c.filename || '' };
  }
  return { excerpt: '', filename: '' };
}

function checkCurrency(dates, assessmentDate) {
  if (!dates.length) return {isCurrent:true, staleDays:0, concerns:[]};
  const ad = assessmentDate;
  const most = dates[0];
  const daysOld = Math.round((ad - most.dateObj) / 86400000);
  const thresh = STALENESS[most.ctxType] || 365;
  const concerns = [];
  for (const d of dates) {
    const dd = Math.round((ad - d.dateObj) / 86400000);
    const dt = STALENESS[d.ctxType] || 365;
    if (dd < 0) concerns.push(d.ctxType + ': ' + d.dateStr + ' is future-dated');
    else if (dd > dt) concerns.push(d.ctxType + ': ' + d.dateStr + ' is ' + dd + ' days old (threshold: ' + dt + ')');
  }
  return {isCurrent: daysOld >= 0 && daysOld <= thresh, staleDays: Math.max(0, daysOld), concerns};
}

// ── Gate 6b: Scan Cadence Check (ConMon 30-day) ──

const SCAN_CADENCE_DAYS = 30;
const SCAN_CONTEXT_RE = /\b(?:vulnerability scan|vuln scan|authenticated scan|credentialed scan|web application scan|database scan|container scan|nessus|qualys|tenable|rapid7|openvas|scanned|last scan|most recent scan|scan(?:s)?\s+(?:was|were|is|are)?\s*(?:performed|completed|run|conducted|executed))\b/i;

function checkScanCadence(dates, assessmentDate) {
  const ad = assessmentDate;
  const scanDates = dates.filter(d => SCAN_CONTEXT_RE.test(d.surrounding || ''));
  if (!scanDates.length) return null;
  const most = scanDates[0];
  const age = Math.round((ad - most.dateObj) / 86400000);
  if (age > SCAN_CADENCE_DAYS) {
    return 'Scan evidence is ' + age + ' days old, exceeding the ' + SCAN_CADENCE_DAYS + '-day FedRAMP ConMon cadence (most recent: ' + most.dateStr + ')';
  }
  return null;
}

// ── Gate 6c: Future Date Fabrication Detection ──

const PAST_ACTION_RE = /\b(?:completed|performed|conducted|executed|tested|reviewed|approved|occurred|as of|dated|generated|signed|issued|finished|last scan|last backup|last review|last test|last audit)\b/i;
const FUTURE_PLAN_RE = /\b(?:scheduled|planned|due|target|upcoming|expir|valid until|renew|will be|to be completed|to be performed|to be done|forecast|projected|anticipat|next)\b/i;

function checkFutureDates(dates, assessmentDate) {
  const ad = assessmentDate;
  for (const d of dates) {
    const age = Math.round((ad - d.dateObj) / 86400000);
    if (age >= 0) break; // past date, stop
    const ctx = d.surrounding || '';
    if (FUTURE_PLAN_RE.test(ctx) && !PAST_ACTION_RE.test(ctx)) continue; // planning is ok
    if (PAST_ACTION_RE.test(ctx)) {
      return 'Fabricated evidence: "' + ctx.slice(0,60) + '" claims completion on future date ' + d.dateStr + ' (' + (-age) + ' days ahead)';
    }
  }
  return null;
}

// ── Gate 6d: Open Finding SLA Check ──

const FINDING_NOUN_RE = /\b(?:vulnerabilit(?:y|ies)|finding|flaw|cve|weakness|poa&m item|defect)\b/i;
const OPEN_STATUS_RE = /\b(?:remains?\s+(?:open|unremediated|unresolved|outstanding|unpatched)|still\s+(?:open|unremediated|unresolved)|currently\s+(?:open|unremediated|unresolved)|not\s+(?:yet\s+)?(?:remediated|patched|fixed|closed|resolved|mitigated))\b/i;
const CLOSURE_RE = /\b(?:remediated|patched|fixed|closed|resolved|mitigated)\b/i;
const SEVERITY_RE = /\b(critical|high|moderate|medium|low)\b/i;
const DATE_TOKEN_RE = /(\d{4}-\d{2}-\d{2})/g;
const SLA_DAYS = {critical:30, high:30, moderate:90, medium:90, low:180};

function checkOpenFindingSla(evidenceText, assessmentDate) {
  if (!evidenceText) return null;
  const ad = assessmentDate;
  const sentences = evidenceText.split(/(?<=[.;!?])\s+/);
  for (const sent of sentences) {
    if (!FINDING_NOUN_RE.test(sent)) continue;
    if (!OPEN_STATUS_RE.test(sent)) continue;
    if (CLOSURE_RE.test(sent) && !OPEN_STATUS_RE.test(sent)) continue;
    const sevMatch = sent.match(SEVERITY_RE);
    if (!sevMatch) continue;
    const severity = sevMatch[1].toLowerCase();
    const sla = SLA_DAYS[severity] || 180;
    const dateToks = [...sent.matchAll(DATE_TOKEN_RE)].map(m => {
      try { const [y,mo,d] = m[1].split('-').map(Number); return new Date(y,mo-1,d); } catch(e) { return null; }
    }).filter(Boolean);
    if (!dateToks.length) continue;
    const oldest = dateToks.reduce((a,b) => a < b ? a : b);
    const age = Math.round((ad - oldest) / 86400000);
    if (age > sla) {
      return severity + ' finding open ' + age + ' days (SLA: ' + sla + ' days) since ' + oldest.toISOString().slice(0,10);
    }
  }
  return null;
}

// ── Homoglyph Folding (homoglyph defense) ──

const HOMOGLYPHS = {'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','к':'k','м':'m','т':'t','н':'h','в':'b','і':'i','ј':'j','ѕ':'s','ԁ':'d','ο':'o','α':'a','ε':'e','ρ':'p','ν':'v','τ':'t','κ':'k','ι':'i','χ':'x'};

function foldHomoglyphs(text) {
  if (!text) return text;
  let out = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFKC');
  for (const [from, to] of Object.entries(HOMOGLYPHS)) out = out.replaceAll(from, to);
  return out;
}

// ── Full-Corpus Refutation Index ──

function buildRefutationIndex(retriever) {
  if (retriever._refutationIndex) return retriever._refutationIndex;
  const index = {};
  for (const chunk of retriever.chunks) {
    const txt = chunk.text || '';
    const cids = chunk.control_ids || [];
    if (!cids.length) continue;
    for (const pat of REFUTING_PATTERNS) {
      const m = execPattern(pat, txt);
      if (!m) continue;
      const pos = m.index;
      // Find which control IDs have an occurrence near this refuting phrase,
      // measuring against the NEAREST occurrence of each ID (not the first)
      const nearby = cids.filter(cid => {
        const re = new RegExp('\\b' + cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
        const positions = [...txt.matchAll(re)].map(cm => cm.index);
        if (!positions.length) return cids.length === 1;
        return nearestDistance(positions, pos) < REFUTATION_INDEX_SCOPE_CHARS;
      });
      const targets = nearby.length ? nearby : (cids.length === 1 ? cids : []);
      for (const cid of targets) {
        if (!index[cid]) index[cid] = [];
        index[cid].push(m[0]);
      }
    }
  }
  retriever._refutationIndex = index;
  return index;
}

// ── 3-Axis Confidence Model (server parity) ──

function computeConfidence(determination, evidenceText, strength, coverageRatio, defScore, contradictionCount) {
  // Axis 1: Extraction
  let extraction = 0.3;
  const sigs = strength.signals || [];
  extraction += Math.min(0.3, sigs.filter(s => s === 'doc_name').length * 0.1);
  extraction += Math.min(0.2, sigs.filter(s => s === 'section_ref' || s === 'page_ref').length * 0.07);
  extraction += Math.min(0.15, sigs.filter(s => s === 'quoted_text').length * 0.1);
  if ((evidenceText || '').split(/\s+/).length >= 50) extraction += 0.05;
  extraction = Math.max(0.05, Math.min(1.0, extraction));

  // Axis 2: Assertion
  const tierMap = {strong:0.85, moderate:0.6, weak:0.3, unknown:0.15};
  let assertion = tierMap[strength.tier] || 0.3;
  assertion = (assertion + defScore/100) / 2;
  const evLow = (evidenceText || '').toLowerCase();
  if (determination === 'Satisfied') {
    const negCount = (evLow.match(/\b(?:not|missing|absent|lacking|insufficient|fail)\b/g) || []).length;
    if (negCount > 0) assertion *= Math.max(0.5, 1.0 - negCount * 0.15);
  }
  assertion = Math.max(0.05, Math.min(1.0, assertion));

  // Axis 3: Coverage
  let coverage;
  if (coverageRatio >= 0.8) coverage = 0.85 + (coverageRatio - 0.8) * 0.75;
  else if (coverageRatio >= 0.5) coverage = 0.5 + (coverageRatio - 0.5) * 1.17;
  else coverage = Math.max(0.1, coverageRatio);

  // Geometric mean
  let composite = Math.pow(extraction * assertion * coverage, 1/3);
  if (contradictionCount > 0) composite = Math.max(0, composite - 0.20 * contradictionCount);
  return Math.round(composite * 100) / 100;
}

// ── Defensibility Scoring (full 9-factor) ──

function scoreDefensibility(evidence, coverageRatio, strength, hasDates, hasContradictions) {
  let score = 0;
  // 1. Specificity (0-12)
  const specSignals = (strength.signals || []).filter(s => ['section_ref','page_ref','doc_name'].includes(s)).length;
  score += Math.min(12, specSignals * 4);
  // 2. Completeness (0-12)
  score += Math.round(coverageRatio * 12);
  // 3. Consistency (0-12)
  score += hasContradictions ? 4 : 12;
  // 4. Traceability (0-12)
  score += strength.tier === 'strong' ? 12 : strength.tier === 'moderate' ? 8 : 4;
  // 5. Clarity (0-12)
  const wc = (evidence || '').split(/\s+/).length;
  score += wc >= 50 && wc <= 300 ? 12 : wc >= 30 ? 8 : 4;
  // 6. Freshness (0-10)
  score += hasDates ? 7 : 3;
  // 7. Criticality (0-10) — assume medium
  score += 6;
  // 8. Cross-reference (0-10)
  score += hasContradictions ? 4 : 10;
  // 9. PMO survival (0-10)
  score += hasContradictions ? 4 : 10;
  return Math.min(100, score);
}

function grade(d) { return d >= 80 ? 'A' : d >= 60 ? 'B' : d >= 40 ? 'C' : d >= 20 ? 'D' : 'F'; }

// ── FedRAMP Risk Matrix (SAR Table 3-6) ──
const RISK_MATRIX = {
  'High,High':'High','High,Moderate':'Moderate','High,Low':'Low',
  'Moderate,High':'Moderate','Moderate,Moderate':'Moderate','Moderate,Low':'Low',
  'Low,High':'Low','Low,Moderate':'Low','Low,Low':'Low'
};
function calcRiskExposure(likelihood, impact) { return RISK_MATRIX[likelihood+','+impact] || 'Low'; }

function likelihoodFor(coverageRatio, strengthTier) {
  if (strengthTier === 'strong' && coverageRatio >= 0.75) return 'Low';
  if (coverageRatio < 0.25 || strengthTier === 'unknown') return 'High';
  return 'Moderate';
}
function impactFor(gapTypes) {
  const high = ['encryption_gap','access_control_gap','contingency_gap','missing_implementation'];
  if (high.some(g => gapTypes.includes(g))) return 'High';
  return gapTypes.length ? 'Moderate' : 'Low';
}
function weaknessTypeFor(gapTypes) {
  const sig = ['missing_implementation','encryption_gap','access_control_gap','missing_evidence','configuration_gap','contingency_gap','contradictory_evidence'];
  return sig.some(g => gapTypes.includes(g)) ? 'Significant Deficiency' : 'Limited Weakness';
}
function classifyGapType(finding) {
  const t = (finding || '').toLowerCase();
  if (/refut|not\s+(?:yet\s+)?(?:fully\s+)?implement|not\s+implement/.test(t)) return 'missing_implementation';
  if (/draft|placeholder|tbd|to be/.test(t)) return 'incomplete_policy';
  if (/concept\s+coverage|missing:/.test(t)) return 'missing_evidence';
  if (/contradict|self-contradictory/.test(t)) return 'contradictory_evidence';
  if (/stuffed|keyword/.test(t)) return 'missing_evidence';
  if (/odp|unresolved/.test(t)) return 'incomplete_policy';
  if (/temporal|stale|cadence|sla/.test(t)) return 'temporal_gap';
  return 'other_gap';
}


// The remediation a reviewer reads under the finding. One generic sentence
// ("review the listed gaps and supply evidence") told an assessor nothing they
// did not already know from the verdict; this names the specific thing the
// evidence is missing, per gap type, using what the gates actually measured.
function recommendationFor(gapType, controlId, coverage, odp, temporalConcerns, refutations, contradictions) {
  const uncovered = (coverage && coverage.uncovered || []).slice(0, 4);
  const missingOdps = (odp && odp.missing || []).slice(0, 3);
  switch (gapType) {
    case 'missing_implementation':
      return 'The evidence states or implies that ' + controlId + ' is not (yet) implemented. Implement the control, then replace the statement with a description of the implemented mechanism and the date it took effect.';
    case 'contradictory_evidence':
      return 'The evidence for ' + controlId + ' contradicts itself' + (refutations && refutations.length ? ' (' + refutations.length + ' refuting statement' + (refutations.length === 1 ? '' : 's') + ')' : '') + '. Reconcile the conflicting statements so one implementation description stands, and cite the document that is authoritative.';
    case 'incomplete_policy':
      if (missingOdps.length) {
        return 'Define the organization-defined parameter' + (missingOdps.length === 1 ? '' : 's') + ' the objective depends on — ' + missingOdps.join('; ') + ' — with a concrete value in the SSP, then cite the policy that sets it.';
      }
      return 'The evidence for ' + controlId + ' still carries draft or placeholder language. Replace it with the final, approved text and record the approval date.';
    case 'temporal_gap':
      return 'Refresh the dated evidence for ' + controlId + (temporalConcerns && temporalConcerns.length ? ' (' + temporalConcerns[0] + ')' : '') + ': supply the most recent review, scan, or exercise record with its date, or document the cadence that keeps it current.';
    case 'missing_evidence':
    default:
      if (uncovered.length) {
        return 'Add to the ' + controlId + ' implementation statement an explicit description of: ' + uncovered.join(', ') + '. Cite the section or document where each is defined.';
      }
      return 'Supply evidence that addresses the objective text for ' + controlId + ' directly, with a traceable reference (document, section, date).';
  }
}

// ════════════════════════════════════════════════════════
// SINGLE DIF ASSESSMENT (7-gate pipeline)
// ════════════════════════════════════════════════════════

function assessDif(dif, retriever, controlId, controlTitle, familyName, refutationIdx, assessmentDate) {
  // The four temporal gates each used to default to `new Date()`, so identical
  // evidence produced different verdicts on different days. The date is run
  // context: the caller's, or none — never the clock, and never a date read
  // out of the evidence being tested (that would let a stale package pass
  // its own cadence gate). Reported on every result so a verdict can be
  // reproduced from its own output.
  const asOf = assessmentDate || null;
  const asOfSource = asOf ? 'supplied' : 'none';
  // '' rather than a throw if a caller hands in an unparseable date.
  const asOfDay = (asOf && !isNaN(asOf)) ? asOf.toISOString().slice(0, 10) : '';
  const query = dif.t + ' ' + controlTitle + ' ' + familyName;
  const hits = retriever.query(query, 8, controlId);
  const strongHits = hits.filter(h => h.score >= MIN_EVIDENCE_SCORE);
  const gates = [];

  // Gate 1: Evidence Presence
  let evidenceText = strongHits.map(h => h.text).join('\n\n');
  if (!strongHits.length || !evidenceText.trim()) {
    return {
      dif_id: dif.i, control_id: controlId, objective_id: dif.i,
      status: 'Not Reviewed', determination: 'Not Reviewed',
      finding: 'No relevant evidence found',
      evidence_description: '', evidence_references: [],
      weakness_name: 'Not Reviewed — No Evidence',
      weakness_description: 'No evidence above the relevance threshold for objective ' + dif.i,
      weakness_type: 'Informational',
      likelihood_before: 'Low', impact_before: 'Low', risk_exposure_before: 'Low',
      risk_statement: 'Cannot verify control implementation without supporting evidence.',
      recommendation: 'Upload SSP, policy, or procedure documents covering this objective.',
      proposed_remediation: 'Provide documentation that addresses the DIF objective text.',
      assessment_method: 'EXAMINE',
      assessment_date: asOfDay,
      assessment_date_source: asOfSource,
      confidence: 0, defensibility_score: 0, concept_coverage: 0,
      gap_description: 'No evidence above the relevance threshold for this objective',
      // The status gate is recorded even when adjudication stops at gate 1, so
      // every result carries its determination gate.
      gates: [{gate:1, name:'Presence', pass:false}, {gate:7, name:'Status', pass:false}]
    };
  }
  gates.push({gate:1, name:'Presence', pass:true});

  // Homoglyph folding (homoglyph defense) — before any pattern matching
  evidenceText = foldHomoglyphs(evidenceText);

  // Scope subsequent gates to chunks tagged with this control ID where possible.
  // When the corpus has no chunk tagged with this control ID, ownEvidence is
  // empty and the gates below fall back to the full relevance-ranked evidence
  // (the `ownEvidence || evidenceText` pattern) — untagged-but-relevant
  // evidence is still assessed rather than forced to "Not Reviewed".
  const ownHits = strongHits.filter(h => (h.control_ids || []).includes(controlId));
  // Folded too. `evidenceText` was folded above but `ownEvidence` was built
  // from the raw chunk text, and every gate below reads it first through the
  // `ownEvidence || evidenceText` pattern — so whenever the corpus HAD a chunk
  // tagged with this control (the normal case) the homoglyph defense was reading
  // the unfolded string and a homoglyph-obfuscated draft marker, stuffing
  // pattern or refutation walked straight through. Confirmed end to end: the
  // same evidence with `placeholder` spelled in Cyrillic homoglyphs took the
  // verdict from Other Than Satisfied to Satisfied.
  const ownEvidence = foldHomoglyphs(ownHits.map(h => h.text).join('\n\n'));

  const gaps = [];

  // Gate 2: Concept Coverage
  const concepts = extractConcepts(dif.t);
  if (concepts.length === 0 && dif.t.trim().length > 0) {
    gates.push({gate:2, name:'Concepts', pass:false});
    gaps.push('DIF text yields zero extractable concepts — cannot verify coverage');
  } else {
    const coverage = checkCoverage(concepts, evidenceText);
    var coverageResult = coverage;
    const g2pass = concepts.length === 0 || coverage.ratio >= MIN_CONCEPT_COVERAGE;
    gates.push({gate:2, name:'Concepts', pass:g2pass});
    if (!g2pass) gaps.push('Concept coverage ' + Math.round(coverage.ratio*100) + '% (need 40%); missing: ' + coverage.uncovered.join(', '));
  }
  if (typeof coverageResult === 'undefined') coverageResult = {ratio: 0, uncovered: [], covered: []};

  // Gate 3: Evidence Strength
  const strength = scoreEvidence(evidenceText);
  const g3pass = strength.tier !== 'weak' && strength.tier !== 'unknown';
  gates.push({gate:3, name:'Strength', pass:g3pass});
  if (!g3pass) gaps.push('Evidence strength: ' + strength.tier + ' — no traceable references');

  // Gate 3b: Stuffing — check own-control evidence, not cross-control BM25 results
  const stuffed = evidenceLooksStuffed(ownEvidence || evidenceText);
  if (stuffed) { gates.push({gate:'3b', name:'Stuffing', pass:false}); gaps.push('Evidence appears keyword-stuffed'); }

  // Gate 4: ODP Validation
  const odp = validateOdps(dif.t, evidenceText);
  gates.push({gate:4, name:'ODP', pass:odp.satisfied});
  if (!odp.satisfied) gaps.push('Unresolved ODPs: ' + odp.missing.join(', '));

  // Gate 5: Refutation & Contradiction
  // 5a: Check local refutations on own-control evidence only.
  //     For multi-control chunks, only flag refutations near this control's section.
  const refutations = detectRefutationsScoped(ownEvidence || evidenceText, controlId);
  // 5a': Check full-corpus refutation index (already scoped by proximity)
  const corpusRefutations = (refutationIdx && refutationIdx[controlId]) || [];
  const allRefutations = [...new Set([...refutations, ...corpusRefutations])];

  if (allRefutations.length) {
    const defScore = scoreDefensibility(evidenceText, coverageResult.ratio, strength, true, true);
    const gapType = 'missing_implementation';
    const lk = likelihoodFor(coverageResult.ratio, strength.tier);
    const imp = impactFor([gapType]);
    gates.push({gate:5, name:'Refutation', pass:false});
    gates.push({gate:7, name:'Status', pass:false});
    // Quote the passage that carries the refuting statement — a reader
    // checking the finding should see the sentence the gate reacted to, not
    // the first 500 characters of whatever ranked highest.
    const where = locatePhrase(retriever, evidenceText, allRefutations[0]);
    const refRefs = strongHits.slice(0,3).map(h => h.filename);
    if (where.filename && !refRefs.includes(where.filename)) refRefs.unshift(where.filename);
    return {
      dif_id: dif.i, control_id: controlId, objective_id: dif.i,
      status: 'Other Than Satisfied', determination: 'Other Than Satisfied',
      finding: 'Refuting evidence found: ' + allRefutations[0],
      evidence_description: where.excerpt || evidenceText.slice(0, 500), evidence_references: refRefs,
      weakness_name: 'Control Not Implemented — ' + controlId,
      weakness_description: 'Evidence contains explicit negative status: ' + allRefutations.join('; '),
      weakness_type: 'Significant Deficiency',
      likelihood_before: lk, impact_before: imp, risk_exposure_before: calcRiskExposure(lk, imp),
      risk_statement: 'Control objective ' + dif.i + ' is explicitly marked as not implemented in the evidence.',
      recommendation: 'The evidence for ' + controlId + ' states "' + allRefutations[0] + '". Implement the control, then replace that statement with a description of the implemented mechanism and the date it took effect.',
      proposed_remediation: 'Address the implementation gap: ' + allRefutations[0],
      assessment_method: 'EXAMINE',
      assessment_date: asOfDay,
      assessment_date_source: asOfSource,
      confidence: computeConfidence('Other Than Satisfied', evidenceText, strength, coverageResult.ratio, defScore, 1),
      defensibility_score: defScore, concept_coverage: coverageResult.ratio,
      gap_description: 'Evidence contains explicit negative status: ' + allRefutations.join('; '),
      gates
    };
  }
  const contradictions = detectContradictions(ownEvidence || evidenceText);
  if (contradictions.length) { gates.push({gate:5, name:'Contradiction', pass:false}); gaps.push('Self-contradictory evidence'); }
  else gates.push({gate:5, name:'Contradiction', pass:true});

  // Gate 5b: Draft/Placeholder — scope to own-control evidence
  const drafts = detectDraftPlaceholders(ownEvidence || evidenceText);
  if (drafts.length) { gates.push({gate:'5b', name:'Draft', pass:false}); gaps.push('Draft markers: ' + drafts.join(', ')); }

  // Gate 6: Temporal — use own-control evidence to avoid cross-control date bleed
  const temporalText = ownEvidence || evidenceText;
  const dates = extractDates(temporalText);
  let g6pass = false;
  const g6concerns = [];
  if (!asOf) {
    // Indeterminate, and fail closed: currency, cadence, future-dating and
    // SLA age are all relative to an assessment date nobody supplied.
    g6concerns.push('no assessment date supplied — evidence currency cannot be verified');
  } else {
    const currency = checkCurrency(dates, asOf);
    g6pass = currency.isCurrent;
    if (!currency.isCurrent) g6concerns.push(currency.concerns[0] || 'no current dates');

    // Gate 6b: Scan Cadence (FedRAMP ConMon 30-day)
    const cadenceIssue = checkScanCadence(dates, asOf);
    if (cadenceIssue) { g6pass = false; g6concerns.push(cadenceIssue); }

    // Gate 6c: Future Date Fabrication
    const futureDateIssue = checkFutureDates(dates, asOf);
    if (futureDateIssue) { g6pass = false; g6concerns.push(futureDateIssue); }

    // Gate 6d: Open Finding SLA
    const slaIssue = checkOpenFindingSla(temporalText, asOf);
    if (slaIssue) { g6pass = false; g6concerns.push(slaIssue); }
  }

  gates.push({gate:6, name:'Temporal', pass:g6pass});
  if (!g6pass) gaps.push(...g6concerns.map(c => 'Temporal: ' + c));

  // Gate 7: Determination. The status gate is a gate like the other six — it
  // is recorded on the result so a consumer counting `gates` sees the same
  // seven the finding text names ("All 7 gates passed"), and a per-gate
  // tally has a real denominator for gate 7 (every objective that reached
  // it) instead of zero. It passes exactly when every prior gate passed.
  const allPassed = gates.every(g => g.pass);
  gates.push({gate:7, name:'Status', pass:allPassed});
  const defScore = scoreDefensibility(evidenceText, coverageResult.ratio, strength, dates.length > 0, contradictions.length > 0);
  const determination = allPassed ? 'Satisfied' : 'Other Than Satisfied';
  const conf = computeConfidence(determination, evidenceText, strength, coverageResult.ratio, defScore, contradictions.length);
  const evRefs = strongHits.slice(0,3).map(h => h.filename).filter((v,i,a) => a.indexOf(v)===i);

  const result = {
    dif_id: dif.i, control_id: controlId, objective_id: dif.i,
    status: determination, determination: determination,
    finding: allPassed ? 'All 7 gates passed' : gaps[0] || 'Gate failure',
    evidence_description: evidenceText.slice(0, 500),
    evidence_references: evRefs,
    assessment_method: 'EXAMINE',
    assessment_date: asOfDay,
    assessment_date_source: asOfSource,
    confidence: conf,
    defensibility_score: defScore,
    concept_coverage: coverageResult.ratio,
    evidence_strength: strength.tier,
    temporal_status: !asOf ? 'indeterminate' : g6pass ? 'current' : 'stale',
    gap_description: gaps.join('; ') || '',
    gates
  };

  if (allPassed) {
    result.assessor_notes = 'Deterministic mode — all 7 gates passed. Strength: ' + strength.tier + ', coverage: ' + Math.round(coverageResult.ratio*100) + '%.';
  } else {
    const gapType = classifyGapType(gaps[0] || '');
    const gapTypes = [gapType];
    const lk = likelihoodFor(coverageResult.ratio, strength.tier);
    const imp = impactFor(gapTypes);
    result.weakness_name = gapType.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) + ' — ' + controlId;
    result.weakness_description = gaps.join('; ');
    result.weakness_type = weaknessTypeFor(gapTypes);
    result.likelihood_before = lk;
    result.impact_before = imp;
    result.risk_exposure_before = calcRiskExposure(lk, imp);
    result.risk_statement = 'Control objective ' + dif.i + ' is not fully verified; ' + (coverageResult.uncovered || []).length + ' concept(s) missing from evidence.';
    result.mitigating_factors = coverageResult.covered && coverageResult.covered.length ? 'Partial evidence present; review surfaced chunks manually to confirm.' : '';
    result.recommendation = recommendationFor(gapType, controlId, coverageResult, odp, g6concerns, allRefutations, contradictions);
    result.proposed_remediation = (coverageResult.uncovered || []).length ? 'Provide documentation covering: ' + (coverageResult.uncovered || []).slice(0,5).join(', ') + '.' : 'Provide stronger evidence or resolve ODP parameters.';
    result.assessor_notes = 'Deterministic mode — gates failed: ' + gates.filter(g => !g.pass).length + '; coverage: ' + Math.round(coverageResult.ratio*100) + '%; strength: ' + strength.tier + '.';
  }

  return result;
}

global.SparkAEEngine = {
  BM25Retriever: BM25Retriever,
  assessDif: assessDif,
  buildRefutationIndex: buildRefutationIndex,
  parseFile: parseFile,
  parseZip: parseZip,
  parseDocx: parseDocx,
  unzip: unzip,
  chunkText: chunkText,
  tokenize: tokenize,
  extractControlIds: extractControlIds,
  grade: grade,
  extractDates: extractDates,
  classifyGapType: classifyGapType,
  recommendationFor: recommendationFor,
  scoreDefensibility: scoreDefensibility,
  computeConfidence: computeConfidence,
  calcRiskExposure: calcRiskExposure,
  likelihoodFor: likelihoodFor,
  impactFor: impactFor,
  weaknessTypeFor: weaknessTypeFor,
};

})(typeof window !== "undefined" ? window : this);
