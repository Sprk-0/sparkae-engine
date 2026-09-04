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
// The shapes below mirror src/services/oscal_exporter.py
// (generate_assessment_results / generate_poam) — the server-side exporter
// that the server exporter already brought to official-schema conformance. Keep the two
// in step: tests/test_website_demo_exports.py validates this file's output
// against the vendored NIST schema in data/oscal-schemas/v1.1.2/ using the
// same validator the backend uses.

var DEMO_EXPORTS = (function () {
  'use strict';

  var FEDRAMP_NS = 'https://fedramp.gov/ns/oscal';

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

  // ── UUIDs ──────────────────────────────────────────────────────────────
  // crypto.randomUUID() is unavailable in older Safari/WebViews and in
  // non-secure contexts; fall back to getRandomValues, then to Math.random
  // (demo-only identifiers, never security material) so exports never break.
  function randomUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    var b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(b);
    } else {
      for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    var h = Array.prototype.map.call(b, function (x) {
      return x.toString(16).padStart(2, '0');
    }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20);
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
  // opts.now       ISO-8601 timestamp to stamp the document with.
  // opts.uuid      UUID factory (injected by tests for reproducibility).
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
    var now = opts.now || new Date().toISOString();
    var uuid = opts.uuid || randomUuid;
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
    var today = (opts.now || new Date().toISOString()).slice(0, 10);
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
    var today = (opts.now || new Date().toISOString()).slice(0, 10);
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
    var today = (opts.now || new Date().toISOString()).slice(0, 10);
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
    var now = opts.now || new Date().toISOString();
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
      'Generated: ' + now.slice(0, 10),
      'Baseline: FedRAMP ' + (state.baseline || 'Low') + ' (NIST SP 800-53 Rev 5)',
      'Engine: SparkAE Deterministic 7-Gate v0.7.0-rc1 (In-Browser)',
      'Assessment Method: EXAMINE per NIST SP 800-53A Rev 5',
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
    randomUuid: randomUuid,
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
