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
async function parseFile(file) {
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'nessus' || ext === 'xml' || ext === 'json' || ext === 'csv') {
    const text = await file.text();
    if (!text || !text.trim()) throw unsupported(name, 'file is empty');
    return chunkText(text, name);
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
async function parsePackage(files) {
  const chunks = [], parsed = [], skipped = [];
  for (const f of files) {
    const ext = ((f.name || '').split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'zip') {
        const r = await parseZipReport(f);
        chunks.push(...r.chunks); parsed.push(...r.parsed); skipped.push(...r.skipped);
      } else {
        chunks.push(...await parseFile(f));
        parsed.push(f.name);
      }
    } catch (e) {
      skipped.push({ name: f.name, reason: e && e.message ? e.message : String(e) });
    }
  }
  return { chunks, parsed, skipped };
}

// The text of a DOCX, from its bytes. A DOCX is a ZIP holding XML, and the
// bytes are all this needs — so the same reader serves a .docx the visitor
// selected and a .docx sitting inside an uploaded package. Taking a buffer
// rather than a File is the whole reason the nested case is now readable.
//
// `budget` is the enclosing archive's remaining expansion allowance, passed in
// for a nested DOCX so that a package of many DOCX members cannot expand past
// the limit one member at a time.
async function docxText(buf, label, budget) {
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
  const text = docXml
    .replace(/<w:br[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n\n')
    .replace(/<\/w:r>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw unsupported(label, 'DOCX contains no text');
  return text;
}

async function parseDocx(file) {
  try {
    return chunkText(await docxText(await file.arrayBuffer(), file.name), file.name);
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
// Member types a reader parses from bytes rather than from decoded text.
// Decoding these to text destroys them. The engine reads DOCX itself; XLSX is
// a server-product format the engine still refuses for the corpus, but the
// upload panel classifies it, and it can only do that from the bytes.
const BINARY_MEMBER_EXTENSIONS = ['docx', 'xlsx'];
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
function findEOCD(view, len) {
  const from = Math.max(0, len - 65557);
  for (let i = len - 22; i >= from; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

// `budget` is optional: a nested archive is handed the enclosing archive's
// remaining allowance, so a package of many DOCX members cannot expand past the
// limit one member at a time. Omitted, an archive gets a fresh allowance.
async function unzip(buffer, failures, sharedBudget) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const members = [];
  const budget = sharedBudget || { left: ZIP_MAX_BYTES };
  const eocd = findEOCD(view, bytes.length);
  if (eocd < 0) {
    if (failures) failures.push({ name: '(archive)', reason: 'no ZIP central directory found — the file is not a ZIP, or is truncated' });
    return members;
  }
  const count = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);
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
    const name = new TextDecoder().decode(bytes.slice(cd + 46, cd + 46 + nameLen));
    entries.push({
      name,
      method: view.getUint16(cd + 10, true),
      compSize: view.getUint32(cd + 20, true),
      localAt: view.getUint32(cd + 42, true),
    });
    if (!name.endsWith('/')) nameCount[name] = (nameCount[name] || 0) + 1;
    cd += 46 + nameLen + extraLen + commentLen;
  }

  // Pass two reads what the inventory says is unambiguous.
  for (const { name, method, compSize, localAt } of entries) {
    if (name.endsWith('/')) { members.push({ name, text: '', directory: true }); continue; }
    // Two members of one name are two documents claiming to be the same one.
    // Reading either is a guess about which the author meant, and the two may
    // contradict each other, so neither is read and both are named.
    if (nameCount[name] > 1) {
      if (failures) failures.push({ name, reason: 'archive carries ' + nameCount[name] + ' members named this — ambiguous, so none of them is read' });
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

async function parseZipReport(file) {
  const buf = await file.arrayBuffer();
  const skipped = [];
  // One allowance for the package and everything nested inside it.
  const budget = { left: ZIP_MAX_BYTES };
  const members = await unzip(buf, skipped, budget);
  const chunks = [], parsed = [];
  // unzip() has already refused every member of an ambiguous name, counted from
  // the central directory, so everything here is a member the archive names
  // once. Member order is the archive's own order, fixed for a given file.
  for (const { name, text: content, bytes, directory } of members) {
    if (directory) continue;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['xml', 'txt', 'md', 'csv', 'json', 'nessus'].includes(ext)) {
      if (content && content.trim()) { chunks.push(...chunkText(content, name)); parsed.push(name); }
      else skipped.push({ name, reason: 'archive member is empty' });
    } else if (ext === 'docx') {
      // A DOCX inside a package is the ordinary shape of a real submission: the
      // SSP is a Word file and the package is a ZIP. Refusing it meant the one
      // document the assessment most depends on was the one excluded, so a run
      // reached Complete having read the README and not the SSP.
      if (!bytes) {
        skipped.push({ name, reason: 'DOCX member could not be read as binary content' });
      } else {
        try {
          const text = await docxText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name, budget);
          chunks.push(...chunkText(text, name));
          parsed.push(name);
        } catch (e) {
          skipped.push({ name, reason: (e && e.message) ? e.message : String(e) });
        }
      }
    } else {
      skipped.push({ name, reason: 'unsupported archive member type .' + ext });
    }
  }
  if (!parsed.length && !skipped.length) throw unsupported(file.name, 'ZIP contains no readable members');
  return { chunks, parsed, skipped };
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
// Below either floor the result carries `review_required: true` and says why.
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
const ENGINE_VERSION = '1.3.0';

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
function stemWord(w) {
  w = String(w).toLowerCase();
  for (const sfx of STEM_SUFFIXES) {
    if (w.endsWith(sfx) && w.length > sfx.length + 2) return w.slice(0, -sfx.length);
  }
  return w;
}
const WORD_RE = /[a-z0-9-]+/g;
function clauseStems(clause) {
  const out = new Set();
  for (const w of String(clause).toLowerCase().match(WORD_RE) || []) out.add(stemWord(w));
  return out;
}

const GENERIC_STEMS = new Set(Array.from(GENERIC_TERMS).map(stemWord));

// The distinguishing terms of a phrase, as stems: what it is about, once the
// compliance vocabulary is set aside.
function distinguishingTerms(phrase) {
  const out = [];
  for (const w of String(phrase || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9-]+/)) {
    if (w.length <= 3 || STOP_WORDS.has(w)) continue;
    const st = stemWord(w);
    if (GENERIC_STEMS.has(st) || GENERIC_TERMS.has(w)) continue;
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
      if (GENERIC_STEMS.has(stemWord(w)) || GENERIC_TERMS.has(w)) continue;
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
function mentionsSubject(evidenceText, terms) {
  if (!terms.length) return true;           // nothing to anchor on; gate 2a decides
  if (!evidenceText) return false;
  const need = Math.min(SUBJECT_TERMS_REQUIRED, terms.length);
  const found = new Set();
  const clauses = String(evidenceText).split(CLAUSE_SPLIT).filter(c => c.trim());
  for (const clause of clauses) {
    if (NEGATION_RE.test(clause)) continue;
    const stems = clauseStems(clause);
    for (const t of terms) if (stems.has(t)) found.add(t);
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
    let found = false;
    for (const clause of clauses) {
      if (NEGATION_RE.test(clause)) continue;
      const stems = clauseStems(clause);
      if (terms.some(t => stems.has(t))) { found = true; break; }
    }
    (found ? covered : uncovered).push(concept);
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
      let ctxType = 'unknown';
      for (const [cp, ct] of CTX_PATTERNS) { if (cp.test(surrounding)) { ctxType = ct; break; } }
      found.push({dateStr: m[0], dateObj, ctxType, surrounding});
    }
  }
  const seen = new Set();
  return found.filter(d => { if (seen.has(d.dateStr)) return false; seen.add(d.dateStr); return true; })
    .sort((a, b) => b.dateObj - a.dateObj);
}

function checkCurrency(dates, assessmentDate) {
  if (!dates.length) return {isCurrent:true, staleDays:0, concerns:[]};
  const ad = assessmentDate; // supplied by assessDif — never the clock
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
const DATE_TOKEN_RE = /(\d{4}-\d{2}-\d{2})/g;
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
    const dateToks = [...sent.matchAll(DATE_TOKEN_RE)].map(m => {
      // UTC + round-trip check, same as extractDates.
      try { const [y,mo,d] = m[1].split('-').map(Number); return utcCalendarDate(y,mo,d); } catch(e) { return null; }
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
    // REFUTING_PATTERNS are lower-case and carry no
    // /i flag; detectRefutations / detectRefutationsScoped lower-case before
    // matching but this index did not, so a sentence-initial "Not implemented"
    // was never indexed. Match on the lowered text (positions are compared
    // against control-id offsets in the original, the same convention
    // detectRefutationsScoped uses).
    const lowered = txt.toLowerCase();
    for (const pat of REFUTING_PATTERNS) {
      const m = execPattern(pat, lowered);
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
    const g2b = mentionsSubject(ownEvidence || evidenceText, subject);
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
  // stuffing (checked on own-control evidence, not cross-control BM25 results)
  const strength = scoreEvidence(evidenceText);
  const g3a = strength.tier !== 'weak' && strength.tier !== 'unknown';
  const stuffed = evidenceLooksStuffed(ownEvidence || evidenceText);
  gates.push({gate:3, name:'Strength', pass:g3a && !stuffed, checks:[
    {id:'3a', name:'Traceability', pass:g3a},
    {id:'3b', name:'Stuffing', pass:!stuffed}
  ]});
  if (!g3a) gaps.push('Evidence strength: ' + strength.tier + ' — no traceable references');
  if (stuffed) gaps.push('Evidence appears keyword-stuffed');

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
    gates.push({gate:5, name:'Contradiction', pass:false, checks:[{id:'5a', name:'Refutation', pass:false}]});
    gates.push({gate:7, name:'Determination', pass:false, determination:'Other Than Satisfied'});
    return {
      dif_id: dif.i, control_id: controlId, objective_id: dif.i,
      status: 'Other Than Satisfied', determination: 'Other Than Satisfied',
      finding: 'Refuting evidence found: ' + allRefutations[0],
      evidence_description: evidenceText.slice(0, 500), evidence_references: strongHits.slice(0,3).map(h => h.filename),
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
  let g6pass = currency.isCurrent;
  const g6concerns = [];
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

  gates.push({gate:6, name:'Temporal', pass:g6pass, checks:[
    {id:'6a', name:'Currency', pass:currency.isCurrent},
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
  const evRefs = strongHits.slice(0,3).map(h => h.filename).filter((v,i,a) => a.indexOf(v)===i);

  const result = {
    dif_id: dif.i, control_id: controlId, objective_id: dif.i,
    status: determination, determination: determination,
    finding: allPassed ? 'All 7 gates passed' : gaps[0] || 'Gate failure',
    evidence_description: evidenceText.slice(0, 500),
    evidence_references: evRefs,
    assessment_method: 'EXAMINE',
    assessment_date: asOfDay,
    confidence: conf,
    defensibility_score: defScore,
    concept_coverage: coverageResult.ratio,
    evidence_strength: strength.tier,
    temporal_status: g6pass ? 'current' : 'stale',
    gap_description: gaps.join('; ') || '',
    review_required: reviewReasons.length > 0,
    review_reason: reviewReasons.join('; '),
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
    result.recommendation = 'Review the listed gaps and either supply additional evidence or implement the missing controls.';
    result.proposed_remediation = (coverageResult.uncovered || []).length ? 'Provide documentation covering: ' + (coverageResult.uncovered || []).slice(0,5).join(', ') + '.' : 'Provide stronger evidence or resolve ODP parameters.';
    result.assessor_notes = 'Deterministic mode — gates failed: ' + gates.filter(g => !g.pass && g.gate !== 7).length + '; coverage: ' + Math.round(coverageResult.ratio*100) + '%; strength: ' + strength.tier + '.';
  }

  return result;
}

// The rule set, as data. Hashed into the reproducibility receipt so a change
// to any threshold changes the ruleset digest even if ENGINE_VERSION is
// forgotten. Regex pattern lists are covered by the version bump rule above.
const RULESET = Object.freeze({
  engine_version: ENGINE_VERSION,
  bm25: { k1: BM25_K1, b: BM25_B, control_id_boost: CONTROL_ID_BOOST },
  min_evidence_score: MIN_EVIDENCE_SCORE,
  min_concept_coverage: MIN_CONCEPT_COVERAGE,
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
  refutation_windows: {
    near_control_chars: REFUTATION_NEAR_CONTROL_CHARS,
    near_other_chars: REFUTATION_NEAR_OTHER_CHARS,
    index_scope_chars: REFUTATION_INDEX_SCOPE_CHARS
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
  unzip: unzip,
  chunkText: chunkText,
  checkCoverage: checkCoverage,
  controlSubjectTerms: controlSubjectTerms,
  mentionsSubject: mentionsSubject,
  extractConcepts: extractConcepts,
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
