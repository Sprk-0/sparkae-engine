// SparkAE standalone-demo export builders.
//
// Extracted from demo-standalone.html so the artifact shapes are testable
// without a DOM. Every function here is pure: it takes the demo's STATE and
// returns a string or a plain object. The page keeps the download plumbing
// (Blob/anchor/toast); this file owns what goes *inside* the file.
//
// Why it exists: the demo used to carry its own hand-rolled OSCAL emitter
// that had drifted away from the server-side one. It emitted
// `finding.related-controls` and `finding.associated-risks` — neither is a
// property of the OSCAL 1.1.2 `finding` assembly, which is
// `additionalProperties: false` — omitted the required
// `result.reviewed-controls`, and passed raw 800-53A objective ids
// ("AC-1_a.[01]") straight into `target-id`, which is an OSCAL
// TokenDatatype and rejects brackets and parens. A download advertised as
// "OSCAL v1.1.2" failed the official NIST schema in the thousands.
//
// The shapes below mirror the server product's OSCAL exporter (private
// repository: src/services/oscal_exporter.py — generate_assessment_results /
// generate_poam), which was brought to official-schema conformance first.
// Keep the two in step. The official NIST OSCAL 1.1.2 assessment-results
// schema is vendored alongside this file in the public repository
// (tests/schema/) and the public CI validates every build's output against
// it; the private suite runs the same check with the backend's validator.
//
// Determinism. Nothing here reads a clock or a random source. Every UUID is
// RFC 4122 v5 (SHA-1) derived from the run's evidence digest and a stable
// name, and every timestamp comes from the assessment date the caller
// supplies. Build the same artifact twice from the same state and the bytes
// are identical — which is the property a reviewer will check with sha256.
// Callers that need a different id scheme inject `opts.uuid`.

var DEMO_EXPORTS = (function () {
  'use strict';

  var FEDRAMP_NS = 'https://fedramp.gov/ns/oscal';
  // Namespace for SparkAE's own metadata props (the reproducibility receipt).
  var SPARKAE_NS = 'urn:onesolutioncyber:sparkae:reference-engine';

  // ── Identifier normalization ───────────────────────────────────────────
  // Mirrors oscal_exporter._to_oscal_control_id.
  //   "AC-1"       -> "ac-1"
  //   "AC-2(1)"    -> "ac-2.1"
  //   "SI-4(4)(a)" -> "si-4.4.a"
  function toOscalControlId(catalogId) {
    if (!catalogId) return '';
    var out = String(catalogId).trim().toLowerCase();
    out = out.replace(/\((\d+)\)/g, '.$1');
    out = out.replace(/\(([a-z]+)\)/g, '.$1');
    return out;
  }

  // Mirrors oscal_exporter._to_oscal_token. OSCAL tokens are NCNames:
  // ^(\p{L}|_)(\p{L}|\p{N}|[.\-_])*$ — so the bracket/paren groups that
  // 800-53A objective ids use ("AC-1_a.(1)a.[01]") have to become dot
  // segments. The raw id stays visible in the finding title.
  function toOscalToken(value) {
    var out = String(value == null ? '' : value).trim();
    out = out.replace(/[[(]+/g, '.');
    out = out.replace(/[\])]+/g, '');
    out = out.replace(/[^0-9A-Za-z_.\-]/g, '-');
    out = out.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
    if (!out) return '_';
    if (!/^[A-Za-z_]/.test(out)) out = '_' + out;
    return out;
  }

  // ── Digests ────────────────────────────────────────────────────────────
  // A synchronous SHA-1 (FIPS 180-4) over UTF-8. The builders are synchronous
  // and crypto.subtle is async-only, so the hash is implemented here; it is
  // used for identifiers and receipts, never as security material.
  function utf8Bytes(str) {
    var s = String(str), out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
        var d = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function sha1Bytes(bytes) {
    var ml = bytes.length;
    var withOne = bytes.concat([0x80]);
    while (withOne.length % 64 !== 56) withOne.push(0);
    var bitLen = ml * 8;
    // 64-bit big-endian length; inputs here are far below 2^32 bytes.
    withOne.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var w = new Array(80);
    function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
    for (var off = 0; off < withOne.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = (withOne[off + i * 4] << 24) | (withOne[off + i * 4 + 1] << 16) |
               (withOne[off + i * 4 + 2] << 8) | withOne[off + i * 4 + 3];
      }
      for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      var a = h0, b = h1, c = h2, d = h3, e = h4, f, k, t;
      for (i = 0; i < 80; i++) {
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        t = (rotl(a, 5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = [];
    [h0, h1, h2, h3, h4].forEach(function (h) {
      out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
    });
    return out;
  }

  function hex(bytes) {
    return bytes.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }

  function sha1Hex(str) { return hex(sha1Bytes(utf8Bytes(str))); }

  // ── UUIDs ──────────────────────────────────────────────────────────────
  // RFC 4122 v5: SHA-1 of namespace bytes + name, version/variant bits set.
  function uuidV5(namespace, name) {
    var nsBytes = namespace.replace(/-/g, '').match(/.{2}/g).map(function (h) { return parseInt(h, 16); });
    var b = sha1Bytes(nsBytes.concat(utf8Bytes(name))).slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50; // version 5
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    var h = hex(b);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20);
  }

  // The engine's own namespace: v5 of the RFC 4122 DNS namespace and a fixed
  // name, so it is a constant that anyone can recompute.
  var DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  var ENGINE_UUID_NS = uuidV5(DNS_NS, 'sparkae-reference-engine');

  // A UUID factory bound to one run. Every call names a distinct, ordered
  // identifier under the run's seed — so the ids are unique within the
  // document and identical across builds of the same state.
  function uuidFactory(seed) {
    var i = 0;
    return function (name) {
      var n = name != null ? String(name) : ('#' + (i++));
      return uuidV5(ENGINE_UUID_NS, String(seed) + '\u001f' + n);
    };
  }

  // ── Reproducibility receipt ────────────────────────────────────────────
  // The tuple that makes a verdict reproducible, each part digested:
  //   engine version · catalog digest · ruleset digest · evidence digest ·
  //   assessment date  →  verdict digest
  // Two runs with the same first five parts must produce the same sixth;
  // artifacts built from the same receipt are byte-identical.
  function stableJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stableJson(v[k]); }).join(',') + '}';
  }

  function buildReceipt(input) {
    input = input || {};
    var chunks = input.chunks || [];
    var evidence = chunks.map(function (c) {
      return (c.filename || '') + '\u001e' + (c.offset != null ? c.offset : '') + '\u001e' + (c.text || '');
    }).join('\u001d');
    var findings = input.findings || [];
    var verdictLines = findings.map(function (f) {
      return [f.dif_id || f.objective_id || '', f.status || '', f.control_id || '',
        f.confidence != null ? Number(f.confidence).toFixed(4) : '',
        f.defensibility_score != null ? f.defensibility_score : ''].join('|');
    }).sort();
    var receipt = {
      engine_version: input.engineVersion || '',
      catalog_version: input.catalogVersion || '',
      catalog_digest: input.catalogDigest || (input.catalog ? sha1Hex(stableJson(input.catalog)) : ''),
      ruleset_digest: input.ruleset ? sha1Hex(stableJson(input.ruleset)) : '',
      evidence_digest: sha1Hex(evidence),
      evidence_files: chunks.reduce(function (acc, c) {
        if (c.filename && acc.indexOf(c.filename) === -1) acc.push(c.filename);
        return acc;
      }, []).sort(),
      assessment_date: input.assessmentDate || '',
      baseline: input.baseline || '',
      objectives: findings.length,
      verdict_digest: sha1Hex(verdictLines.join('\n')),
      assessment_method: 'EXAMINE',
      interview_test: 'not performed — remain with the assessor'
    };
    receipt.receipt_digest = sha1Hex(stableJson(receipt));
    return receipt;
  }

  // The instant an artifact is stamped with. Never the wall clock: the
  // assessment date is the run's declared date, so the same run yields the
  // same `published` / `collected` values on every build.
  function stampFor(state, opts) {
    if (opts && opts.now) return opts.now;
    var d = state && (state.assessment_date || (state.receipt && state.receipt.assessment_date));
    if (d) return String(d).length === 10 ? d + 'T00:00:00Z' : String(d);
    throw new Error('demo-exports: state.assessment_date (or opts.now) is required — the exporters do not read the clock');
  }

  function uuidFor(state, opts) {
    if (opts && opts.uuid) return opts.uuid;
    var seed = (state && state.receipt && state.receipt.receipt_digest) ||
               (state && state.seed) || '';
    if (!seed) throw new Error('demo-exports: state.receipt or state.seed is required to derive identifiers — the exporters use no randomness');
    return uuidFactory(seed);
  }

  // OSCAL metadata props carrying the receipt, so the document itself says
  // what produced it.
  function receiptProps(state) {
    var r = state && state.receipt;
    if (!r) return [];
    return [
      ['engine-version', r.engine_version],
      ['catalog-version', r.catalog_version],
      ['catalog-digest', r.catalog_digest],
      ['ruleset-digest', r.ruleset_digest],
      ['evidence-digest', r.evidence_digest],
      ['assessment-date', r.assessment_date],
      ['verdict-digest', r.verdict_digest],
      ['assessment-method', 'EXAMINE'],
      ['interview-and-test', 'not-performed']
    ].filter(function (p) { return p[1] !== undefined && p[1] !== null && p[1] !== ''; })
     .map(function (p) { return { name: p[0], ns: SPARKAE_NS, value: String(p[1]) }; });
  }

  // ── CSV ────────────────────────────────────────────────────────────────
  // Neutralize spreadsheet formula injection: a leading =+-@ (or a leading
  // tab/CR, which Excel strips before parsing) turns a data cell into a
  // formula on open.
  function csvSafe(v) {
    var s = String(v == null ? '' : v);
    return s && '=+-@\t\r'.indexOf(s[0]) !== -1 ? "'" + s : s;
  }

  function csvRow(fields) {
    return fields.map(function (f) {
      return '"' + csvSafe(f).replace(/"/g, '""') + '"';
    }).join(',');
  }

  function csvDoc(headers, rows) {
    return csvRow(headers) + '\n' + rows.join('\n');
  }

  // ── OSCAL Assessment Results ───────────────────────────────────────────
  //
  // state.assessment_date  the run's declared date (YYYY-MM-DD) — required
  //                        unless opts.now is given.
  // state.receipt          buildReceipt() output — its digest seeds the
  //                        UUIDs and its fields are stamped into metadata.
  // opts.now       ISO-8601 timestamp override.
  // opts.uuid      UUID factory override (the private test harness injects a
  //                counter; the page relies on the receipt-derived default).
  //
  // Structure follows oscal_exporter.generate_assessment_results:
  //   * control linkage rides as a FedRAMP-namespaced prop on the finding,
  //     because OSCAL 1.1.2 findings have no control-selection assembly;
  //     the result-level reviewed-controls carries the authoritative
  //     selection.
  //   * risks live at results[].risks[] and are referenced by uuid, not
  //     embedded in the finding.
  //   * every observation referenced by a finding is actually emitted —
  //     a dangling observation-uuid is a cross-reference violation.
  //   * arrays the schema requires non-empty when present are omitted
  //     entirely when there is nothing to say.
  function buildAssessmentResults(state, opts) {
    opts = opts || {};
    var now = stampFor(state, opts);
    var uuid = uuidFor(state, opts);
    var findings = state.findings || [];
    var baseline = state.baseline || 'Low';

    var oscalFindings = [];
    var observations = [];
    var risks = [];

    // Observation subjects are UUID *references*. Minting a fresh uuid per
    // observation satisfied the JSON Schema (the field is just a uuid) but
    // resolved to nothing, so a downstream consumer could not tell what was
    // assessed. Declare the system under assessment once, in
    // results[].local-definitions.components[], and point every observation at
    // it — the enum for subject type is component / inventory-item / location
    // / party / user / resource, and "component" is the honest one here.
    var subjectUuid = uuid();
    var subjectComponent = {
      uuid: subjectUuid,
      type: 'this-system',
      title: (opts.systemName || 'System under assessment'),
      description: 'The cloud service offering assessed in this run.',
      status: { state: 'operational' }
    };

    findings.forEach(function (f) {
      var satisfied = f.status === 'Satisfied';
      var objectiveId = f.objective_id || f.dif_id || '';
      var findingUuid = uuid();
      var description = (satisfied ? f.evidence_description : f.weakness_description) ||
        ('Examine-method assessment of ' + objectiveId);

      var finding = {
        uuid: findingUuid,
        title: 'Assessment of ' + objectiveId,
        description: description,
        target: {
          type: 'objective-id',
          'target-id': toOscalToken(objectiveId),
          status: { state: satisfied ? 'satisfied' : 'not-satisfied' }
        },
        props: [
          { name: 'control-id', ns: FEDRAMP_NS, value: toOscalControlId(f.control_id) }
        ]
      };

      // "Not Reviewed" is not an OSCAL objective state — it collapses to
      // not-satisfied above, so record the real determination as a prop
      // rather than silently presenting an untested objective as a
      // tested-and-failed one.
      if (!satisfied && f.status !== 'Other Than Satisfied') {
        finding.props.push({ name: 'determination', ns: FEDRAMP_NS, value: String(f.status || '') });
      }

      if (satisfied) {
        var refs = f.evidence_references || [];
        if (refs.length) {
          finding['related-observations'] = refs.map(function (ref) {
            var obsUuid = uuid();
            observations.push({
              uuid: obsUuid,
              title: 'Evidence reference: ' + ref,
              description: f.evidence_description || ('Evidence for ' + objectiveId),
              methods: ['EXAMINE'],
              types: ['finding'],
              subjects: [{
                type: 'component',
                'subject-uuid': subjectUuid,
                title: subjectComponent.title
              }],
              'relevant-evidence': [{ description: String(ref) }],
              collected: now
            });
            return { 'observation-uuid': obsUuid };
          });
        }
      } else if (f.status === 'Other Than Satisfied') {
        var riskUuid = uuid();
        finding['related-risks'] = [{ 'risk-uuid': riskUuid }];
        var risk = {
          uuid: riskUuid,
          title: f.weakness_name || ('Risk for ' + objectiveId),
          description: f.risk_statement || f.weakness_description || description,
          statement: f.risk_statement || f.weakness_description || description,
          status: 'open',
          characterizations: [{
            origin: { actors: [{ type: 'tool', 'actor-uuid': uuid() }] },
            facets: [
              { name: 'likelihood', system: FEDRAMP_NS, value: String(f.likelihood_before || 'Low').toLowerCase() },
              { name: 'impact', system: FEDRAMP_NS, value: String(f.impact_before || 'Low').toLowerCase() },
              { name: 'risk', system: FEDRAMP_NS, value: String(f.risk_exposure_before || 'Low').toLowerCase() }
            ]
          }],
          remediations: [{
            uuid: uuid(),
            lifecycle: 'recommendation',
            title: f.recommendation || ('Remediation for ' + objectiveId),
            description: f.proposed_remediation || f.recommendation || 'Requires remediation'
          }]
        };
        // The schema requires a non-empty array when the key is present.
        if (f.mitigating_factors) {
          risk['mitigating-factors'] = [{ uuid: uuid(), description: f.mitigating_factors }];
        }
        risks.push(risk);
      }

      oscalFindings.push(finding);
    });

    var controlIds = Object.keys(findings.reduce(function (acc, f) {
      if (f.control_id) acc[toOscalControlId(f.control_id)] = 1;
      return acc;
    }, {})).sort();

    var result = {
      uuid: uuid(),
      title: 'SparkAE Browser Assessment',
      description: 'Preview assessment generated in-browser by the SparkAE demo (' +
        baseline + ' baseline). Not an assessor-reviewed deliverable.',
      start: now,
      end: now,
      // Required by the schema. include-controls must be non-empty when
      // present, so a run with no findings gets a bare selection object.
      'reviewed-controls': {
        'control-selections': [
          controlIds.length
            ? { 'include-controls': controlIds.map(function (c) { return { 'control-id': c }; }) }
            : {}
        ]
      }
    };
    // Only declared when something actually references it.
    if (observations.length) {
      result['local-definitions'] = { components: [subjectComponent] };
      result.observations = observations;
    }
    if (risks.length) result.risks = risks;
    if (oscalFindings.length) result.findings = oscalFindings;

    // opts.metadata merges into the metadata block — roles, parties, and
    // responsible-parties for callers that model an assessing organization
    // (the lifecycle walkthrough does; the Rev5 export does not). Merged
    // rather than replaced so the required fields below cannot be dropped by
    // a caller.
    var metadata = {
      title: opts.title ||
        ('FedRAMP ' + baseline + ' Baseline Assessment Results (SparkAE demo preview)'),
      published: now,
      'last-modified': now,
      version: '1.0',
      'oscal-version': '1.1.2'
    };
    var props = receiptProps(state);
    if (props.length) metadata.props = props;
    if (opts.metadata) {
      Object.keys(opts.metadata).forEach(function (k) {
        if (opts.metadata[k] !== undefined) metadata[k] = opts.metadata[k];
      });
      // Non-negotiable: the version the document declares is the version this
      // builder actually emits.
      metadata['oscal-version'] = '1.1.2';
    }

    return {
      'assessment-results': {
        uuid: uuid(),
        metadata: metadata,
        'import-ap': { href: '#' },
        results: [result]
      }
    };
  }

  // ── Tabular deliverables ───────────────────────────────────────────────

  var FINDINGS_HEADERS = ['Control ID', 'Objective ID', 'Determination', 'Evidence Description',
    'Evidence References', 'Assessor Notes', 'Weakness Name', 'Weakness Description',
    'Weakness Type', 'Applicable Threats', 'Likelihood (Before)', 'Impact (Before)',
    'Risk Exposure (Before)', 'Risk Statement', 'Mitigating Factors', 'Likelihood (After)',
    'Impact (After)', 'Risk Exposure (After)', 'Recommendation', 'Proposed Remediation',
    'Assessed At', 'Evidence Strength', 'Defensibility Score', 'Concept Coverage',
    'Temporal Status'];

  function buildFindingsCSV(state, opts) {
    opts = opts || {};
    var today = stampFor(state, opts).slice(0, 10);
    var rows = (state.findings || []).map(function (f) {
      return csvRow([
        f.control_id, f.objective_id || f.dif_id, f.status,
        f.evidence_description || '', (f.evidence_references || []).join('; '), f.assessor_notes || '',
        f.weakness_name || '', f.weakness_description || '', f.weakness_type || '', '',
        f.likelihood_before || '', f.impact_before || '', f.risk_exposure_before || '',
        f.risk_statement || '', f.mitigating_factors || '', '', '', '',
        f.recommendation || '', f.proposed_remediation || '',
        today, f.evidence_strength || '',
        f.defensibility_score != null ? f.defensibility_score : '',
        f.concept_coverage != null ? f.concept_coverage.toFixed(2) : '',
        f.temporal_status || ''
      ]);
    });
    return csvDoc(FINDINGS_HEADERS, rows);
  }

  var RET_HEADERS = ['RET / POA&M ID', 'Controls', 'Weakness Name', 'Weakness Description',
    'Weakness Detector Source', 'Weakness Source Identifier', 'Asset Identifier',
    'Original Detection Date', 'Vendor Dependency', 'Vendor Dependent Product Name',
    'Original Risk Rating', 'Adjusted Risk Rating', 'Risk Adjustment', 'False Positive',
    'Operational Requirement', 'Deviation Rationale', 'Comments'];

  function buildRET(state, opts) {
    opts = opts || {};
    var today = stampFor(state, opts).slice(0, 10);
    var rows = (state.findings || [])
      .filter(function (f) { return f.status === 'Other Than Satisfied'; })
      .map(function (f, i) {
        return csvRow([
          'RET-' + String(i + 1).padStart(4, '0'), f.control_id, f.weakness_name || f.finding,
          f.weakness_description || f.gap_description || '', 'SparkAE Automated Assessment',
          f.objective_id || f.dif_id, '', today, 'No', '',
          f.risk_exposure_before || 'Moderate', '', 'No', 'No', 'No', '', f.assessor_notes || ''
        ]);
      });
    return csvDoc(RET_HEADERS, rows);
  }

  var POAM_HEADERS = ['POA&M ID', 'Controls', 'Weakness Name', 'Weakness Description',
    'Weakness Detector Source', 'Weakness Source Identifier', 'Asset Identifier',
    'Point of Contact', 'Resources Required', 'Remediation Plan',
    'Original Detection Date', 'Scheduled Completion Date', 'Status Date',
    'Vendor Dependency', 'Last Vendor Check-in Date', 'Vendor Dependent Product Name',
    'Original Risk Rating', 'Adjusted Risk Rating', 'Risk Adjustment', 'False Positive',
    'Operational Requirement', 'Deviation Rationale', 'Supporting Documents', 'Comments',
    'Binding Operational Directive 22-01 tracking', 'BOD 22-01 Due Date', 'CVE'];

  function buildPOAM(state, opts) {
    opts = opts || {};
    var today = stampFor(state, opts).slice(0, 10);
    var rows = (state.findings || [])
      .filter(function (f) { return f.status !== 'Satisfied'; })
      .map(function (f, i) {
        return csvRow([
          'POAM-' + String(i + 1).padStart(4, '0'), f.control_id, f.weakness_name || f.finding,
          f.weakness_description || f.gap_description || '', 'SparkAE Automated Assessment',
          f.objective_id || f.dif_id, '', '', 'Assessment team review',
          f.proposed_remediation || 'Requires remediation',
          today, '', today, 'No', '', '',
          f.risk_exposure_before || 'Moderate', '', 'No', 'No', 'No', '', '', f.assessor_notes || '',
          '', '', ''
        ]);
      });
    return csvDoc(POAM_HEADERS, rows);
  }

  var TCW_HEADERS = ['Control ID', 'Objective ID', 'Assessment Method', 'Implementation Status',
    'Control Origination', 'Assessment Status', 'Testing Performed', 'Evidence Description',
    'Citations', 'Assessor Notes'];

  function buildTCW(state) {
    var rows = (state.findings || []).map(function (f) {
      return csvRow([
        f.control_id, f.objective_id || f.dif_id, f.assessment_method || 'EXAMINE',
        f.status === 'Satisfied' ? 'implemented' : f.status === 'Not Reviewed' ? 'planned' : 'partial',
        'Service Provider Corporate',
        f.status === 'Satisfied' ? 'SAT' : f.status === 'Not Reviewed' ? 'NR' : 'OTS',
        'Deterministic 7-gate engine assessment (EXAMINE method)',
        f.evidence_description || '', (f.evidence_references || []).join('; '),
        f.assessor_notes || ''
      ]);
    });
    return csvDoc(TCW_HEADERS, rows);
  }

  function buildSummary(state, opts) {
    opts = opts || {};
    var now = stampFor(state, opts);
    var r = state.receipt || {};
    var gradeFn = opts.grade || function () { return '—'; };
    var findings = state.findings || [];
    var total = findings.length;
    var by = function (s) { return findings.filter(function (f) { return f.status === s; }); };
    var sat = by('Satisfied').length;
    var otsList = by('Other Than Satisfied');
    var ots = otsList.length;
    var nr = by('Not Reviewed').length;
    var avgDef = total > 0
      ? Math.round(findings.reduce(function (s, f) { return s + (f.defensibility_score || 0); }, 0) / total)
      : 0;
    var otsByRisk = { High: 0, Moderate: 0, Low: 0 };
    otsList.forEach(function (f) {
      var k = f.risk_exposure_before || 'Moderate';
      if (otsByRisk[k] === undefined) otsByRisk[k] = 0;
      otsByRisk[k]++;
    });

    return [
      'SPARKAE ASSESSMENT PREVIEW — EXECUTIVE SUMMARY',
      '='.repeat(56),
      '',
      'Assessment date: ' + now.slice(0, 10),
      'Baseline: FedRAMP ' + (state.baseline || 'Low') + ' (NIST SP 800-53 Rev 5)',
      'Engine: SparkAE reference engine' + (r.engine_version ? ' v' + r.engine_version : '') + ' (in-browser, 7 deterministic gates)',
      'Assessment method: automated EXAMINE preparation per NIST SP 800-53A Rev 5.',
      'INTERVIEW and TEST were not performed; they remain with the assessor.',
      '',
      'REPRODUCIBILITY RECEIPT',
      '-'.repeat(56),
      'engine version:   ' + (r.engine_version || 'n/a'),
      'catalog digest:   ' + (r.catalog_digest || 'n/a'),
      'ruleset digest:   ' + (r.ruleset_digest || 'n/a'),
      'evidence digest:  ' + (r.evidence_digest || 'n/a'),
      'assessment date:  ' + (r.assessment_date || now.slice(0, 10)),
      'verdict digest:   ' + (r.verdict_digest || 'n/a'),
      'Same first five values -> same verdict digest, on any machine, on any day.',
      '',
      'RESULTS',
      '-'.repeat(56),
      'Total Assessment Objectives: ' + total,
      'Satisfied (SAT): ' + sat + (total ? ' (' + Math.round(sat / total * 100) + '%)' : ''),
      'Other Than Satisfied (OTS): ' + ots,
      '  High Risk: ' + otsByRisk.High,
      '  Moderate Risk: ' + otsByRisk.Moderate,
      '  Low Risk: ' + otsByRisk.Low,
      'Not Reviewed (NR): ' + nr,
      'Avg finding-trace quality: ' + avgDef + '/100 (Grade ' + gradeFn(avgDef) + ')',
      'Evidence coverage: ' + (total ? Math.round(sat / total * 100) : 0) + '% of objectives carry' +
        ' evidence sufficient for a Satisfied determination',
      '',
      'TOP OTHER-THAN-SATISFIED FINDINGS',
      '-'.repeat(56)
    ].concat(
      otsList.slice(0, 20).map(function (f, i) {
        return (i + 1) + '. [' + (f.risk_exposure_before || 'Moderate') + '] ' + f.control_id +
          ' — ' + (f.weakness_name || f.finding) +
          '\n   ' + String(f.weakness_description || f.gap_description || 'N/A').slice(0, 200) +
          '\n   Recommendation: ' + (f.recommendation || 'N/A');
      })
    ).concat([
      '',
      'PREVIEW EXPORTS INCLUDED',
      '-'.repeat(56),
      '- OSCAL AR (.json) — OSCAL v1.1.2 Assessment Results',
      '- Findings CSV — 25-column assessment export',
      '- RET CSV — Risk Exposure Table (OTS only)',
      '- POA&M CSV — Plan of Action & Milestones',
      '- TCW CSV — Test Case Workbook',
      '',
      'SCOPE AND LIMITATIONS',
      '-'.repeat(56),
      'This preview was produced by the SparkAE deterministic 7-gate engine',
      'running entirely in your browser against a sample SSP. It is an',
      'assessor work aid, not a deliverable: it has not been reviewed,',
      'scoped, or adopted by a FedRAMP Recognized independent assessment',
      'service, and generating it confers no authorization status. The',
      'recognized assessment service owns scope, testing, conclusions,',
      'overrides, and the final package.'
    ]).join('\n');
  }

  return {
    toOscalControlId: toOscalControlId,
    toOscalToken: toOscalToken,
    sha1Hex: sha1Hex,
    uuidV5: uuidV5,
    uuidFactory: uuidFactory,
    stableJson: stableJson,
    buildReceipt: buildReceipt,
    SPARKAE_NS: SPARKAE_NS,
    ENGINE_UUID_NS: ENGINE_UUID_NS,
    csvSafe: csvSafe,
    csvRow: csvRow,
    buildAssessmentResults: buildAssessmentResults,
    buildFindingsCSV: buildFindingsCSV,
    buildRET: buildRET,
    buildPOAM: buildPOAM,
    buildTCW: buildTCW,
    buildSummary: buildSummary
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DEMO_EXPORTS;
