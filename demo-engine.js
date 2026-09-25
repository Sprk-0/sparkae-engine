/* ═══════════════════════════════════════════════════════════════════
   SparkAE demo engine — the deterministic 7-gate assessor, in-browser.

   This is the real adjudication path, not a narrative: BM25 retrieval over
   the uploaded corpus, concept extraction and coverage, evidence strength
   scoring, ODP resolution, refutation and contradiction detection, temporal
   coherence (staleness, scan cadence, future-dating, open-finding SLA), then
   confidence and defensibility scoring. It mirrors the server-side assessor;
   DIF texts come from demo-standalone-catalog.js, which mirrors
   src/catalog/controls.py in the private product repository.

   Extracted verbatim from the previous single-file demo so the same engine can
   back more than one page and can be reviewed as source rather than as a blob.
   Everything is wrapped in an IIFE and published under one global, because the
   demo shell defines its own fmtBytes/classifyFile/grade and a bare top-level
   `const` redeclaration across two classic scripts is a hard SyntaxError that
   would take the whole page down.

   Pure logic — no DOM access, no network, no clock. The verdict path never
   reads the wall clock: assessDif REQUIRES an assessment date (a Date) and
   throws without one, the four temporal gates receive that date rather than
   reaching for `new Date()` themselves, and every result reports the date it
   was assessed against as `assessment_date`. The caller decides the date —
   the demo page pins one for the bundled sample and shows an editable
   assessment-date field for uploads — so the reproducibility tuple is
   explicit: engine version + catalog digest + ruleset digest + evidence
   digest + assessment date → the same verdicts, on any machine, on any day.
   Determinism is a product guarantee (repo rule 6): same corpus in, same
   verdicts out. Do not introduce Date.now(), new Date() with no arguments,
   Math.random(), or iteration that depends on object key order below.

   Gate model (canonical, seven top-level gates — each result's `gates`
   array holds one record per gate reached, in order, and nothing else):
     1 Presence       evidence above the relevance threshold exists
     2 Concepts       concept coverage of the objective text
     3 Strength       traceable references (3a) and no keyword stuffing (3b)
     4 ODP            organization-defined parameters resolved
     5 Contradiction  no refutation (5a), no self-contradiction (5b),
                      no draft/placeholder markers (5c)
     6 Temporal       currency (6a), scan cadence (6b), no future-dated
                      claims (6c), open-finding SLA (6d)
     7 Determination  Satisfied only if gates 1–6 all passed
   Sub-checks are nested under their gate as `checks: [{id, name, pass}]`;
   they never appear as top-level gate records, so `gates.length` is at most
   7 and a Satisfied result always carries exactly seven passing records.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';


const BM25_K1 = 1.5, BM25_B = 0.75, CONTROL_ID_BOOST = 3.0;
// Function words: prepositions, determiners and conjunctions. Not what a
// sentence is about, in a query or in an objective. "notified within [time
// period] when accounts are no longer required" is about notification and
// accounts; `within` and `when` used to count as two of its distinguishing
// terms, and a concept needs two of them now.
const STOP_WORDS = new Set(['a','an','and','are','as','at','be','by','for','from','has','have','in','is','it','its','of','on','or','that','the','this','to','was','were','will','with','we','they','their','if','but','so','than',
  'within','when','each','before','after','other','least','more','upon','into','onto','over','under','about','between','among','through','during','without','while','where','which','whose','these','those','such','only','also','both','either','neither','via','per','any','all','once','then','there','here','been','being','would','should','could','may','might','must','shall','can','does','did','do']);
const TOKEN_RE = /[A-Za-z][A-Za-z0-9_-]{1,}/g;

function tokenize(text) {
  if (!text) return [];
  return (text.match(TOKEN_RE) || []).map(t => t.toLowerCase()).filter(t => !STOP_WORDS.has(t) && t.length >= 2);
}

class BM25Retriever {
  constructor(chunks) {
    // Every chunk stays in `chunks`, which the refutation index reads. A chunk
    // marked refute_only (a DOCX's hidden text) is not evidence: it is
    // tokenized as empty, so it adds nothing to the collection statistics and
    // no query can score it — a corpus without one ranks exactly as before.
    this.chunks = chunks;
    this._tokenized = chunks.map(c => c.refute_only ? [] : tokenize(c.text || ''));
    this._docFreqs = this._tokenized.map(toks => {
      const f = {}; toks.forEach(t => f[t] = (f[t]||0)+1); return f;
    });
    this._docLens = this._tokenized.map(t => t.length);
    const n = chunks.filter(c => !c.refute_only).length || 1;
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

  // The share of the query's distinct stems that a chunk names. This is the
  // `score` a hit reports and the number gate 1 thresholds, and it is absolute:
  // a chunk naming two of an objective's twelve terms scores 0.17 whether it is
  // the only chunk in the corpus or one of a thousand.
  //
  // The previous score was BM25 min-maxed against the best hit, so the best hit
  // was always 1.0 and a corpus of one chunk cleared MIN_EVIDENCE_SCORE with
  // any sentence at all. Ranking is still BM25 — that is what it is good at —
  // but a rank is not a relevance, and the threshold needs a relevance.
  _coverage(qstems, idx) {
    if (!qstems.size) return 0;
    const have = this._stems[idx];
    let n = 0;
    qstems.forEach(st => { if (have.has(st)) n++; });
    return n / qstems.size;
  }

  query(queryText, topK = 8, controlId = null) {
    // "Determine if" opens every objective and names nothing about it.
    const qtokens = tokenize(String(queryText || '').replace(/^\s*Determine\s+if\s+/i, ''));
    if (!qtokens.length || !this.chunks.length) return [];
    if (!this._stems) this._stems = this._tokenized.map(toks => new Set(toks.map(stemWord)));
    const qstems = new Set(qtokens.map(stemWord));
    let scored = this.chunks.map((_, i) => [this._score(qtokens, i), i]);
    if (controlId) {
      // A chunk tagged with the control ranks above an untagged one that scored
      // the same — never above one that scored more than nothing. The boost
      // used to lift a tagged chunk with a raw score of ZERO to three times the
      // best raw score, so eight "See AC-2" cross-references outranked the one
      // untagged paragraph that answered the objective and pushed it out of
      // the top K. A chunk that shares no term with the objective is not
      // evidence for it, tagged or not.
      scored = scored.map(([raw, idx]) => {
        const ids = this.chunks[idx].control_ids || [];
        return ids.includes(controlId) && raw > 0 ? [raw * CONTROL_ID_BOOST, idx] : [raw, idx];
      });
    }
    scored = scored.filter(s => s[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    if (!scored.length) return [];
    scored = scored.slice(0, topK);
    return scored.map(([raw, idx]) => ({...this.chunks[idx],
      score: Math.round(this._coverage(qstems, idx) * 10000) / 10000,
      bm25: Math.round(raw * 10000) / 10000}));
  }
}

// ════════════════════════════════════════════════════════
// DOCUMENT PARSING (in-browser)
// ════════════════════════════════════════════════════════

// A control id ends where a word ends, and the enhancement suffix is part of
// the id: "AC-2(1)" is a control of its own, not a mention of AC-2.
//
// The pattern used to close with `\b`, which asserts a word boundary — and `)`
// is not a word character, so after "AC-2(1)" the boundary only existed when a
// word character followed. "AC-2(1) is implemented", "AC-2(1)," and "AC-2(1)"
// at the end of a line all failed it, the optional group was given back, and
// the match came out as the BASE control "AC-2". Only the nonsense case,
// "AC-2(1)x", produced the enhancement. 232 of the catalog's 447 keys are
// enhancements, so those controls were never tagged on a chunk, never had own
// evidence, and every gate that reads a control's own text fell through to the
// retrieval union for half the catalog.
//
// The close is now a negative lookahead instead. `\w` keeps "AC-2" out of
// "AC-2abc" the way `\b` did; `(` refuses a base id that an enhancement suffix
// follows, so backtracking can never turn "AC-2(1)" into "AC-2" — a malformed
// "AC-2(1)x" yields nothing at all, which is the fail-closed direction.
//
// One pattern serves both readers. They are the same id in two places, and
// keeping two literals is how they drift apart.
const CONTROL_ID_RE = /\b[A-Z]{2}-\d{1,3}(?:\.\d+)?(?:\(\d+\))?(?![\w(])/g;
const VALID_FAMILIES = new Set(['AC','AT','AU','CA','CM','CP','IA','IR','MA','MP','PE','PL','PM','PS','PT','RA','SA','SC','SI','SR']);

// Every id the chunk names, however many. There used to be a cap of 50, and
// the ids past it were dropped from the tag set: a control-status table naming
// sixty controls was tagged with the first fifty, so "SI-6 is not implemented"
// in the same chunk reached no refutation-index entry for SI-6 — the cap failed
// open. Nothing needs the cap: one pass over the text, and a chunk cannot name
// more ids than its length allows.
function extractControlIds(text) {
  const ids = new Set();
  // matchAll rather than exec: a shared global regex carries `lastIndex`
  // between calls, so a loop left part-way through one string would strand the
  // next reader. matchAll runs on its own copy.
  for (const m of String(text).matchAll(CONTROL_ID_RE)) {
    const fam = m[0].split('-')[0];
    if (VALID_FAMILIES.has(fam)) ids.add(m[0]);
  }
  return [...ids];
}

// A heading is one short line that does not end a sentence: "2.2 AC-2: Account
// Management", "1. SYSTEM DESCRIPTION". It names the paragraphs that FOLLOW it.
const HEADING_MAX_CHARS = 100;
function isHeadingPara(para) {
  const t = String(para).trim();
  return t.length > 0 && t.length <= HEADING_MAX_CHARS && !/\n/.test(t) && !/[.!?]$/.test(t) && /[A-Za-z]/.test(t);
}

// Paragraphs are packed into chunks of about maxChunk characters, and a chunk
// is tagged with every control id it names. A heading that lands at the END of
// a chunk — the boundary fell between "2.2 AC-2: Account Management" and its
// body — used to tag the preceding section's text with the next section's id,
// so the engine's "own evidence" for AC-2 was the AC-1 paragraph and AC-2's
// paragraph was AC-3's. That was invisible while the gates read the whole
// retrieval union; once they read a control's own evidence first, section
// attribution decides verdicts, so a trailing heading now opens the next chunk
// rather than closing this one.
function chunkText(text, filename, maxChunk = 800, minChunk = 100) {
  if (!text || !text.trim()) return [];
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  const lenOf = (paras) => paras.reduce((n, p) => n + p.length + 2, 0);
  let cur = [], offset = 0;
  const flush = (paras) => {
    const t = paras.join('\n\n').trim();
    chunks.push({text: t, filename, offset, control_ids: extractControlIds(t)});
    offset += lenOf(paras);
  };
  for (const para of paragraphs) {
    const curLen = lenOf(cur);
    if (curLen + para.length > maxChunk && curLen >= minChunk) {
      const carried = [];
      while (cur.length > 1 && isHeadingPara(cur[cur.length - 1])) carried.unshift(cur.pop());
      flush(cur);
      cur = carried;
    }
    cur.push(para);
  }
  const tail = cur.join('\n\n').trim();
  if (tail.length >= 10) {
    if (chunks.length && tail.length < minChunk) {
      chunks[chunks.length-1].text += '\n' + tail;
      chunks[chunks.length-1].control_ids = extractControlIds(chunks[chunks.length-1].text);
    } else {
      flush(cur);
    }
  }
  return chunks;
}

function unsupported(name, reason) {
  const err = new Error(reason);
  err.code = 'UNSUPPORTED';
  err.filename = name;
  return err;
}

// Parse one uploaded file into evidence chunks. Throws (with `code`) rather
// than returning a placeholder: a parser failure must never quietly shrink
// the evidence set and let the run continue towards a verdict as if the file
// had been read. parsePackage() below is the tolerant wrapper that records
// each refusal and reports it.
// Every uploaded file is capped at the size an archive may expand to. A loose
// .txt, .json or .xml used to be read with file.text() and no limit at all,
// while the same bytes inside a ZIP were refused past 64 MB. The size a File
// reports is checked before a byte is read, so an oversized upload costs
// nothing to refuse.
function refuseOversize(file) {
  if (file && typeof file.size === 'number' && file.size > UPLOAD_MAX_BYTES) {
    throw unsupported(file.name, 'file is ' + (Math.ceil(file.size / 104857.6) / 10).toFixed(1) + ' MB, above the ' + (UPLOAD_MAX_BYTES / 1048576) + ' MB limit for one uploaded file — not read');
  }
}

async function parseFile(file) {
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  refuseOversize(file);
  if (ext === 'txt' || ext === 'md' || ext === 'nessus' || ext === 'xml' || ext === 'json' || ext === 'csv') {
    const text = await file.text();
    if (!text || !text.trim()) throw unsupported(name, 'file is empty');
    return chunkText(markupText(ext, text), name);
  }
  if (ext === 'docx') return await parseDocx(file);
  if (ext === 'zip') return (await parseZipReport(file)).chunks;
  if (SERVER_PRODUCT_EXTENSIONS.includes(ext)) {
    throw unsupported(name, '.' + ext + ' text extraction is not available in the browser build (server product only)');
  }
  if (UNSUPPORTED_EXTENSIONS.includes(ext)) {
    throw unsupported(name, '.' + ext + ' text extraction is not available in this build — supported: ' + SUPPORTED_EXTENSIONS.map(e => '.' + e).join(' '));
  }
  throw unsupported(name, 'unrecognised file type .' + ext + ' — supported: ' + SUPPORTED_EXTENSIONS.map(e => '.' + e).join(' '));
}

// Parse a whole upload. Returns every chunk that was actually read plus an
// explicit account of what was not, so the caller can show the visitor
// "N files parsed · M refused (and why)" instead of a reassuring total.
//
// `members` is the same read, listed: one entry per file or archive member the
// reader saw, carrying its bytes or text (or the reason it has neither) and,
// for an archive member, the archive it came from. It exists so a caller that
// wants an inventory — the demo's upload panel — takes it from THIS read rather
// than unzipping the package a second time on its own. Two reads of one package
// were two chances to disagree about what it contained, and did: the panel
// dropped `__MACOSX` housekeeping members that the engine then read as evidence.
async function parsePackage(files) {
  const chunks = [], parsed = [], skipped = [], members = [];
  for (const f of files) {
    const ext = ((f.name || '').split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'zip') {
        const r = await parseZipReport(f);
        chunks.push(...r.chunks); parsed.push(...r.parsed); skipped.push(...r.skipped);
        for (const m of r.members) members.push(Object.assign({}, m, { path: f.name + '!/' + m.name, fromZip: f.name }));
      } else {
        chunks.push(...await parseFile(f));
        parsed.push(f.name);
        members.push({ name: f.name, path: f.name, size: f.size, file: f, fromZip: null });
      }
    } catch (e) {
      const reason = e && e.message ? e.message : String(e);
      skipped.push({ name: f.name, reason });
      members.push({ name: f.name, path: f.name, size: f.size, file: f, fromZip: null, refusedReason: reason });
    }
  }
  return { chunks, parsed, skipped, members };
}

// The text of a DOCX, from its bytes. A DOCX is a ZIP holding XML, and the
// bytes are all this needs — so the same reader serves a .docx the visitor
// selected and a .docx sitting inside an uploaded package. Taking a buffer
// rather than a File is the whole reason the nested case is now readable.
//
// `budget` is the enclosing archive's remaining expansion allowance, passed in
// for a nested DOCX so that a package of many DOCX members cannot expand past
// the limit one member at a time.
// XML carries a character either literally or as a reference, and the two are
// the same character. This decoded five named references and nothing else, so a
// DOCX or an XML upload could write a refutation as "not&#x200B;implemented",
// "not&nbsp;implemented" or "not&#32;implemented" — text that opens in Word
// reading "not implemented" and reached the gates as the literal source, where
// no pattern matches it.
//
// Numeric references, decimal and hexadecimal, are decoded alongside the five
// names XML defines plus `nbsp`, which is the one HTML name a Word document
// writes often enough to matter. A reference this does not know is left as
// written rather than guessed at.
//
// One pass, and the output is never re-scanned: "&amp;lt;" decodes to "&lt;"
// and stops there, so a reference cannot be smuggled through in an encoded
// form and decoded a second time.
const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const ENTITY_RE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g;

function decodeEntities(text) {
  return String(text).replace(ENTITY_RE, (whole, dec, hex, name) => {
    if (name !== undefined) {
      const known = XML_ENTITIES[name.toLowerCase()];
      return known === undefined ? whole : known;
    }
    const cp = parseInt(dec !== undefined ? dec : hex, dec !== undefined ? 10 : 16);
    // Out of range, or half of a surrogate pair: not a character, so the
    // reference stays as it was written rather than becoming U+FFFD.
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF) return whole;
    if (cp >= 0xD800 && cp <= 0xDFFF) return whole;
    return String.fromCodePoint(cp);
  });
}

// A loose .xml or .nessus upload is read as text, and the same reference
// decoding applies to it: a scanner report that writes "not&#32;implemented"
// says "not implemented". The other text types are left exactly as uploaded —
// an "&amp;" in a .txt, .md, .csv or .json file is five characters the author
// wrote, not a reference to one.
function markupText(ext, text) {
  return (ext === 'xml' || ext === 'nessus') ? decodeEntities(text) : text;
}

// The document as displayed, as a string: what the upload panel scans and what
// docxText has always returned. The run reads docxTexts, which also carries the
// hidden-text document for the refutation index.
async function docxText(buf, label, budget) {
  return (await docxTexts(buf, label, budget)).shown;
}

async function docxTexts(buf, label, budget) {
  // unzip() returns an array, and refuses every member of a name the archive
  // uses twice — a DOCX carrying two word/document.xml is two documents
  // claiming to be one. The refusals come back through `refused` so that a
  // member which is present but unreadable is reported as what it is, rather
  // than as a DOCX with no body at all.
  const refused = [];
  const entries = await unzip(buf, refused, budget);
  const body = entries.find(m => m.name === 'word/document.xml' && !m.directory);
  if (!body) {
    const why = refused.find(r => r.name === 'word/document.xml');
    throw unsupported(label, why ? 'DOCX word/document.xml could not be read: ' + why.reason
                                 : 'DOCX has no word/document.xml');
  }
  const docXml = body.text;
  if (!docXml) throw unsupported(label, 'DOCX has no word/document.xml');

  // Word keeps a document's words in more parts than the body. Only the body
  // used to be read, so "not implemented" in a footnote, a comment or a page
  // header never reached a gate — a refutation the author wrote, dropped by
  // the reader. A part that is present but unreadable refuses the document by
  // name, as the body does: skipping it would read as a document that said
  // nothing there.
  const partUnreadable = refused.find(r => DOCX_NOTE_PARTS.some(p => p.name === r.name) || DOCX_PAGE_PART_RE.test(r.name));
  if (partUnreadable) throw unsupported(label, 'DOCX ' + partUnreadable.name + ' could not be read: ' + partUnreadable.reason);

  // A tracked-changes document carries two documents: the one it says now and
  // the one it used to say. Deleted and moved-away text is the second, and it
  // used to be read as the first — so a claim the author struck through still
  // carried AC-2 to Satisfied. Hidden text is the author's own words, unseen:
  // it may refute a control but never satisfy one. The document as displayed is
  // the evidence; when hidden text exists, the document with it is read again,
  // for refutations only.
  const shown = assembleDocx(docXml, entries, false);
  const withHidden = assembleDocx(docXml, entries, true);
  if (!shown && !withHidden) throw unsupported(label, 'DOCX contains no text');
  return { shown, withHidden: withHidden !== shown ? withHidden : null };
}

function assembleDocx(docXml, entries, keepHidden) {
  // Footnotes, endnotes and comments are read where the body cites them, so a
  // refutation in one belongs to the section that cites it rather than to
  // whichever control the document happens to end on. One the body never
  // cites is still read, after the body.
  let bodyXml = wordRevisionText(docXml, keepHidden);
  const uncited = [];
  for (const part of DOCX_NOTE_PARTS) {
    const member = entries.find(m => m.name === part.name && !m.directory);
    if (!member || !member.text) continue;
    const notes = new Map();
    for (const m of wordRevisionText(member.text, keepHidden).matchAll(part.itemRe)) {
      const id = (m[1].match(/\bw:id="(-?\d+)"/) || [])[1];
      const words = wordXmlRawText(m[2]);
      if (id !== undefined && words) notes.set(id, words);
    }
    const cited = new Set();
    bodyXml = bodyXml.replace(part.refRe, (whole, id) => {
      if (!notes.has(id)) return whole;
      cited.add(id);
      return ' [' + part.label + ': ' + notes.get(id) + '] ';
    });
    for (const [id, words] of notes) if (!cited.has(id)) uncited.push('[' + part.label + ': ' + words + ']');
  }

  // Headers and footers belong to no section. They are read first, where a
  // reader meets them, and once each however many sections repeat them.
  const pageFurniture = [...new Set(entries
    .filter(m => DOCX_PAGE_PART_RE.test(m.name) && !m.directory && m.text)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map(m => {
      const words = wordXmlRawText(wordRevisionText(m.text, keepHidden));
      return words ? '[' + m.name.match(DOCX_PAGE_PART_RE)[1] + ': ' + words + ']' : '';
    })
    .filter(Boolean))];

  return decodeEntities([...pageFurniture, wordXmlLayout(bodyXml), ...uncited].join('\n\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The words a part says now. Tracked deletions (<w:del>, <w:delText>) and text
// moved away (<w:moveFrom>) are dropped; the same elements written
// self-closing only mark a deleted paragraph mark and carry no text, and are
// dropped first so a paired match cannot run from one of them to a later
// close. A run whose properties carry <w:vanish/> is hidden, and is kept only
// when keepHidden is set.
function wordRevisionText(xml, keepHidden) {
  let out = String(xml)
    .replace(/<w:(?:del|moveFrom)\b[^>]*\/>/g, '')
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:moveFrom\b[^>]*>[\s\S]*?<\/w:moveFrom>/g, '')
    .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '');
  if (!keepHidden) out = out.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => HIDDEN_RUN_RE.test(run) ? '' : run);
  return out;
}
// <w:vanish/> hides a run; <w:vanish w:val="0"/> (or false/off) is the explicit
// "not hidden" an inherited style can be overridden with.
const HIDDEN_RUN_RE = /<w:rPr\b[^>]*>(?:(?!<\/w:rPr>)[\s\S])*<w:vanish\b(?![^>]*\bw:val="(?:0|false|off)")[^>]*\/?>/;

// The body keeps its paragraph breaks, which chunking and headings depend on.
function wordXmlLayout(xml) {
  return xml
    .replace(/<w:br[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n\n')
    .replace(/<\/w:r>/gi, ' ')
    .replace(/<[^>]+>/g, '');
}

// A note or a header is set inline, on one line: its own paragraph marks would
// otherwise break the body paragraph that cites it. Entities are left encoded
// here and decoded once, with the body, so nothing is decoded twice.
function wordXmlRawText(xml) {
  return wordXmlLayout(xml).replace(/\s+/g, ' ').trim();
}

const DOCX_NOTE_PARTS = [
  { name: 'word/footnotes.xml', label: 'footnote',
    itemRe: /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g,
    refRe: /<w:footnoteReference\b[^>]*?\bw:id="(-?\d+)"[^>]*\/>/g },
  { name: 'word/endnotes.xml', label: 'endnote',
    itemRe: /<w:endnote\b([^>]*)>([\s\S]*?)<\/w:endnote>/g,
    refRe: /<w:endnoteReference\b[^>]*?\bw:id="(-?\d+)"[^>]*\/>/g },
  { name: 'word/comments.xml', label: 'comment',
    itemRe: /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g,
    refRe: /<w:commentReference\b[^>]*?\bw:id="(-?\d+)"[^>]*\/>/g },
];
const DOCX_PAGE_PART_RE = /^word\/(header|footer)\d*\.xml$/;

// The displayed document is the evidence. The document with its hidden text,
// when it differs, is chunked too and marked refute_only: the retriever never
// returns such a chunk and scores nothing against it, and the refutation index
// reads it like any other.
function docxChunks(texts, name) {
  const chunks = chunkText(texts.shown, name);
  if (texts.withHidden) chunks.push(...chunkText(texts.withHidden, name).map(c => Object.assign(c, { refute_only: true })));
  return chunks;
}

async function parseDocx(file) {
  try {
    return docxChunks(await docxTexts(await file.arrayBuffer(), file.name), file.name);
  } catch(e) {
    if (e && e.code === 'UNSUPPORTED') throw e;
    throw unsupported(file.name, 'DOCX could not be parsed: ' + (e && e.message ? e.message : e));
  }
}

// Minimal ZIP extraction (no external library), read from the central
// directory. Members that cannot be read (an unsupported compression method,
// a deflate stream that does not inflate) are reported through `failures` so
// the caller can list them as refused — a member that vanished silently would
// look like evidence that was never there.
//
// The previous reader walked local file headers and stored members in an
// object keyed by name. That lost two things, both reproduced against real
// archives before this was rewritten.
//
// A name appearing twice silently kept only the last member. An archive whose
// first `review-ssp.txt` recorded that account monitoring is not implemented,
// and whose second asserted the opposite, parsed as one member, reported no
// refusal, and turned Other Than Satisfied into Satisfied. Contradictory
// evidence disappeared without a trace, which is the failure this engine
// exists to make impossible.
//
// A streaming archive records its sizes in a data descriptor AFTER the
// compressed data and leaves zeroes in the local header. Reading those zeroes
// sliced an empty buffer, refused the member as a truncated stream, and then
// advanced the offset by zero bytes — so the scan stopped and the remaining
// members were never seen or reported.
//
// The central directory is the authoritative inventory: it names every member,
// carries the real sizes whatever the local header says, and points at each
// local header. Members come back as an ARRAY so a duplicate name survives to
// be refused rather than silently resolved.
const ZIP_MAX_MEMBERS = 512;
const ZIP_MAX_BYTES = 64 * 1024 * 1024;
const UPLOAD_MAX_BYTES = ZIP_MAX_BYTES;
// Member types a reader parses from bytes rather than from decoded text.
// Decoding these to text destroys them. The engine reads DOCX itself; XLSX is
// a server-product format the engine still refuses for the corpus, but the
// upload panel classifies it, and it can only do that from the bytes.
const BINARY_MEMBER_EXTENSIONS = ['docx', 'xlsx', 'zip'];
const extensionOf = (name) => (name.split('.').pop() || '').toLowerCase();

// `budget` is the archive's remaining expansion allowance, shared across its
// members: a cap applied per member would let a 512-member archive expand to
// 512 times the limit, which is the shape a zip bomb takes.
async function inflateMember(data, method, budget) {
  const spend = (n) => {
    budget.left -= n;
    if (budget.left < 0) throw new Error('the archive expands past the ' + (ZIP_MAX_BYTES / 1048576) + ' MB limit');
  };
  if (method === 0) { spend(data.length); return data; }  // stored
  if (method !== 8) throw new Error('unsupported compression method ' + method);
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // A bad deflate stream rejects these as well as the read below; swallow them
  // here so the rejection surfaces once, through the read loop.
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    spend(value.length);
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  chunks.forEach(c => { out.set(c, pos); pos += c.length; });
  return out;
}

// Scan back for the End of Central Directory record. The comment it may carry
// is at most 65535 bytes, so the record starts within the last 65557.
//
// A signature alone does not make a record. The archive comment sits AFTER the
// EOCD, so a comment that happens to contain the four signature bytes is found
// first by a backward scan — and read as a record, it declares whatever member
// count and directory offset the surrounding comment bytes spell, so a real
// archive parsed as zero members with no refusal shown. The record is the one
// whose own comment-length field carries it exactly to the end of the file.
// Two candidates that both do are an archive that cannot be read unambiguously,
// and it is refused as such rather than resolved by position.
function findEOCD(view, len, failures) {
  const from = Math.max(0, len - 65557);
  const found = [];
  for (let i = len - 22; i >= from; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    if (i + 22 + view.getUint16(i + 20, true) === len) found.push(i);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1 && failures) failures.push({ name: '(archive)', reason: 'archive carries ' + found.length + ' self-consistent end-of-central-directory records — ambiguous, so it is not read' });
  return -1;
}

// CRC-32 (IEEE 802.3), the checksum every ZIP member carries. The central
// directory records it over the member's UNCOMPRESSED bytes, and a reader that
// never compares it will hand a corrupted member — a truncated upload, a bit
// flip in transit, a stored member somebody edited in place — to the engine as
// evidence. Nothing here is security material; it is the archive's own
// statement of what its members should inflate to, checked.
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// A member name is UTF-8 when general-purpose bit 11 says so, and IBM code page
// 437 when it does not — the ZIP specification's default, and what Windows'
// built-in archiver writes. Names used to be decoded as UTF-8 regardless, so
// "Système.docx" from such an archive became "Syst�me.docx". Many writers
// also emit UTF-8 without setting the bit, so a name whose bytes are valid
// UTF-8 is read as UTF-8; only a name that is not falls back to CP437. Pure
// ASCII reads the same either way.
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
  '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0';
function zipName(raw, flags) {
  if (flags & 0x0800) return new TextDecoder().decode(raw);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch (e) { return Array.from(raw, b => b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80]).join(''); }
}

// `budget` is optional: a nested archive is handed the enclosing archive's
// remaining allowance, so a package of many DOCX members cannot expand past the
// limit one member at a time. Omitted, an archive gets a fresh allowance.
async function unzip(buffer, failures, sharedBudget) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const members = [];
  const budget = sharedBudget || { left: ZIP_MAX_BYTES };
  const eocdFailures = [];
  const eocd = findEOCD(view, bytes.length, eocdFailures);
  if (eocd < 0) {
    if (failures) failures.push(eocdFailures[0] || { name: '(archive)', reason: 'no ZIP central directory found — the file is not a ZIP, or is truncated' });
    return members;
  }
  const count = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);
  // A split (spanned) archive is one of several files, and its offsets point
  // into the others. It used to be read as though it were whole — members that
  // live on another disk read as whatever bytes sat at that offset here. The
  // record says which disk this is, which disk the directory starts on, and how
  // many of the members are on this one; a single-disk archive says 0, 0, all.
  const diskNo = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const onThisDisk = view.getUint16(eocd + 8, true);
  if (diskNo !== 0 || cdDisk !== 0 || onThisDisk !== count) {
    if (failures) failures.push({ name: '(archive)', reason: 'archive is split across disks (disk ' + diskNo + ', directory on disk ' + cdDisk + ', ' + onThisDisk + ' of ' + count + ' members here) — a split archive is not read; join it into one file' });
    return members;
  }
  if (count > ZIP_MAX_MEMBERS) {
    if (failures) failures.push({ name: '(archive)', reason: 'archive declares ' + count + ' members, above the ' + ZIP_MAX_MEMBERS + ' limit' });
    return members;
  }
  // Pass one is the inventory, and nothing else. Names are counted from the
  // central directory itself, before a single member is read, because a count
  // taken after reading is a count of the members that happened to succeed: if
  // one of two members named review-ssp.txt fails to inflate, the other looks
  // unique and gets parsed, which is the behaviour this reader exists to stop.
  // The expansion budget would make it worse — whether a duplicate survives
  // would depend on how large its predecessors were.
  const entries = [];
  const nameCount = Object.create(null);
  for (let i = 0; i < count; i++) {
    if (cd + 46 > bytes.length || view.getUint32(cd, true) !== 0x02014b50) {
      if (failures) failures.push({ name: '(archive)', reason: 'central directory ends after ' + i + ' of ' + count + ' declared members' });
      break;
    }
    const nameLen = view.getUint16(cd + 28, true);
    const extraLen = view.getUint16(cd + 30, true);
    const commentLen = view.getUint16(cd + 32, true);
    const flags = view.getUint16(cd + 8, true);
    const name = zipName(bytes.slice(cd + 46, cd + 46 + nameLen), flags);
    entries.push({
      name,
      flags,
      startDisk: view.getUint16(cd + 34, true),
      method: view.getUint16(cd + 10, true),
      crc: view.getUint32(cd + 16, true),
      compSize: view.getUint32(cd + 20, true),
      localAt: view.getUint32(cd + 42, true),
    });
    if (!name.endsWith('/')) nameCount[name] = (nameCount[name] || 0) + 1;
    cd += 46 + nameLen + extraLen + commentLen;
  }

  // Pass two reads what the inventory says is unambiguous.
  for (const { name, flags, startDisk, method, crc, compSize, localAt } of entries) {
    if (name.endsWith('/')) { members.push({ name, text: '', directory: true }); continue; }
    // Two members of one name are two documents claiming to be the same one.
    // Reading either is a guess about which the author meant, and the two may
    // contradict each other, so neither is read and both are named.
    if (nameCount[name] > 1) {
      if (failures) failures.push({ name, reason: 'archive carries ' + nameCount[name] + ' members named this — ambiguous, so none of them is read' });
      continue;
    }
    // An encrypted member's bytes are ciphertext. It used to fail as "could not
    // be inflated", which sends the assessor looking for corruption; it is
    // refused as what it is. Bit 0 is traditional encryption, method 99 WinZip
    // AES (which sets bit 0 too, but not every writer does).
    if ((flags & 0x0001) || method === 99) {
      if (failures) failures.push({ name, reason: 'archive member is encrypted — the browser build takes no password, so it is not read' });
      continue;
    }
    if (startDisk !== 0) {
      if (failures) failures.push({ name, reason: 'archive member starts on disk ' + startDisk + ' of a split archive — not read' });
      continue;
    }
    // 0xFFFFFFFF is the ZIP64 sentinel; the real value lives in an extra field
    // this reader does not parse. Refuse it rather than read the sentinel.
    if (compSize === 0xFFFFFFFF || localAt === 0xFFFFFFFF) {
      if (failures) failures.push({ name, reason: 'ZIP64 archive members are not read in the browser build' });
      continue;
    }
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) {
      if (failures) failures.push({ name, reason: 'central directory points at no local header for this member' });
      continue;
    }
    // Name and extra lengths are read from the LOCAL header: the two records
    // may carry different extra fields, and the data begins after the local one.
    const lNameLen = view.getUint16(localAt + 26, true);
    const lExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    if (dataAt + compSize > bytes.length) {
      if (failures) failures.push({ name, reason: 'archive member extends past the end of the file' });
      continue;
    }
    try {
      const raw = await inflateMember(bytes.slice(dataAt, dataAt + compSize), method, budget);
      // The directory says what these bytes should sum to. A member that does
      // not is corrupt somewhere between the writer and here, and corrupt bytes
      // decoded to text are not the document — they are refused by name.
      const got = crc32(raw);
      if (got !== crc) {
        if (failures) failures.push({ name, reason: 'archive member failed its CRC-32 check (directory ' + crc.toString(16).padStart(8, '0') + ', content ' + got.toString(16).padStart(8, '0') + ') — corrupt, so it is not read' });
        continue;
      }
      // A member is either text or bytes, never both. A binary member's reader
      // parses the bytes — decoding it to a string would destroy it anyway —
      // so decoding it here would spend the time and hold a second copy of the
      // member for a string nothing ever reads.
      members.push(BINARY_MEMBER_EXTENSIONS.indexOf(extensionOf(name)) !== -1
        ? { name, bytes: raw }
        : { name, text: new TextDecoder().decode(raw) });
    } catch (e) {
      if (failures) failures.push({ name, reason: 'archive member could not be inflated: ' + ((e && (e.message || (e.cause && e.cause.message))) || String(e)) });
    }
  }
  return members;
}

// Members an archiver writes about itself: macOS resource forks under
// __MACOSX/, Finder and Explorer metadata. They are not documents, and read as
// text they are binary noise with a .txt name — noise the retriever then ranked
// as evidence. Refused with a reason, so the inventory lists them as what they
// are rather than dropping them in one reader and reading them in another.
const ARCHIVE_HOUSEKEEPING_RE = /(?:^|\/)(?:__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._[^/]*$)/i;

// An archive inside the package is read like the package: its members join the
// corpus under the path that reaches them ("ssp.zip!/SSP.docx"), against the
// same byte allowance and the same member allowance as everything else in the
// package. A nested .zip used to fall to the unsupported branch, so a package
// whose SSP was delivered as ssp.zip was assessed without its SSP. Nesting is
// bounded: the package is level 1, and a member at ZIP_MAX_DEPTH is refused
// rather than opened, as is every member past ZIP_MAX_MEMBERS across all levels
// — a package of 512 small archives of 512 members each is not 512 members.
const ZIP_MAX_DEPTH = 3;

async function parseZipReport(file) {
  refuseOversize(file);
  const buf = await file.arrayBuffer();
  // One allowance for the package and everything nested inside it.
  const state = { chunks: [], parsed: [], skipped: [], members: [], budget: { left: ZIP_MAX_BYTES }, seen: 0 };
  const unzipFailures = [];
  const raw = await unzip(buf, unzipFailures, state.budget);
  state.skipped.push(...unzipFailures);
  await readArchiveMembers(raw, '', 1, state);
  // What unzip() itself refused — duplicates, bad streams, a broken directory —
  // is listed too, so the inventory and the refusal list are one account.
  for (const f of unzipFailures) state.members.push({ name: f.name === '(archive)' ? file.name : f.name, refusedReason: f.reason });
  const { chunks, parsed, skipped, members } = state;
  if (!parsed.length && !skipped.length) throw unsupported(file.name, 'ZIP contains no readable members');
  return { chunks, parsed, skipped, members };
}

async function readArchiveMembers(raw, prefix, depth, state) {
  const { chunks, parsed, skipped, members, budget } = state;
  const refuse = (name, reason, extra) => {
    skipped.push({ name, reason });
    members.push(Object.assign({ name, refusedReason: reason }, extra || {}));
  };
  // unzip() has already refused every member of an ambiguous name, counted from
  // the central directory, so everything here is a member the archive names
  // once. Member order is the archive's own order, fixed for a given file.
  for (const { name: memberName, text: content, bytes, directory } of raw) {
    if (directory) continue;
    const name = prefix + memberName;
    const size = bytes ? bytes.length : (content ? content.length : 0);
    if (++state.seen > ZIP_MAX_MEMBERS) { refuse(name, 'package holds more than ' + ZIP_MAX_MEMBERS + ' members across its nested archives — not read', { size }); continue; }
    if (ARCHIVE_HOUSEKEEPING_RE.test(memberName)) { refuse(name, 'archive housekeeping member (__MACOSX, .DS_Store, Thumbs.db) — not a document, so it is not read', { size }); continue; }
    const ext = (memberName.split('.').pop() || '').toLowerCase();
    if (['xml', 'txt', 'md', 'csv', 'json', 'nessus'].includes(ext)) {
      if (content && content.trim()) { chunks.push(...chunkText(markupText(ext, content), name)); parsed.push(name); members.push({ name, size, text: content }); }
      else refuse(name, 'archive member is empty', { size, text: content || '' });
    } else if (ext === 'docx') {
      // A DOCX inside a package is the ordinary shape of a real submission: the
      // SSP is a Word file and the package is a ZIP. Refusing it meant the one
      // document the assessment most depends on was the one excluded, so a run
      // reached Complete having read the README and not the SSP.
      if (!bytes) {
        refuse(name, 'DOCX member could not be read as binary content', { size });
      } else {
        try {
          chunks.push(...docxChunks(await docxTexts(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name, budget), name));
          parsed.push(name);
          members.push({ name, size, bytes });
        } catch (e) {
          refuse(name, (e && e.message) ? e.message : String(e), { size, bytes });
        }
      }
    } else if (ext === 'zip') {
      if (!bytes) { refuse(name, 'ZIP member could not be read as binary content', { size }); continue; }
      if (depth >= ZIP_MAX_DEPTH) { refuse(name, 'archive nested ' + (depth + 1) + ' levels deep — archives are opened to ' + ZIP_MAX_DEPTH + ' levels, so it is not read', { size, bytes }); continue; }
      const innerFailures = [];
      const innerRaw = await unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), innerFailures, budget);
      for (const f of innerFailures) {
        const at = f.name === '(archive)' ? name : name + '!/' + f.name;
        skipped.push({ name: at, reason: f.reason });
        members.push({ name: at, refusedReason: f.reason });
      }
      await readArchiveMembers(innerRaw, name + '!/', depth + 1, state);
    } else {
      // Listed with its bytes: the engine does not read it, but a caller
      // building an inventory can still say what kind of file it is.
      refuse(name, 'unsupported archive member type .' + ext, bytes ? { size, bytes } : { size, text: content || '' });
    }
  }
}

async function parseZip(file) {
  return (await parseZipReport(file)).chunks;
}

// ════════════════════════════════════════════════════════
// 7-GATE DETERMINISTIC ENGINE
// ════════════════════════════════════════════════════════

const MIN_EVIDENCE_SCORE = 0.15;
const MIN_CONCEPT_COVERAGE = 0.40;

// A Satisfied verdict resting on thin support is still Satisfied — the gates
// are the rule — but it is flagged for a human before anyone relies on it.
// Below either floor — or where gate 4 could not verify an organization-defined
// parameter — the result carries `review_required: true` and says why.
const REVIEW_CONFIDENCE_FLOOR = 0.60;
const REVIEW_COVERAGE_FLOOR = 0.60;

// Bump on ANY change to a gate, threshold, pattern list or scoring formula
// below. It is part of the reproducibility tuple stamped into every export,
// so a verdict can be traced to the exact rules that produced it.
// 1.1.0: Gate 2 scores concept coverage on the control's own evidence first
// (cross-control retrieval is the fallback only); the corpus refutation index
// matches case-insensitively like the per-control refutation checks; evidence
// dates are UTC calendar dates that must round-trip (no local-time or
// out-of-range normalisation).
// 1.4.0: every refuting pattern is matched everywhere it occurs, not once;
// gate 1 thresholds the share of the objective's terms a chunk names rather
// than a min-maxed rank, and a tagged chunk that shares no term is not
// boosted; a concept needs two of its terms and a one-word subject has to be
// named beside the objective's own words; gates 3a and 4 read the control's
// own evidence first like every other gate; typed ODP values must sit in a
// clause about the objective, selections are extracted, and untyped
// placeholders are recorded as unverified rather than passed; homoglyph
// folding covers upper case; the stemmer keeps -ss words whole; review dates
// decide currency, undated evidence is called undated, and the SLA check reads
// every date format; the ruleset digest covers every matcher; ZIP members are
// CRC-checked, the end-of-directory record has to end the file, and archiver
// housekeeping members are refused.
// 1.4.1: stop words are dropped as words, before stemming, when the anchor
// stems of an objective (gate 2b's one-term subject, gate 4's value clauses)
// and a selection option's own words are built; a stemmed stop word — `oth`,
// `dur`, `onli` — could anchor a clause. No sample verdict moves.
const ENGINE_VERSION = '1.6.6';

// File types this build parses in the browser. Anything else is refused with
// a reason — never silently turned into a placeholder chunk that reads as
// evidence. PDF and XLSX text extraction is a server-product feature.
const SUPPORTED_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'xml', 'nessus', 'docx', 'zip'];
const UNSUPPORTED_EXTENSIONS = ['pdf', 'xlsx', 'xls', 'doc', 'pptx', 'ppt'];
// Of those, the only two the server product actually claims to extract (see
// the boundary table in README.md). The rest are recognised well enough to
// refuse precisely, but naming the server product for them would advertise a
// capability nothing here backs.
const SERVER_PRODUCT_EXTENSIONS = ['pdf', 'xlsx'];

// ── Gate 2: Concept Extraction & Coverage ──

const CONCEPT_VERBS = /(?:addresses|defines|includes|establishes|identifies|implements|specifies|documents|describes|covers|provides|requires|ensures|incorporates|determines if)\b/i;
const FILLER_RE = /^(?:the|an?|and|or|that|which|is|are|has|have|for)\b\s*/i;
const CLAUSE_SPLIT = /[.;:\n]| but | however | except | although /i;
const NEGATION_RE = /\b(?:not|without|lacks|lacking|absent|absence|never|cannot|can't|won't|missing|fails?\s+to|failed\s+to|no\s+longer|do(?:es)?\s+not|is\s+not|are\s+not)\b/i;

function extractConcepts(difText) {
  if (!difText) return [];
  const m = CONCEPT_VERBS.exec(difText);
  let conceptText = m ? difText.slice(m.index + m[0].length) : difText.replace(/^Determine\s+if\s+/i, '');
  // Organization-defined parameters are placeholders for a value the system owner
  // supplies, not subject matter the evidence must echo: nobody's SSP says
  // "organization-defined". Gate 4 reads them from the raw objective text; gate 2
  // must not, or "[organization-defined policy, procedures, prerequisites, and
  // criteria]" becomes four concepts the evidence can never cover.
  conceptText = conceptText.replace(/\.$/, '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  const parts = conceptText.split(/[;,]|\band\b|\bor\b/);
  const concepts = [], seen = new Set();
  for (let p of parts) {
    p = p.trim().replace(FILLER_RE, '').trim().toLowerCase();
    if (p.length >= 3 && !seen.has(p)) { seen.add(p); concepts.push(p); }
  }
  return concepts;
}

// The vocabulary every 800-53A objective is written in. These words say how a
// control is documented, never what it is about: an SSP that says "policy",
// "developed" and "documented" has said nothing about awareness, or contingency,
// or incident response. They are listed here rather than inferred so the rule is
// auditable, and the list is hashed into the ruleset digest.
const GENERIC_TERMS = new Set([
  'policy', 'policies', 'procedure', 'procedures', 'plan', 'plans', 'process', 'processes',
  'program', 'programs', 'document', 'documents', 'documented', 'documentation',
  'develop', 'developed', 'develops', 'establish', 'established', 'establishes',
  'define', 'defined', 'defines', 'implement', 'implemented', 'implements', 'implementation',
  'review', 'reviewed', 'reviews', 'update', 'updated', 'updates',
  'approve', 'approved', 'disseminate', 'disseminated', 'maintain', 'maintained',
  'organization', 'organizations', 'organizational', 'management', 'manage', 'managed',
  'requirement', 'requirements', 'applicable', 'appropriate', 'consistent', 'accordance',
  'associated', 'related', 'following', 'address', 'addresses', 'facilitate',
  'periodic', 'periodically', 'annually', 'frequency', 'selection', 'assignment',
  'system', 'systems', 'information', 'security', 'control', 'controls', 'compliance',
  'current', 'currently', 'existing', 'applicable', 'necessary', 'required', 'specified', 'specify', 'specifies',
]);

// Terms are compared as stems of whole words. The previous reader used
// clause.includes(kw), which matched across word boundaries — "train" inside
// "constrained" and "restraint" — while a plain word-boundary regex is too
// strict the other way: "accounts are created" would not match "account
// creation", and refusing that is a false negative, not rigour.
// Longest first: 'ations' must be tried before 'ation' or "authorizations" stems
// differently from "authorization". There is deliberately no 'izations' entry —
// 'ations' already reaches it and matches first, so a separate one would be dead
// however it were spelled.
const STEM_SUFFIXES = ['ations','ation','ings','ing','ions','ion',
  'ments','ment','ness','ities','ity','ences','ence','ances','ance','ers','er','ed','es','s'];
// A trailing -s is a plural only when the letter before it is not another s:
// "access" and "process" are singular, and stripping them to "acces" and
// "proces" split each lexeme in two — "access" and "accessing" stemmed apart,
// so an objective about access failed against evidence about accessing it.
//
// Derivational endings are folded before the suffix table so a noun and its
// verb land on one stem: -ization/-isation to the -iz/-is base (authorization,
// authorized), -ification to -ifi (modification, modified), other -ation to the
// -at base (creation, created), and a final -y to -i (policy, policies). These
// are published in RULESET as STEM_DERIVATIONS. Where the table still leaves
// two forms of one word apart — "implementation" stems to `implementat` and
// "implemented" to `implement` — stemsAgree() below reads them as one.
const STEM_DERIVATIONS = [['izations','iz'],['isations','is'],['ization','iz'],['isation','is'],['ifications','ifi'],['ification','ifi'],['ations','at'],['ation','at']];
function stemWord(w) {
  w = String(w).toLowerCase();
  for (const [sfx, to] of STEM_DERIVATIONS) {
    if (w.endsWith(sfx) && w.length > sfx.length + 2) return w.slice(0, -sfx.length) + to;
  }
  for (const sfx of STEM_SUFFIXES) {
    if (sfx === 's' && w.endsWith('ss')) continue;
    if (w.endsWith(sfx) && w.length > sfx.length + 2) { w = w.slice(0, -sfx.length); break; }
  }
  if (w.length > 3 && w.endsWith('y')) w = w.slice(0, -1) + 'i';
  return w;
}
const WORD_RE = /[a-z0-9-]+/g;
function clauseStems(clause) {
  const out = new Set();
  for (const w of String(clause).toLowerCase().match(WORD_RE) || []) out.add(stemWord(w));
  return out;
}

// Two stems name one word when they are equal, or when one extends the other
// and both are at least STEM_AGREE_MIN_CHARS long: `implement` and
// `implementat`, `configur` and `configurat`. Below that length a shared prefix
// is a coincidence (`cre`, `pro`), and the two are different words.
const STEM_AGREE_MIN_CHARS = 5;
function stemsAgree(a, b) {
  if (a === b) return true;
  if (a.length < STEM_AGREE_MIN_CHARS || b.length < STEM_AGREE_MIN_CHARS) return false;
  return a.length < b.length ? b.startsWith(a) : a.startsWith(b);
}
// Whether a clause's stem set carries `term`, by stemsAgree.
function hasStem(stems, term) {
  if (stems.has(term)) return true;
  if (term.length < STEM_AGREE_MIN_CHARS) return false;
  for (const st of stems) if (stemsAgree(st, term)) return true;
  return false;
}

const GENERIC_STEMS = new Set(Array.from(GENERIC_TERMS).map(stemWord));

// A stem is generic when it is, or agrees with, the stem of a generic term —
// `requir` (required) with `require` (requirement), `manag` (managers) with
// `manage`. An exact lookup let an inflection of a generic word through as
// subject matter.
function isGenericStem(st, word) {
  if (GENERIC_TERMS.has(word) || GENERIC_STEMS.has(st)) return true;
  for (const g of GENERIC_STEMS) if (stemsAgree(g, st)) return true;
  return false;
}

// The distinguishing terms of a phrase, as stems: what it is about, once the
// compliance vocabulary is set aside.
function distinguishingTerms(phrase) {
  const out = [];
  for (const w of String(phrase || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9-]+/)) {
    if (w.length <= 3 || STOP_WORDS.has(w)) continue;
    const st = stemWord(w);
    if (isGenericStem(st, w)) continue;
    if (out.indexOf(st) === -1) out.push(st);
  }
  return out;
}

// The subject a control is about, taken from its family and its title. AT-1 is
// "Awareness and Training" / "Policy and Procedures", so its subject is
// awareness and training — the title alone is generic for every -1 control.
function controlSubjectTermsRaw(controlTitle, familyName) {
  const terms = distinguishingTerms(familyName);
  for (const t of distinguishingTerms(controlTitle)) if (terms.indexOf(t) === -1) terms.push(t);
  return terms;
}

// ── ambient subject words ────────────────────────────────────────
// Some words in a control's title name its subject; others are shared across so
// much of the catalog that they name nothing in particular. "Physical Access
// Authorizations" carries `access`, and so do 71 of the 447 controls — the whole
// Access Control family among them. An upload review of engine 1.2.0 reproduced
// what that costs: two documents about account monitoring and multi-factor
// authentication satisfied PE-2_a.[01], "a list of individuals with authorized
// access to the facility where the system resides has been developed", and the
// rest of the PE family with them, because `access` was accepted as PE-2's
// subject and account documents are full of it.
//
// A term is AMBIENT when it appears in the titles or family names of more than
// SUBJECT_AMBIENT_MAX_SHARE of the catalog's controls, and an ambient term
// cannot establish subject on its own. The threshold is published in RULESET
// and hashed into the ruleset digest; the frequencies themselves come from the
// catalog, so they move when it does and the catalog digest already covers them.
//
// Nothing is ambient when no catalog is in scope — the engine takes titles as
// arguments and can be driven without one — which is the pre-1.3.0 behaviour.
const SUBJECT_AMBIENT_MAX_SHARE = 0.10;
const SUBJECT_TERMS_REQUIRED = 2;
let _ambientTerms = null;

function ambientSubjectTerms() {
  if (_ambientTerms) return _ambientTerms;
  _ambientTerms = new Set();
  const cat = (typeof CATALOG !== 'undefined' && CATALOG) ||
    (typeof window !== 'undefined' && window && window.CATALOG) || null;
  if (!cat) return _ambientTerms;
  const freq = new Map();
  let controls = 0;
  for (const id in cat) {
    if (!Object.prototype.hasOwnProperty.call(cat, id)) continue;
    const c = cat[id];
    if (!c || typeof c.T !== 'string') continue;
    controls++;
    // Per control, not per occurrence: a word in both the family and the title
    // is one control's worth of evidence that it is common, not two.
    const seen = new Set(controlSubjectTermsRaw(c.T, c.F));
    seen.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
  }
  const cap = controls * SUBJECT_AMBIENT_MAX_SHARE;
  freq.forEach((n, t) => { if (n > cap) _ambientTerms.add(t); });
  return _ambientTerms;
}

function controlSubjectTerms(controlTitle, familyName) {
  const raw = controlSubjectTermsRaw(controlTitle, familyName);
  const ambient = ambientSubjectTerms();
  const sharp = raw.filter(t => !ambient.has(t));
  // Every word this control is named with is ambient — rare, and it means the
  // title distinguishes nothing. Keep the raw terms rather than passing gate 2b
  // for free: a weak anchor is still an anchor, and gate 2a still has to hold.
  return sharp.length ? sharp : raw;
}

// The same subject, spelled as a reader expects rather than as the matcher
// stores it: a gap that says "(aware, train)" reads like a defect in the tool.
function controlSubjectWords(controlTitle, familyName) {
  const out = [];
  for (const src of [familyName, controlTitle]) {
    for (const w of String(src || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9-]+/)) {
      if (w.length <= 3 || STOP_WORDS.has(w)) continue;
      if (isGenericStem(stemWord(w), w)) continue;
      if (out.indexOf(w) === -1) out.push(w);
    }
  }
  return out;
}

// Gate 2b. Evidence that never names the control's subject in an affirmative
// clause cannot satisfy that control's objectives, whatever else it says.
//
// This is the rule whose absence the 2026-09-11 upload review demonstrated: two
// documents about account monitoring and multi-factor authentication returned
// Satisfied for AT-1_a.[01], "an awareness and training policy is developed and
// documented", because every generic word in the objective was present and
// neither subject word was needed.
//
// One matching word is not enough when the subject is a compound. PE-8 is
// "Visitor Access Records": after ambient `access` is set aside its subject is
// physical, environmental, visitor, records — and an account document saying
// "recorded in the ticketing system" matched `record` and passed. So where the
// subject has two or more sharp terms, the evidence has to name two of them;
// where it has one, that one. SUBJECT_TERMS_REQUIRED is published in RULESET.
//
// The terms may be named in different affirmative clauses of the same passage.
// Requiring them in one clause would refuse "Visitor access records are
// maintained for one year. Physical security reviews them monthly," which is
// exactly the evidence this gate exists to admit.
//
// A subject of ONE sharp term — AC-2 is "Account Management" in "Access
// Control", and after `management` (generic) and `access` (ambient) are set
// aside it is `account` — made 2b a single-word check, and "mentions accounts
// sometimes" passed it. So a one-term subject has to be named in an affirmative
// clause that also carries another word of the objective itself: the subject
// said about what the objective asks, not the subject as furniture.
// `objectiveStems` is that word list; without it the one-term case is the
// bare check, which is what the engine did before 1.4.0.
function mentionsSubject(evidenceText, terms, objectiveStems) {
  if (!terms.length) return true;           // nothing to anchor on; gate 2a decides
  if (!evidenceText) return false;
  const need = Math.min(SUBJECT_TERMS_REQUIRED, terms.length);
  const found = new Set();
  const clauses = String(evidenceText).split(CLAUSE_SPLIT).filter(c => c.trim());
  const anchor = (terms.length === 1 && objectiveStems && objectiveStems.size)
    ? new Set([...objectiveStems].filter(st => st !== terms[0]))
    : null;
  for (const clause of clauses) {
    if (NEGATION_RE.test(clause)) continue;
    const stems = clauseStems(clause);
    if (anchor) {
      if (!hasStem(stems, terms[0])) continue;
      let beside = false;
      anchor.forEach(st => { if (hasStem(stems, st)) beside = true; });
      if (beside) return true;
      continue;
    }
    for (const t of terms) if (hasStem(stems, t)) found.add(t);
    if (found.size >= need) return true;
  }
  return false;
}

// A concept is covered when the evidence addresses what it is ABOUT. Its generic
// words are not enough: "training policy is developed" was previously covered by
// "the account management policy is developed", because `policy` and `developed`
// were accepted on their own. Only a distinguishing term counts now.
//
// A concept that is entirely generic — "documented" — describes no subject, so it
// is dropped rather than counted. Counting it let contentless vocabulary carry an
// objective: two such concepts out of three cleared a 40% floor on their own.
//
// And a concept with several distinguishing terms is not covered by one of
// them. "the use of accounts is monitored" is about accounts AND monitoring;
// evidence that mentions accounts and never monitoring covered it, and a
// one-concept objective went to 100% on a single noun. Where a concept has two
// or more distinguishing terms the evidence has to name two of them, in
// affirmative clauses of the same passage; where it has one, that one.
// CONCEPT_TERMS_REQUIRED is published in RULESET.
const CONCEPT_TERMS_REQUIRED = 2;
function checkCoverage(concepts, evidenceText) {
  const scored = concepts.map(c => ({ concept: c, terms: distinguishingTerms(c) }));
  const material = scored.filter(x => x.terms.length);
  const generic = scored.filter(x => !x.terms.length).map(x => x.concept);
  if (!concepts.length) return {covered:[], uncovered:[], generic:[], ratio:1.0};
  // Every concept was generic: the objective names no subject of its own, so
  // coverage cannot speak to it either way. Gate 2b carries the control's
  // subject instead; this returns 0 so vocabulary alone cannot clear the floor.
  if (!material.length) return {covered:[], uncovered:[], generic, ratio:0.0};
  if (!evidenceText) return {covered:[], uncovered: material.map(x => x.concept), generic, ratio:0.0};
  const clauses = String(evidenceText).split(CLAUSE_SPLIT).filter(c => c.trim());
  const covered = [], uncovered = [];
  for (const { concept, terms } of material) {
    const need = Math.min(CONCEPT_TERMS_REQUIRED, terms.length);
    const hit = new Set();
    for (const clause of clauses) {
      if (NEGATION_RE.test(clause)) continue;
      const stems = clauseStems(clause);
      for (const t of terms) if (hasStem(stems, t)) hit.add(t);
      if (hit.size >= need) break;
    }
    (hit.size >= need ? covered : uncovered).push(concept);
  }
  return {covered, uncovered, generic, ratio: covered.length / material.length};
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

// A passage is stuffed when a five-word sequence repeats, and repeats often
// enough relative to its length to be padding rather than house style. Both
// parameters are published in RULESET and hashed into the ruleset digest.
// What an artifact shows of the evidence. The gates read the whole string; a
// CSV cell, an OSCAL description and a TCW row got the first 500 characters
// with nothing to say so, and a refutation or a date past that offset simply
// was not in the artifact — the determination accounted for it and the record
// of the determination did not. The cut stays (an OSCAL file with every
// evidence body in full is megabytes of duplicated corpus), but it says it is a
// cut, and how much it left behind.
const EVIDENCE_DESCRIPTION_MAX = 500;
function evidenceDescription(text) {
  const s = String(text == null ? '' : text);
  if (s.length <= EVIDENCE_DESCRIPTION_MAX) return s;
  return s.slice(0, EVIDENCE_DESCRIPTION_MAX) +
    ' […truncated for this artifact; ' + s.length + ' characters of evidence were assessed]';
}

const STUFFING_MIN_DUPES = 3;
const STUFFING_DUPE_SHARE = 0.15;

function evidenceLooksStuffed(text) {
  if (!text) return false;
  const words = text.split(/\s+/);
  if (words.length < 40) return false;
  // The duplicate-5-gram test below used to run only when the longest stretch
  // between [.!?;:] was itself 40 words or more. Keyword stuffing does not need
  // to be one long breathless run, and punctuation is free: the same phrases
  // with a full stop after each read as ordinary sentences to that gate and
  // walked past it. What identifies stuffing is repetition, so repetition is
  // what is measured, however the author chose to punctuate.
  //
  // Repetition is measured as a SHARE of the passage, not as a count. Most of
  // what reaches this function is the retrieval union — eight chunks from eight
  // different sections, joined — and an SSP names its own subject in every
  // section it opens, so "policy and procedures CloudVault maintains an" recurs
  // across the union as a matter of house style. Three such echoes in seven
  // hundred words is the shape of a document; the same three in eighty words is
  // the shape of a keyword list. An absolute count cannot tell those apart and
  // read the ordinary sample as stuffed, which cost nineteen determinations.
  const lowered = words.map(w => w.replace(/[.,;:!?"'()\[\]]/g, '').toLowerCase());
  const seen = new Set();
  let dupes = 0;
  const windows = lowered.length - 4;
  for (let i = 0; i < windows; i++) {
    const gram = lowered.slice(i, i+5).join(' ');
    if (seen.has(gram)) dupes++;
    seen.add(gram);
  }
  return dupes >= STUFFING_MIN_DUPES && (dupes / windows) >= STUFFING_DUPE_SHARE;
}

// ── Gate 4: ODP Validation ──
//
// An organization-defined parameter is a value the system owner supplies, and
// the gate asks whether the evidence supplies it. Three kinds of parameter get
// three different answers:
//
//   * a TYPED parameter — a frequency, a time period, a role, a threshold — has
//     a recognisable value. It is RESOLVED when such a value is stated in an
//     affirmative clause that is about this objective (shares a word with it),
//     and MISSING otherwise. "Monthly" anywhere in the retrieved evidence used
//     to resolve every frequency parameter; a frequency stated about backups
//     does not resolve one asked about account reviews.
//   * a SELECTION lists its own options, so it is RESOLVED when one of them is
//     named in such a clause and UNVERIFIED when none is. Real SSPs describe a
//     policy without saying "organization-level", and refusing every one of
//     them for that would be a false fail by the hundred — but it is not a
//     pass either, and it is recorded.
//   * an UNTYPED placeholder — "[organization-defined events]" — names no value
//     this build can recognise. It used to pass whenever the evidence was
//     non-empty and not keyword-stuffed, which gate 1 had already required, so
//     it could not fail; and the gate table then called it "resolved". It is
//     recorded as UNVERIFIED now: not failed, and not claimed.
//
// The gate passes when nothing typed is missing. What was resolved, what was
// missing and what could not be verified travel on the result, so a Satisfied
// determination says which of its parameters this build actually checked.

const ODP_PLACEHOLDER = /\[([^\[\]]*organization[- ]defined[^\[\]]*)\]/gi;
const ODP_ASSIGNMENT = /\[assignment:\s*([^\[\]]+?)\]/gi;
const ODP_SELECTION = /\[selection(?:\s*\([^)]*\))?\s*:\s*([^\[\]]+?)\]/gi;
const ODP_FREQ_RE = /\b(?:daily|weekly|bi-?weekly|monthly|quarterly|semi-?annually|annually|yearly|every\s+\d+|every\s+(?:day|week|month|quarter|year)|periodic(?:ally)?|continuous(?:ly)?|real-?time|on\s+demand)\b/;
const ODP_TIME_RE = /\b(?:within\s+\S+|\d+\s*(?:hours?|days?|weeks?|months?|years?|business\s+days?|minutes?)|immediately|same\s+day|next\s+business\s+day)\b/;
const ODP_ROLE_RE = /\b(?:isso|issm|ciso|cio|iso|ao|authorizing\s+official|system\s+owner|information\s+owner|administrators?|security\s+officer|managers?|personnel|staff|team|engineers?|analysts?|custodians?|operators?|stakeholders?)\b/;
const ODP_THRESH_RE = /\b(?:no\s+more\s+than|not\s+more\s+than|at\s+least|at\s+most|maximum|minimum|threshold|limit(?:ed)?\s+to|exceed(?:s|ing)?|up\s+to|\d+\s*(?:%|percent)|\d+\s+(?:consecutive|failed|unsuccessful|attempts))\b/;

// The kind of value a placeholder asks for, read from its own wording.
function odpKind(text) {
  const n = String(text).toLowerCase();
  if (/\btime\b|duration|how\s+long/.test(n)) return 'time';
  if (/frequency|frequencies|period|how\s+often/.test(n)) return 'frequency';
  if (/personnel|roles?\b|official|individuals?|team|owner/.test(n)) return 'role';
  if (/threshold|limit|number|quantity|percentage|maximum|minimum|count\b/.test(n)) return 'threshold';
  return 'other';
}

// Every parameter an objective carries, in text order. A selection's options
// are kept: they are what the evidence is checked against.
function extractOdps(difText) {
  if (!difText) return [];
  const spans = [];
  const collect = (re, kind) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(difText))) spans.push({ start: m.index, end: m.index + m[0].length, text: m[1].trim(), kind });
  };
  collect(ODP_SELECTION, 'selection');
  collect(ODP_PLACEHOLDER, null);
  collect(ODP_ASSIGNMENT, null);
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let lastEnd = -1;
  for (const sp of spans) {
    if (sp.start < lastEnd) continue;            // the placeholder inside a selection's span
    lastEnd = sp.end;
    if (sp.kind === 'selection') {
      out.push({ text: sp.text, kind: 'selection', options: sp.text.split(/;/).map(o => o.trim()).filter(Boolean) });
    } else {
      out.push({ text: sp.text, kind: odpKind(sp.text) });
    }
  }
  return out;
}

// The stems of a text's content words: stop words are dropped as WORDS, before
// stemming, because STOP_WORDS holds words and a stemmed stop word is not in it
// — "other" stems to `oth`, "during" to `dur`, "only" to `onli`, and all three
// walked through a filter that looked the stem up.
function contentStems(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().match(WORD_RE) || []) {
    if (STOP_WORDS.has(w)) continue;
    const st = stemWord(w);
    if (st.length > 2) out.add(st);
  }
  return out;
}

// The words of the objective a value clause has to share to count as being
// about it: the objective's own stems with the placeholders and stop words
// taken out.
function objectiveAnchorStems(difText) {
  const bare = String(difText || '').replace(/\[[^\[\]]*\]/g, ' ').replace(/^\s*Determine\s+if\s+/i, '');
  return contentStems(bare);
}

// The catalog carries FedRAMP's own value for 236 of its 1,513 objectives — the
// `o` field, "AC-1 (c) (1): at least every 3 years" — and nothing read it. Gate
// 4 checks that a value of the right KIND is stated in a clause about the
// objective; it does not check that the stated value is the required one, so a
// policy reviewed every ten years resolves a three-year parameter.
//
// It stays that way, and the reason is worth recording rather than leaving for
// someone to rediscover. Comparing needs the stated duration bound to the
// parameter it answers, and an anchored clause routinely carries a duration
// belonging to a different parameter: the sample's AC-2 section says accounts
// are reviewed quarterly, and AC-2_h.(1) requires accounts be DISABLED within
// twenty-four hours. Measured over the bundled sample, a clause-scoped
// comparison found three mismatches and all three were of that shape — three
// false refusals, no true ones. A gate that is wrong every time it fires is
// worse than a gate that does not fire.
//
// So the value travels instead of being judged. `expected` puts FedRAMP's text
// on the determination and into the artifacts, next to the parameter it belongs
// to, where the assessor doing the comparison can see it. Consulting the
// catalog is what item 6 asked for; asserting a comparison this build cannot
// make is what it warned against.
function stripOdpPrefix(value) {
  return String(value == null ? '' : value).replace(/^[A-Z]{2}-\d{1,3}[^:]*?:\s*/, '').trim();
}

function validateOdps(difText, evidenceText, catalogValue) {
  const odps = extractOdps(difText);
  const required = odps.map(o => o.text);
  const expected = stripOdpPrefix(catalogValue);
  if (!odps.length) return { required, resolved: [], missing: [], unverified: [], expected, satisfied: true };
  const anchors = objectiveAnchorStems(difText);
  const clauses = String(evidenceText || '').split(CLAUSE_SPLIT).filter(c => c.trim())
    .filter(c => !NEGATION_RE.test(c))
    .map(c => ({ text: c.toLowerCase(), stems: clauseStems(c) }))
    .filter(c => { let a = false; anchors.forEach(st => { if (hasStem(c.stems, st)) a = true; }); return a; });
  const anyClause = (test) => clauses.some(test);
  const resolved = [], missing = [], unverified = [];
  for (const odp of odps) {
    let ok;
    switch (odp.kind) {
      case 'frequency': ok = anyClause(c => ODP_FREQ_RE.test(c.text)); break;
      case 'time':      ok = anyClause(c => ODP_TIME_RE.test(c.text) || ODP_FREQ_RE.test(c.text)); break;
      case 'role':      ok = anyClause(c => ODP_ROLE_RE.test(c.text)); break;
      case 'threshold': ok = anyClause(c => ODP_THRESH_RE.test(c.text)); break;
      case 'selection': {
        // An option counts when its distinguishing stems (two of them, or the
        // one it has) sit in one anchored affirmative clause. An option made
        // only of generic words — "organization-defined contract language" —
        // is a placeholder of its own and cannot be matched.
        const found = odp.options.some(opt => {
          // An option with no distinguishing term — "organization-level" agrees
          // with generic `organization` — is matched on its own words instead,
          // exactly; an option that is itself a placeholder cannot be matched.
          if (/organization[- ]defined/i.test(opt)) return false;
          let terms = distinguishingTerms(opt);
          const exact = !terms.length;
          if (exact) terms = [...contentStems(opt)];
          if (!terms.length) return false;
          const need = Math.min(CONCEPT_TERMS_REQUIRED, terms.length);
          return anyClause(c => terms.filter(t => exact ? c.stems.has(t) : hasStem(c.stems, t)).length >= need);
        });
        if (found) resolved.push(odp.text); else unverified.push(odp.text);
        continue;
      }
      default: unverified.push(odp.text); continue;
    }
    (ok ? resolved : missing).push(odp.text);
  }
  return { required, resolved, missing, unverified, expected, satisfied: !missing.length };
}

// ── Gate 5: Refutation & Contradiction Detection ──

// Deleting an invisible character (foldHomoglyphs, below) can weld two words
// together: "not<ZWSP>implemented" folds to "notimplemented". A matcher that
// separates its words with `\s+` requires whitespace that is no longer there,
// so the sentence reads as neither "not implemented" nor anything else, and the
// gate that should refuse this control passes it.
//
// weldTolerant rewrites a pattern's word separators to `\s*` — whitespace that
// may be absent — so one matcher covers the honest text and the welded form.
// It is applied at construction, so RULESET publishes the pattern that actually
// runs and the ruleset digest moves with it.
//
// It rewrites `\s+` and the literal space. Neither may appear inside a
// character class in a pattern passed here, because a class is matched as
// source text like anything else: write `[\s-]` (as DRAFT_RE does) rather than
// `[ -]`, and the rewrite cannot reach it.
function weldTolerant(re) {
  return new RegExp(re.source.replace(/\\s\+/g, '\\s*').replace(/ /g, '\\s*'), re.flags);
}

const REFUTING_PATTERNS = [
  /\bnot\s+(?:yet\s+)?(?:been\s+)?(?:fully\s+|properly\s+|completely\s+|correctly\s+|formally\s+|successfully\s+|adequately\s+)?(?:implemented|configured|enforced|deployed|established|maintained|performed|documented|disseminated|defined|reviewed|updated|applied|operational|turned\s+on|in\s+place)\b/,
  /\byet\s+to\s+be\s+(?:implemented|configured|enforced|deployed|established|completed|performed|defined|built|turned\s+on|operational|in\s+place)\b/,
  /\bremains?\s+outstanding\b/,
  /\bremains?\s+to\s+be\s+(?:implemented|configured|enforced|deployed|established|completed|performed|defined|built|turned\s+on)\b/,
  /\bpartially\s+implemented\b/,
  // The optional auxiliary carries its own trailing separator. Written as
  // `\s+(?:is|are|…)?\s*absent`, two whitespace quantifiers sat side by side
  // with only an optional group between them, so a run of spaces could be
  // split between them in every possible way: 306ms on twenty thousand spaces
  // under 1.4.1, and the cost is quadratic, so a document could hang the tab it
  // was dropped into. Inside the group the separators are divided by a literal
  // and there is nothing to split.
  /\b(?:tooling|capabilit(?:y|ies)|controls?|mechanisms?|process(?:es)?|procedures?|configuration|enforcement|logging|monitoring)\s+(?:(?:is|are|was|were|remains?)\s+)?absent\b/,
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
].map(weldTolerant);

const NEGATION_PAIRS = [
  [/not implemented/, /is implemented/],
  [/not documented/, /is documented/],
  [/not reviewed/, /is reviewed/],
  [/not required/, /is required/],
  [/not configured/, /is configured/],
  [/disabled/, /enabled/],
].map(pair => pair.map(weldTolerant));

const DRAFT_RE = weldTolerant(/\b(?:tbd|to\s+be\s+(?:determined|defined|decided|finalized)|pending\s+finalization|to-?do|placeholder)\b|[\[<]\s*(?:insert|todo|placeholder|fill[\s-]?in)\b/i);

// Which control a refuting sentence is about. A document names a control in a
// heading and describes it in the paragraphs that follow, so the closest
// control id BEFORE the sentence owns it; a sentence no id precedes belongs to
// the closest id after it within REFUTATION_FOLLOWING_SCOPE_CHARS ("account
// monitoring is not implemented (see AC-2)"); a text naming one control owns
// every refutation in it wherever the id sits. The previous rule was symmetric
// distance — any id within 400 characters counted — so "Not yet fully
// implemented" under the CM-1 heading also refuted AU-3, whose heading sat 250
// characters earlier, and the two were indistinguishable.
// Shared by detectRefutationsScoped and buildRefutationIndex.
const REFUTATION_FOLLOWING_SCOPE_CHARS = 600;
// Positions of every control id in `text`, as [{id, pos}] in text order.
// Reads CONTROL_ID_RE, the one pattern: this used to carry its own copy, with
// the same `\b`-after-`)` defect, so refutation scoping charged an
// enhancement's sentence to the base control.
function controlIdPositions(text) {
  return [...String(text).matchAll(CONTROL_ID_RE)].map(m => ({ id: m[0], pos: m.index }));
}

// The ids that own a refutation at `refPos`, given the id occurrences of the
// text. Ties (two ids in one heading) are shared.
function refutationOwners(occurrences, refPos) {
  if (!occurrences.length) return [];
  let best = null;
  for (const o of occurrences) if (o.pos < refPos && (best === null || o.pos > best)) best = o.pos;
  if (best !== null) return [...new Set(occurrences.filter(o => o.pos === best).map(o => o.id))];
  let next = null;
  for (const o of occurrences) if (o.pos > refPos && o.pos - refPos <= REFUTATION_FOLLOWING_SCOPE_CHARS && (next === null || o.pos < next)) next = o.pos;
  if (next !== null) return [...new Set(occurrences.filter(o => o.pos === next).map(o => o.id))];
  const ids = [...new Set(occurrences.map(o => o.id))];
  return ids.length === 1 ? ids : [];
}

// Every match of a pattern in the text, without mutating shared regex state.
// The previous reader executed each pattern ONCE and kept the first hit, so a
// chunk that said "AC-1 ... not implemented" and, two paragraphs on, "AC-2 ...
// not implemented" carried one refutation, attributed to AC-1, and AC-2's went
// unrecorded — in the scoped check, in the plain check and in the corpus index
// alike. A pattern is a shape of sentence; it can occur as often as it likes.
function execAll(pattern, text) {
  const re = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[0]) out.push(m);
    if (m[0] === '') re.lastIndex++;
  }
  return out;
}

function detectRefutations(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const found = [];
  for (const p of REFUTING_PATTERNS) for (const m of execAll(p, t)) found.push(m[0]);
  return found;
}

function detectRefutationsScoped(text, controlId) {
  if (!text) return [];
  const t = text.toLowerCase();
  // Positions are taken from the original text — the patterns are lower-case
  // and the ids upper-case, and lower-casing changes no offsets.
  const occurrences = controlIdPositions(text);
  const found = [];
  for (const p of REFUTING_PATTERNS) for (const m of execAll(p, t)) {
    // A text that names no control at all is this control's own evidence and
    // every refutation in it is about this control.
    if (!occurrences.length || refutationOwners(occurrences, m.index).includes(controlId)) found.push(m[0]);
  }
  return [...new Set(found)];
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

// Build evidence dates in UTC and reject
// any that do not round-trip. `new Date(y, m, d)` is local-time, so the same
// evidence produced different day-deltas depending on the visitor's timezone
// (against the module's determinism promise), and the Date constructor
// normalises out-of-range components — 2025-02-30 became 2 March — so a typo
// in the evidence could fabricate a currency finding. A calendar date that is
// not a real day yields null and is skipped, not "corrected".
function utcCalendarDate(y, mo, d) {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function extractDates(text) {
  if (!text) return [];
  const found = [];
  for (const [pattern, fmt] of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text))) {
      let dateObj;
      try {
        if (fmt === 'ymd') dateObj = utcCalendarDate(+m[1], +m[2], +m[3]);
        else if (fmt === 'mdy') { const mo = MONTHS_MAP[m[1].toLowerCase().replace('.','')]; if (mo) dateObj = utcCalendarDate(+m[3], mo, +m[2]); }
        else if (fmt === 'my') { const mo = MONTHS_MAP[m[1].toLowerCase().replace('.','')]; if (mo) dateObj = utcCalendarDate(+m[2], mo, 1); }
        else if (fmt === 'mdy_num') dateObj = utcCalendarDate(+m[3], +m[1], +m[2]);
      } catch(e) { continue; }
      if (!dateObj || isNaN(dateObj.getTime())) continue;
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      const surrounding = text.slice(start, end);
      // The date's type is read from its OWN sentence, not from whatever sits
      // within forty characters. "Last reviewed: 2023-01-10. Most recent scan:
      // 2026-05-28" typed the scan date as a review because "reviewed" was
      // within the window — and that later "review" then decided currency.
      const before = text.slice(start, m.index).split(/[.;\n]/).pop();
      const after = text.slice(m.index + m[0].length, end).split(/[.;\n]/)[0];
      const sentence = before + m[0] + after;
      let ctxType = 'unknown';
      for (const [cp, ct] of CTX_PATTERNS) { if (cp.test(sentence)) { ctxType = ct; break; } }
      found.push({dateStr: m[0], dateObj, ctxType, surrounding});
    }
  }
  const seen = new Set();
  return found.filter(d => { if (seen.has(d.dateStr)) return false; seen.add(d.dateStr); return true; })
    .sort((a, b) => b.dateObj - a.dateObj);
}

// Which date decides currency. The newest date used to, whatever it was, so a
// review dated two years ago was current because a scan two paragraphs on was
// dated last month: the stale-review concern was computed and then discarded.
// A review or update date is the document's own statement of when it was last
// looked at, and when one is present it decides; failing that the newest date
// whose context is known; failing that the newest date of all.
//
// No date at all is not "current". It is undated, and the gate says so:
// `isCurrent` is null, nothing is asserted either way, and the caller flags the
// verdict for a human rather than recording a currency nobody checked.
const CURRENCY_DECIDING_CTX = ['review_date', 'update_date'];
function checkCurrency(dates, assessmentDate) {
  if (!dates.length) return {isCurrent:null, staleDays:0, concerns:['evidence carries no date — currency not established'], deciding:null};
  const ad = assessmentDate; // supplied by assessDif — never the clock
  const reviewed = dates.filter(d => CURRENCY_DECIDING_CTX.includes(d.ctxType));
  const typed = dates.filter(d => d.ctxType !== 'unknown');
  const most = reviewed[0] || typed[0] || dates[0];   // dates arrive newest first
  const daysOld = Math.round((ad - most.dateObj) / 86400000);
  const thresh = STALENESS[most.ctxType] || 365;
  const concerns = [];
  for (const d of dates) {
    const dd = Math.round((ad - d.dateObj) / 86400000);
    const dt = STALENESS[d.ctxType] || 365;
    if (dd < 0) concerns.push(d.ctxType + ': ' + d.dateStr + ' is future-dated');
    else if (dd > dt) concerns.push(d.ctxType + ': ' + d.dateStr + ' is ' + dd + ' days old (threshold: ' + dt + ')');
  }
  const isCurrent = daysOld >= 0 && daysOld <= thresh;
  // The deciding date's own concern leads, so the finding names the date that
  // failed the gate rather than whichever stale date was found first.
  const own = concerns.filter(c => c.startsWith(most.ctxType + ': ' + most.dateStr));
  return {isCurrent, staleDays: Math.max(0, daysOld), concerns: own.concat(concerns.filter(c => !own.includes(c))), deciding: most};
}

// ── Gate 6b: Scan Cadence Check (ConMon 30-day) ──

const SCAN_CADENCE_DAYS = 30;
const SCAN_CONTEXT_RE = /\b(?:vulnerability scan|vuln scan|authenticated scan|credentialed scan|web application scan|database scan|container scan|nessus|qualys|tenable|rapid7|openvas|scanned|last scan|most recent scan|scan(?:s)?\s+(?:(?:was|were|is|are)\s+)?(?:performed|completed|run|conducted|executed))\b/i;

function checkScanCadence(dates, assessmentDate) {
  const ad = assessmentDate; // supplied by assessDif — never the clock
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
  const ad = assessmentDate; // supplied by assessDif — never the clock
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
const SLA_DAYS = {critical:30, high:30, moderate:90, medium:90, low:180};

function checkOpenFindingSla(evidenceText, assessmentDate) {
  if (!evidenceText) return null;
  const ad = assessmentDate; // supplied by assessDif — never the clock
  const sentences = evidenceText.split(/(?<=[.;!?])\s+/);
  for (const sent of sentences) {
    if (!FINDING_NOUN_RE.test(sent)) continue;
    if (!OPEN_STATUS_RE.test(sent)) continue;
    if (CLOSURE_RE.test(sent) && !OPEN_STATUS_RE.test(sent)) continue;
    const sevMatch = sent.match(SEVERITY_RE);
    if (!sevMatch) continue;
    const severity = sevMatch[1].toLowerCase();
    const sla = SLA_DAYS[severity] || 180;
    // The same reader gates 6a–6c use, so "January 1, 2024" and "2024-01-01"
    // are the same finding date. A second, ISO-only regex here let a finding
    // written with a month name escape the SLA check its twin failed.
    const dateToks = extractDates(sent).map(d => d.dateObj);
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

// Lower AND upper case. The map was lowercase-only and the folder never
// case-folded, so "Рlaceholder" with a Cyrillic capital Er walked past gate 5c
// while "рlaceholder" with the small letter did not. Folding is done per
// character rather than by lowercasing the text, because the control-id
// pattern that scopes gate 5 reads upper-case family letters.
const HOMOGLYPHS = {
  'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','к':'k','м':'m','т':'t','н':'h','в':'b','і':'i','ј':'j','ѕ':'s','ԁ':'d','ԛ':'q','ԝ':'w','ғ':'f','ӏ':'l',
  'А':'A','Е':'E','О':'O','Р':'P','С':'C','Х':'X','У':'Y','К':'K','М':'M','Т':'T','Н':'H','В':'B','І':'I','Ј':'J','Ѕ':'S','Ԁ':'D','Ԛ':'Q','Ԝ':'W','Ғ':'F','Ӏ':'I','З':'3','Ь':'b',
  'ο':'o','α':'a','ε':'e','ρ':'p','ν':'v','τ':'t','κ':'k','ι':'i','χ':'x','υ':'u','ϲ':'c','ϳ':'j','ѡ':'w',
  'Ο':'O','Α':'A','Ε':'E','Ρ':'P','Ν':'N','Τ':'T','Κ':'K','Ι':'I','Χ':'X','Β':'B','Η':'H','Μ':'M','Υ':'Y','Ζ':'Z','Ϲ':'C','Ϳ':'J',
};

// Invisible formatting characters — zero-width space, zero-width non-joiner and
// joiner, word joiner, byte-order mark, soft hyphen — render as nothing and
// survive NFKC, which normalises compatibility forms and leaves format
// characters where they are. A document could therefore write
// "not<ZWSP>implemented", "imple<SHY>mented" or "place<ZWSP>holder" and read
// exactly like the honest text on screen while matching none of the patterns
// gate 5 refuses on. Unicode calls these default-ignorable, and the standard
// reading of a string that carries them is the string without them, so they are
// deleted here rather than replaced: "imple<SHY>mented" is "implemented" and
// "place<ZWSP>holder" is "placeholder".
//
// Deleting them can also WELD two words: "not<ZWSP>implemented" becomes
// "notimplemented", which is not "not implemented" either. That is why every
// matcher built on top of this fold separates its words with `\s*` — see
// weldTolerant() below.
const INVISIBLE_RE = /\p{Cf}/gu;

function foldHomoglyphs(text) {
  if (!text) return text;
  let out = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFKC').replace(INVISIBLE_RE, '');
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
    // REFUTING_PATTERNS are lower-case and carry no
    // /i flag; detectRefutations / detectRefutationsScoped lower-case before
    // matching but this index did not, so a sentence-initial "Not implemented"
    // was never indexed. Match on the lowered text (positions are compared
    // against control-id offsets in the original, the same convention
    // detectRefutationsScoped uses).
    const lowered = txt.toLowerCase();
    const occurrences = controlIdPositions(txt).filter(o => cids.includes(o.id));
    for (const pat of REFUTING_PATTERNS) for (const m of execAll(pat, lowered)) {
      for (const cid of refutationOwners(occurrences, m.index)) {
        if (!index[cid]) index[cid] = [];
        if (!index[cid].includes(m[0])) index[cid].push(m[0]);
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

// ════════════════════════════════════════════════════════
// SINGLE DIF ASSESSMENT (7-gate pipeline)
// ════════════════════════════════════════════════════════

function assessDif(dif, retriever, controlId, controlTitle, familyName, refutationIdx, assessmentDate) {
  // The four temporal gates once defaulted to `new Date()` internally, and a
  // later revision read the clock here when the caller passed nothing — so an
  // uploaded package could get different temporal verdicts on different days
  // while the page promised "same input, same verdicts". The engine now reads
  // no clock at all: the assessment date is a required input, the gates
  // receive it, and every result reports it. The caller (the demo page) owns
  // the date and shows it, which is what makes a verdict reproducible.
  // Realm-safe (a Date from another vm context is still a Date).
  if (Object.prototype.toString.call(assessmentDate) !== '[object Date]' || isNaN(assessmentDate)) {
    throw new Error('assessDif: assessmentDate (a valid Date) is required — the engine does not read the clock');
  }
  const asOf = assessmentDate;
  const asOfDay = asOf.toISOString().slice(0, 10);
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
      confidence: 0, defensibility_score: 0, concept_coverage: 0,
      gap_description: 'No evidence above the relevance threshold for this objective',
      // FedRAMP's parameter value is a property of the objective, not of the
      // run, so it travels on the early returns too, where no gate 4 was reached.
      odp_expected: stripOdpPrefix(dif.o),
      review_required: false,
      gates: [
        {gate:1, name:'Presence', pass:false},
        {gate:7, name:'Determination', pass:false, determination:'Not Reviewed'}
      ]
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
    // Score coverage on THIS control's own evidence
    // first, like gates 3b/5/5a — the cross-control BM25 fallback is only
    // consulted when the corpus has no chunk tagged with the control, so a
    // neighbour's prose cannot satisfy the wrong control's concepts.
    const coverage = checkCoverage(concepts, ownEvidence || evidenceText);
    var coverageResult = coverage;
    const g2a = coverage.ratio >= MIN_CONCEPT_COVERAGE;
    // 2b: does the evidence name what this control is about at all? Coverage can
    // clear its floor on an objective's own wording while the evidence addresses
    // a different control entirely; the subject is what tells those apart.
    const subject = controlSubjectTerms(controlTitle, familyName);
    const g2b = mentionsSubject(ownEvidence || evidenceText, subject, objectiveAnchorStems(dif.t));
    const g2pass = g2a && g2b;
    gates.push({gate:2, name:'Concepts', pass:g2pass, checks:[
      {id:'2a', name:'Coverage', pass:g2a},
      {id:'2b', name:'Subject', pass:g2b}
    ]});
    if (!g2a) gaps.push('Concept coverage ' + Math.round(coverage.ratio*100) + '% (need ' + Math.round(MIN_CONCEPT_COVERAGE*100) + '%); missing: ' + coverage.uncovered.join(', '));
    if (!g2b) gaps.push('Evidence does not address this control\'s subject (' + controlSubjectWords(controlTitle, familyName).join(', ') + ')');
  }
  if (typeof coverageResult === 'undefined') coverageResult = {ratio: 0, uncovered: [], covered: []};

  // Gate 3: Evidence Strength — 3a traceable references, 3b no keyword
  // stuffing. Both read the control's own evidence first, like every other
  // gate: 3a used to read the BM25 union, so a neighbour's "SSP section 5 /
  // version 3 / dated March" made THIS control's weak paragraph Strong.
  const strength = scoreEvidence(ownEvidence || evidenceText);
  const g3a = strength.tier !== 'weak' && strength.tier !== 'unknown';
  const stuffed = evidenceLooksStuffed(ownEvidence || evidenceText);
  gates.push({gate:3, name:'Strength', pass:g3a && !stuffed, checks:[
    {id:'3a', name:'Traceability', pass:g3a},
    {id:'3b', name:'Stuffing', pass:!stuffed}
  ]});
  if (!g3a) gaps.push('Evidence strength: ' + strength.tier + ' — no traceable references');
  if (stuffed) gaps.push('Evidence appears keyword-stuffed');

  // Gate 4: ODP Validation — on the control's own evidence, not the union: a
  // neighbour's "ISSO" used to resolve a role parameter this control never
  // named. The record says what was resolved, what was missing and what this
  // build cannot verify; only a missing typed value fails the gate.
  const odp = validateOdps(dif.t, ownEvidence || evidenceText, dif.o);
  gates.push({gate:4, name:'ODP', pass:odp.satisfied, checks:[
    {id:'4a', name:'Typed values', pass:!odp.missing.length},
  ], resolved: odp.resolved, missing: odp.missing, unverified: odp.unverified});
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
    gates.push({gate:5, name:'Contradiction', pass:false, checks:[{id:'5a', name:'Refutation', pass:false}]});
    gates.push({gate:7, name:'Determination', pass:false, determination:'Other Than Satisfied'});
    return {
      dif_id: dif.i, control_id: controlId, objective_id: dif.i,
      status: 'Other Than Satisfied', determination: 'Other Than Satisfied',
      finding: 'Refuting evidence found: ' + allRefutations[0],
      evidence_description: evidenceDescription(evidenceText), evidence_references: strongHits.slice(0,3).map(h => h.filename),
      weakness_name: 'Control Not Implemented — ' + controlId,
      weakness_description: 'Evidence contains explicit negative status: ' + allRefutations.join('; '),
      weakness_type: 'Significant Deficiency',
      likelihood_before: lk, impact_before: imp, risk_exposure_before: calcRiskExposure(lk, imp),
      risk_statement: 'Control objective ' + dif.i + ' is explicitly marked as not implemented in the evidence.',
      recommendation: 'Complete implementation of ' + controlId + ' and provide updated documentation.',
      proposed_remediation: 'Address the implementation gap: ' + allRefutations[0],
      assessment_method: 'EXAMINE',
      assessment_date: asOfDay,
      confidence: computeConfidence('Other Than Satisfied', evidenceText, strength, coverageResult.ratio, defScore, 1),
      defensibility_score: defScore, concept_coverage: coverageResult.ratio,
      gap_description: 'Evidence contains explicit negative status: ' + allRefutations.join('; '),
      // FedRAMP's parameter value is a property of the objective, not of the
      // run, so it travels on the early returns too, where no gate 4 was reached.
      odp_expected: stripOdpPrefix(dif.o),
      review_required: false,
      gates
    };
  }
  // 5b self-contradiction, 5c draft/placeholder markers — both scoped to own-control evidence
  const contradictions = detectContradictions(ownEvidence || evidenceText);
  const drafts = detectDraftPlaceholders(ownEvidence || evidenceText);
  gates.push({gate:5, name:'Contradiction', pass:!contradictions.length && !drafts.length, checks:[
    {id:'5a', name:'Refutation', pass:true},
    {id:'5b', name:'Contradiction', pass:!contradictions.length},
    {id:'5c', name:'Draft', pass:!drafts.length}
  ]});
  if (contradictions.length) gaps.push('Self-contradictory evidence');
  if (drafts.length) gaps.push('Draft markers: ' + drafts.join(', '));

  // Gate 6: Temporal — use own-control evidence to avoid cross-control date bleed
  const temporalText = ownEvidence || evidenceText;
  const dates = extractDates(temporalText);
  const currency = checkCurrency(dates, asOf);
  // Undated evidence is not current. 1.4.0 stopped calling it current and
  // flagged it; it still PASSED gate 6a, so currency meant "no evidence it is
  // stale" rather than "evidence it is current" — and an objective whose
  // evidence carries no date at all had nothing establishing the thing gate 6
  // exists to establish. It fails now. On the bundled sample this moves no
  // determination (no Satisfied objective there is undated), which is the whole
  // argument for taking the strict reading: it costs nothing here and refuses
  // the claim on the packages where it would.
  const undated = currency.isCurrent === null;
  let g6pass = currency.isCurrent === true;
  const g6concerns = [];
  if (currency.isCurrent === false) g6concerns.push(currency.concerns[0] || 'no current dates');
  else if (undated) g6concerns.push('evidence carries no date — currency not established');

  // Gate 6b: Scan Cadence (FedRAMP ConMon 30-day)
  const cadenceIssue = checkScanCadence(dates, asOf);
  if (cadenceIssue) { g6pass = false; g6concerns.push(cadenceIssue); }

  // Gate 6c: Future Date Fabrication
  const futureDateIssue = checkFutureDates(dates, asOf);
  if (futureDateIssue) { g6pass = false; g6concerns.push(futureDateIssue); }

  // Gate 6d: Open Finding SLA
  const slaIssue = checkOpenFindingSla(temporalText, asOf);
  if (slaIssue) { g6pass = false; g6concerns.push(slaIssue); }

  gates.push({gate:6, name:'Temporal', pass:g6pass, checks:[
    {id:'6a', name:'Currency', pass:currency.isCurrent === true, undated},
    {id:'6b', name:'Scan cadence', pass:!cadenceIssue},
    {id:'6c', name:'Future dates', pass:!futureDateIssue},
    {id:'6d', name:'Finding SLA', pass:!slaIssue}
  ]});
  if (!g6pass) gaps.push(...g6concerns.map(c => 'Temporal: ' + c));

  // Gate 7: Determination — recorded like every other gate, so a Satisfied
  // result carries exactly seven passing records and a tally of the gates is
  // a tally of the gates.
  const allPassed = gates.every(g => g.pass);
  const defScore = scoreDefensibility(evidenceText, coverageResult.ratio, strength, dates.length > 0, contradictions.length > 0);
  const determination = allPassed ? 'Satisfied' : 'Other Than Satisfied';
  gates.push({gate:7, name:'Determination', pass:allPassed, determination});
  const conf = computeConfidence(determination, evidenceText, strength, coverageResult.ratio, defScore, contradictions.length);
  // Satisfied on thin support is flagged, not reclassified: the gates decide
  // the verdict, the floors decide whether a human must look before it is used.
  const reviewReasons = [];
  if (allPassed && conf < REVIEW_CONFIDENCE_FLOOR) reviewReasons.push('confidence ' + Math.round(conf * 100) + '% is below the ' + Math.round(REVIEW_CONFIDENCE_FLOOR * 100) + '% floor');
  if (allPassed && coverageResult.ratio < REVIEW_COVERAGE_FLOOR) reviewReasons.push('concept coverage ' + Math.round(coverageResult.ratio * 100) + '% is below the ' + Math.round(REVIEW_COVERAGE_FLOOR * 100) + '% floor');
  // Undated no longer reaches here: gate 6a fails on it, so the determination
  // is Other Than Satisfied and the gate record says why. What replaces it as a
  // floor is the parameter the build could not verify — an objective that
  // passed every gate while one of its organization-defined parameters was
  // never checked is exactly a Satisfied a human should look at. 36 of the
  // bundled sample's 153 carry one, and since 1.5.1 the flag travels on every
  // artifact.
  if (allPassed && odp.unverified.length) reviewReasons.push(odp.unverified.length + ' organization-defined parameter(s) not verified by this build: ' + odp.unverified.join('; '));
  const evRefs = strongHits.slice(0,3).map(h => h.filename).filter((v,i,a) => a.indexOf(v)===i);

  const result = {
    dif_id: dif.i, control_id: controlId, objective_id: dif.i,
    status: determination, determination: determination,
    finding: allPassed ? 'All 7 gates passed' : gaps[0] || 'Gate failure',
    evidence_description: evidenceDescription(evidenceText),
    evidence_references: evRefs,
    assessment_method: 'EXAMINE',
    assessment_date: asOfDay,
    confidence: conf,
    defensibility_score: defScore,
    concept_coverage: coverageResult.ratio,
    evidence_strength: strength.tier,
    temporal_status: undated ? 'undated' : !g6pass ? 'stale' : 'current',
    odp_resolved: odp.resolved,
    odp_unverified: odp.unverified,
    odp_expected: odp.expected,
    gap_description: gaps.join('; ') || '',
    review_required: reviewReasons.length > 0,
    review_reason: reviewReasons.join('; '),
    gates
  };

  if (allPassed) {
    result.assessor_notes = 'Deterministic mode — all 7 gates passed. Strength: ' + strength.tier + ', coverage: ' + Math.round(coverageResult.ratio*100) + '%.' +
      // No undated clause here: since 1.6.0 undated fails gate 6a, so a run
      // that reaches this branch has a date. The undated case says so through
      // the gate record and the gap description instead.
      (odp.unverified.length ? ' ' + odp.unverified.length + ' organization-defined parameter(s) not verified by this build: ' + odp.unverified.join('; ') + '.' : '');
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
    result.recommendation = 'Review the listed gaps and either supply additional evidence or implement the missing controls.';
    result.proposed_remediation = (coverageResult.uncovered || []).length ? 'Provide documentation covering: ' + (coverageResult.uncovered || []).slice(0,5).join(', ') + '.' : 'Provide stronger evidence or resolve ODP parameters.';
    result.assessor_notes = 'Deterministic mode — gates failed: ' + gates.filter(g => !g.pass && g.gate !== 7).length + '; coverage: ' + Math.round(coverageResult.ratio*100) + '%; strength: ' + strength.tier + '.';
  }

  return result;
}

// The rule set, as data. Hashed into the reproducibility receipt so a change
// to any rule changes the ruleset digest even if ENGINE_VERSION is forgotten.
//
// That has to include the matchers. The digest used to cover thresholds and
// the generic-term list and leave every pattern that decides a verdict out of
// it — the refuting phrases, the draft markers, the homoglyph map, the stem
// suffixes, the ODP value shapes, the strength signals — so a pattern-only
// edit moved verdicts and left the receipt's ruleset digest where it was. A
// regex is serialised as its source and flags, so the digest moves when the
// pattern does and only then.
const rx = (re) => ({ source: re.source, flags: re.flags });
const RULESET = Object.freeze({
  engine_version: ENGINE_VERSION,
  bm25: { k1: BM25_K1, b: BM25_B, control_id_boost: CONTROL_ID_BOOST, score: 'share of the objective\'s distinct stems the chunk names' },
  min_evidence_score: MIN_EVIDENCE_SCORE,
  min_concept_coverage: MIN_CONCEPT_COVERAGE,
  concept_terms_required: CONCEPT_TERMS_REQUIRED,
  patterns: {
    tokenizer: rx(TOKEN_RE),
    stop_words: Array.from(STOP_WORDS).sort(),
    stem_suffixes: STEM_SUFFIXES.slice(),
    stem_derivations: STEM_DERIVATIONS.map(d => d.slice()),
    stem_agree_min_chars: STEM_AGREE_MIN_CHARS,
    heading_max_chars: HEADING_MAX_CHARS,
    concept_verbs: rx(CONCEPT_VERBS),
    filler: rx(FILLER_RE),
    clause_split: rx(CLAUSE_SPLIT),
    negation: rx(NEGATION_RE),
    strength: STRENGTH_PATTERNS.map(([name, re]) => ({ name, pattern: rx(re) })),
    odp: {
      placeholder: rx(ODP_PLACEHOLDER), assignment: rx(ODP_ASSIGNMENT), selection: rx(ODP_SELECTION),
      frequency: rx(ODP_FREQ_RE), time: rx(ODP_TIME_RE), role: rx(ODP_ROLE_RE), threshold: rx(ODP_THRESH_RE),
    },
    refuting: REFUTING_PATTERNS.map(rx),
    negation_pairs: NEGATION_PAIRS.map(([a, b]) => [rx(a), rx(b)]),
    draft: rx(DRAFT_RE),
    homoglyphs: Object.keys(HOMOGLYPHS).sort().map(k => [k, HOMOGLYPHS[k]]),
    invisible: rx(INVISIBLE_RE),
    stuffing: { min_dupes: STUFFING_MIN_DUPES, dupe_share: STUFFING_DUPE_SHARE },
    evidence_description_max: EVIDENCE_DESCRIPTION_MAX,
    entities: { pattern: rx(ENTITY_RE), named: Object.keys(XML_ENTITIES).sort().map(k => [k, XML_ENTITIES[k]]) },
    control_id: rx(CONTROL_ID_RE),
    dates: DATE_PATTERNS.map(([re, fmt]) => ({ format: fmt, pattern: rx(re) })),
    date_context: CTX_PATTERNS.map(([re, ctx]) => ({ context: ctx, pattern: rx(re) })),
    currency_deciding_context: CURRENCY_DECIDING_CTX.slice(),
    scan_context: rx(SCAN_CONTEXT_RE),
    past_action: rx(PAST_ACTION_RE),
    future_plan: rx(FUTURE_PLAN_RE),
    finding_noun: rx(FINDING_NOUN_RE),
    open_status: rx(OPEN_STATUS_RE),
    closure: rx(CLOSURE_RE),
    severity: rx(SEVERITY_RE),
    archive_housekeeping: rx(ARCHIVE_HOUSEKEEPING_RE),
  },
  // Gate 2 reads subject matter, not compliance vocabulary: a concept is covered
  // only by a term that is not in this list, and evidence that never names the
  // control's subject cannot satisfy it (gate 2b).
  generic_terms: Array.from(GENERIC_TERMS).sort(),
  subject_required: true,
  // A title word shared with most of the catalog names no subject of its own:
  // `access` is in 71 of 447 control titles, so it cannot be what makes evidence
  // about PE-2. And where a subject has two or more sharp words, evidence has to
  // name two of them — one match let "recorded in the ticketing system" satisfy
  // "Visitor Access Records". The frequencies come from the catalog, which the
  // catalog digest already covers; these are the parameters over them.
  subject_ambient_max_share: SUBJECT_AMBIENT_MAX_SHARE,
  subject_terms_required: SUBJECT_TERMS_REQUIRED,
  review_confidence_floor: REVIEW_CONFIDENCE_FLOOR,
  review_coverage_floor: REVIEW_COVERAGE_FLOOR,
  staleness_days: STALENESS,
  scan_cadence_days: SCAN_CADENCE_DAYS,
  sla_days: SLA_DAYS,
  refutation_attribution: {
    rule: 'closest preceding control id owns a refutation; else the closest following id within following_scope_chars; else the only id named',
    following_scope_chars: REFUTATION_FOLLOWING_SCOPE_CHARS
  },
  gates: ['Presence', 'Concepts', 'Strength', 'ODP', 'Contradiction', 'Temporal', 'Determination']
});

global.SparkAEEngine = {
  ENGINE_VERSION: ENGINE_VERSION,
  RULESET: RULESET,
  GATE_NAMES: RULESET.gates,
  SUPPORTED_EXTENSIONS: SUPPORTED_EXTENSIONS,
  BM25Retriever: BM25Retriever,
  assessDif: assessDif,
  buildRefutationIndex: buildRefutationIndex,
  parseFile: parseFile,
  parsePackage: parsePackage,
  parseZip: parseZip,
  parseZipReport: parseZipReport,
  parseDocx: parseDocx,
  docxText: docxText,
  decodeEntities: decodeEntities,
  evidenceLooksStuffed: evidenceLooksStuffed,
  evidenceDescription: evidenceDescription,
  stripOdpPrefix: stripOdpPrefix,
  unzip: unzip,
  chunkText: chunkText,
  checkCoverage: checkCoverage,
  controlSubjectTerms: controlSubjectTerms,
  mentionsSubject: mentionsSubject,
  objectiveAnchorStems: objectiveAnchorStems,
  extractConcepts: extractConcepts,
  extractOdps: extractOdps,
  validateOdps: validateOdps,
  scoreEvidence: scoreEvidence,
  detectRefutations: detectRefutations,
  detectRefutationsScoped: detectRefutationsScoped,
  checkCurrency: checkCurrency,
  checkOpenFindingSla: checkOpenFindingSla,
  foldHomoglyphs: foldHomoglyphs,
  stemWord: stemWord,
  stemsAgree: stemsAgree,
  crc32: crc32,
  tokenize: tokenize,
  extractControlIds: extractControlIds,
  extractDates: extractDates,
  utcCalendarDate: utcCalendarDate,
  grade: grade,
  classifyGapType: classifyGapType,
  scoreDefensibility: scoreDefensibility,
  computeConfidence: computeConfidence,
  calcRiskExposure: calcRiskExposure,
  likelihoodFor: likelihoodFor,
  impactFor: impactFor,
  weaknessTypeFor: weaknessTypeFor,
};

})(typeof window !== "undefined" ? window : this);
