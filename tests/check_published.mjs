#!/usr/bin/env node
// SparkAE public reference build — is the published site the repository?
//
// The README's first claim about this tree is that it is served as-is at
// https://sparkae.ai. Every other check in this suite runs offline against the
// files here, so none of them can see the one thing that claim is about: what
// the host actually returns. This is the check that looks.
//
// It exists because that claim was false and nothing noticed. Netlify's Pretty
// URLs post-processing is on unless a project says otherwise, and it rewrites
// the published HTML — every internal href="x.html" is served as href='/x',
// with the touched tags re-serialised — so all seven pages differed from the
// files here. netlify.toml now pins the setting off (and tests/check.mjs fails
// if that pin goes away), but a pin in a file is a statement of intent; this is
// the one that reads the wire. It also catches the case the pin cannot: the same
// post-processing left enabled in the Netlify UI on a project whose config was
// never redeployed.
//
// This is the ONLY check here that uses the network, so it is deliberately not
// part of `node tests/check.mjs` and not a merge gate — a red build should mean
// "this change is wrong", not "the last deploy has not finished". Run it after
// a deploy, or against a deploy preview:
//
//   node tests/check_published.mjs
//   node tests/check_published.mjs --site https://deploy-preview-12--sparkae.netlify.app
//
// Every published byte has to match, so `--only <substring>` narrows the run
// while you are chasing one file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..'));
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const site = argOf('--site', 'https://sparkae.ai').replace(/\/+$/, '');
const only = argOf('--only', '');

let failures = 0;
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

// Netlify reads netlify.toml, _headers and _redirects from the publish root and
// does not serve them. This script intentionally skips dotfiles/dot-directories
// and a few local-only directories (.git, .github, node_modules, out), so the
// file list below is “the public tree we intend to publish”, not just “the pages”.
const NOT_SERVED = ['netlify.toml', '_headers', '_redirects'];

// Paths deliberately unpublished. The comparison below walks the REPOSITORY,
// so it can only ask whether a file that exists here is served correctly — a
// file live on the site but deleted from this tree is invisible to it, and
// unpublishing something is therefore unverifiable unless its path is named
// here. These two carried internal review notes, were reachable at these
// addresses with robots.txt at `Allow: /`, and were removed on 2026-09-11.
// A Netlify deploy is an atomic snapshot so they should be gone; "should be"
// is the assumption this suite exists to replace.
const MUST_NOT_BE_SERVED = [
  'docs/hygiene/2026-09-10-path-inventory.md',
  'docs/reviews/2026-09-09-sparkae-engine-public-rebaseline.md',
];
// In the tree on purpose, and not an address. `publish = "."` deploys every
// file here, so a file that is not a page is still reachable — and _headers
// declares a Content-Security-Policy per page, so a non-page is served without
// one. That is how static/og-card.src.html sat on the site with no CSP from
// 2026-09-14 until the first dispatch of this job found it: the last scheduled
// run predates the commit that published it.
//
// These are excluded from the byte comparison below and required to 404
// instead, with and without the extension, because both were reachable. The
// _redirects rules that make that true are forced (`404!`); an unforced rule
// would be skipped for a path that resolves to a file, which is exactly the
// case here. check.mjs 22 fails if a path listed here has no such rule, so the
// two files cannot drift apart between runs of this one.
const IN_TREE_NOT_SERVED = ['static/og-card.src.html'];

const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'out']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return [];
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : [path.relative(root, full)];
});

const files = walk(root)
  .filter((f) => !NOT_SERVED.includes(f))
  .filter((f) => !IN_TREE_NOT_SERVED.includes(f))
  .filter((f) => !only || f.includes(only))
  .sort();

const get = async (urlPath, redirect = 'follow') => {
  const res = await fetch(site + urlPath, { redirect });
  return {
    status: res.status,
    location: res.headers.get('location'),
    header: (n) => res.headers.get(n) || '',
    body: Buffer.from(await res.arrayBuffer()),
  };
};

// Where a text file differs, the byte count alone does not say what happened —
// and "the host rewrote your links" is exactly the diagnosis that a first
// differing line makes obvious and a length does not.
const firstDifference = (want, got) => {
  const a = want.toString('utf8').split('\n');
  const b = got.toString('utf8').split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `\n         line ${i + 1}\n           repo: ${JSON.stringify((a[i] ?? '(end of file)').trim().slice(0, 120))}`
        + `\n           site: ${JSON.stringify((b[i] ?? '(end of file)').trim().slice(0, 120))}`;
    }
  }
  return '';
};

const isText = (f) => /\.(html|js|mjs|css|json|xml|txt|md|toml)$/.test(f) || /^(LICENSE|NOTICE)$/.test(f);

// -- The one rewrite the host is allowed to make -----------------------------
//
// The homepage's fit-call form is a Netlify form: index.html declares it with
// data-netlify="true" and names its honeypot field, and tests/check.mjs 23
// fails if either goes away. Netlify consumes those two attributes at deploy
// time and re-serialises the tag it took them from, so what it serves is the
// repository's open tag minus the two -- re-quoted and reordered by the same
// host serialiser netlify.toml describes for Pretty URLs.
//
// Found on 2026-09-16, when the homepage came back 47 bytes short and that one
// tag was the whole of it. Run #91 on 2026-09-14 -- the only scheduled run this
// job had ever had -- served it verbatim, and index.html has carried both
// attributes unchanged since the site's first publish, so the host's behaviour
// changed rather than the file. Netlify's form detection is a dashboard
// setting and not a netlify.toml one, so no commit records it either way.
//
// Deleting the attributes would make this green and unregister the site's only
// contact form. So the comparison accommodates the rewrite instead, stated as
// narrowly as it can be: on index.html alone, on a form tag that carries
// data-netlify="true" HERE, the served tag has to be that tag with exactly
// NETLIFY_FORM_ATTRS removed and every other attribute and value intact.
// Attribute order and quoting are the host's to choose; nothing else is. Every
// other byte of the file is still compared byte for byte, a form tag without
// data-netlify="true" gets no exemption at all, and the tag count has to match,
// so an injected form fails rather than being waved through.
//
// What this cannot say is whether the form is registered. That needs a POST,
// which this suite does not make; it reads content drift and nothing else.
const HOST_MAY_REWRITE_FORMS = 'index.html';
const NETLIFY_FORM_ATTRS = ['data-netlify', 'netlify-honeypot'];
const FORM_OPEN_RE = /<form\b[^>]*>/gi;

const attrsOf = (tag) => {
  const attrs = new Map();
  const body = tag.replace(/^<\s*form/i, '').replace(/\/?>$/, '');
  const re = /([A-Za-z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`=]+)))?/g;
  for (const m of body.matchAll(re)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
};

// How many form tags the host re-serialised, when that rewrite is the ONLY
// difference between the tree and the wire -- and null when it is anything
// else, including when there is no difference at all, so the callers keep
// their own equality check for the ordinary case.
const netlifyFormRewrite = (f, tree, wire) => {
  if (f !== HOST_MAY_REWRITE_FORMS) return null;
  const a = tree.toString('utf8');
  const b = wire.toString('utf8');
  const here = a.match(FORM_OPEN_RE) || [];
  const there = b.match(FORM_OPEN_RE) || [];
  if (!here.length || here.length !== there.length) return null;
  let rewritten = 0;
  for (let i = 0; i < here.length; i++) {
    if (here[i] === there[i]) continue;
    const mine = attrsOf(here[i]);
    const theirs = attrsOf(there[i]);
    if (mine.get('data-netlify') !== 'true') return null;
    for (const attr of NETLIFY_FORM_ATTRS) mine.delete(attr);
    if (mine.size !== theirs.size) return null;
    for (const [k, v] of mine) if (theirs.get(k) !== v) return null;
    rewritten++;
  }
  if (!rewritten) return null;
  // Whatever those tags did, every byte outside them has to be identical.
  // Splitting on a capture-free regex drops the tags and keeps the gaps.
  const gapsA = a.split(FORM_OPEN_RE);
  const gapsB = b.split(FORM_OPEN_RE);
  if (gapsA.length !== gapsB.length) return null;
  for (let i = 0; i < gapsA.length; i++) if (gapsA[i] !== gapsB[i]) return null;
  return rewritten;
};

console.log(`published site: ${site}`);
console.log(`comparing ${files.length} file(s) against this working tree\n`);

console.log('1. every published file is the file in this tree');
for (const f of files) {
  const want = fs.readFileSync(path.join(root, f));
  let got;
  try { got = await get('/' + f); } catch (e) { fail(`${f}: ${e.message}`); continue; }
  if (got.status !== 200) { fail(`${f}: HTTP ${got.status}`); continue; }
  if (got.body.equals(want)) { ok(`${f} (${want.length} bytes)`); continue; }
  const rewritten = netlifyFormRewrite(f, want, got.body);
  if (rewritten !== null) {
    ok(`${f} (${want.length} bytes) - ${rewritten} Netlify form tag${rewritten === 1 ? '' : 's'}`
      + ` re-serialised by the host, ${NETLIFY_FORM_ATTRS.join(' and ')} consumed;`
      + ' every other byte matches');
    continue;
  }
  fail(`${f}: site serves ${got.body.length} bytes, repository has ${want.length}`
    + (isText(f) ? firstDifference(want, got.body) : ''));
}

// The root has to be index.html itself, not merely something that looks like it:
// this is the address every canonical, the sitemap and the social card point at.
// `--only` narrows the file comparison above; the route and config checks below
// are about the site as a whole, so they would only be noise alongside it.
if (!only) {
  console.log('\n2. the routes the site promises');
  try {
    const home = await get('/');
    const tree = fs.readFileSync(path.join(root, 'index.html'));
    check(home.status === 200 && (home.body.equals(tree)
      || netlifyFormRewrite('index.html', tree, home.body) !== null),
      '/ serves index.html, the Netlify form tag aside');
  } catch (e) { fail('/: ' + e.message); }

  // Both are forced 301s in _redirects, and both are addresses that outreach and
  // other people's pages already point at. A rewrite (200 at the old address)
  // would serve one page at two URLs, which is what _redirects declines to do.
  for (const [from, to] of [['/demo', '/demo-standalone.html'], ['/3pao.html', '/assessors.html']]) {
    try {
      const r = await get(from, 'manual');
      check(r.status === 301 && (r.location || '').endsWith(to),
        `${from} → 301 ${to}` + (r.status === 301 ? '' : ` (got ${r.status} ${r.location || ''})`));
    } catch (e) { fail(`${from}: ${e.message}`); }
  }

  // Netlify's own config is not content. If these ever answer 200 the publish
  // root is being served by something that does not know that.
  console.log('\n3. what must not be served is not served');
  for (const f of NOT_SERVED) {
    try {
      const r = await get('/' + f);
      check(r.status === 404, `${f} is not published (${r.status})`);
    } catch (e) { fail(`${f}: ${e.message}`); }
  }
  for (const f of IN_TREE_NOT_SERVED) {
    // The opposite contradiction to the one below: a path listed here has to
    // EXIST in the tree. If it does not, it belongs in MUST_NOT_BE_SERVED.
    if (!fs.existsSync(path.join(root, f))) {
      fail(`${f} is in IN_TREE_NOT_SERVED but is not in this tree — it belongs in MUST_NOT_BE_SERVED`);
      continue;
    }
    for (const addr of ['/' + f, '/' + f.replace(/\.html$/, '')]) {
      try {
        const r = await get(addr);
        check(r.status === 404, `${addr} is in the tree and not served (${r.status})`);
      } catch (e) { fail(`${addr}: ${e.message}`); }
    }
  }
  for (const f of MUST_NOT_BE_SERVED) {
    // A path listed here and present in the tree is a contradiction: it is
    // published by the walk above and forbidden by this list at the same time.
    if (fs.existsSync(path.join(root, f))) {
      fail(`${f} is in MUST_NOT_BE_SERVED but exists in this tree — one of the two is wrong`);
      continue;
    }
    try {
      const r = await get('/' + f);
      check(r.status === 404, `${f} is gone from the site (${r.status})`);
    } catch (e) { fail(`${f}: ${e.message}`); }
  }

  // The per-page Content-Security-Policy and the security headers are the
  // site's loudest claims, and until now they were only ever checked as the
  // CONTENT of _headers. Whether the host applies them is a different
  // question, and the only place it can be asked is the wire. Both route
  // forms are checked because Netlify answers `/x` as well as `/x.html` and
  // header rules match the REQUESTED path — the case _headers calls out.
  console.log('\n4. the security headers the host actually applies');
  const REQUIRED = [
    ['content-security-policy', /default-src 'self'/, "default-src 'self'"],
    ['content-security-policy', /connect-src 'self'/, "connect-src 'self'"],
    ['x-frame-options', /^deny$/i, 'DENY'],
    ['x-content-type-options', /^nosniff$/i, 'nosniff'],
    ['strict-transport-security', /max-age=\d+/, 'max-age'],
  ];
  // script-src is checked against _headers rather than against a pattern,
  // because it is the directive that stopped being the same on every page:
  // it is now 'self' plus the sha256 of that page's inline script, and a hash
  // that is right in _headers and wrong on the wire is precisely what the
  // offline checks cannot see. tests/check.mjs §20 proves the local rule matches
  // the local page; this proves the host is serving that rule and not an older
  // one — including that 'unsafe-inline' has not come back through the Netlify
  // UI, which is a place a policy can change with no commit behind it.
  const localScriptSrc = new Map();
  {
    let route = null;
    for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
      if (/^\//.test(line)) route = line.trim();
      const m = /^\s+Content-Security-Policy:\s*(.+)$/.exec(line);
      if (m && route) localScriptSrc.set(route, ((/script-src ([^;]*)/.exec(m[1]) || [])[1] || '').trim());
    }
  }
  const directives = (v) => (v || '').trim().split(/\s+/).filter(Boolean).sort().join(' ');
  const routes = [];
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    routes.push('/' + f);
    routes.push(f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, ''));
  }
  for (const route of routes) {
    try {
      const r = await get(route);
      const missing = REQUIRED
        .filter(([name, re]) => !re.test(r.header(name)))
        .map(([name, , what]) => `${name}: ${what}`);
      check(missing.length === 0,
        `${route} carries the security headers` + (missing.length ? ` — missing ${missing.join(', ')}` : ''));

      const served = (/script-src ([^;]*)/.exec(r.header('content-security-policy')) || [])[1] || '';
      const want = localScriptSrc.get(route) || '';
      check(!!want && directives(served) === directives(want),
        `${route}: script-src on the wire is the one in _headers` +
        (directives(served) === directives(want) ? '' : ` — served ${JSON.stringify(served.trim())}, _headers has ${JSON.stringify(want)}`));
      check(!/'unsafe-inline'/.test(served), `${route}: script-src on the wire carries no 'unsafe-inline'`);
    } catch (e) { fail(`${route}: ${e.message}`); }
  }
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED — the published site is not this tree`);
  // Said plainly, because the first time this fails for most people it will be
  // for this reason and not because anything is wrong with the site.
  console.log('\nRun this from a checkout of the commit that was actually deployed:'
    + '\na working tree ahead of the last deploy differs for the ordinary reason,'
    + '\nand a branch is best checked with --site against its deploy preview.');
} else {
  console.log('\nthe published site is this tree, byte for byte');
}
process.exit(failures ? 1 : 0);
