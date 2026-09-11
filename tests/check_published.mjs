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
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'out']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return [];
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : [path.relative(root, full)];
});

const files = walk(root)
  .filter((f) => !NOT_SERVED.includes(f))
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

console.log(`published site: ${site}`);
console.log(`comparing ${files.length} file(s) against this working tree\n`);

console.log('1. every published file is the file in this tree');
for (const f of files) {
  const want = fs.readFileSync(path.join(root, f));
  let got;
  try { got = await get('/' + f); } catch (e) { fail(`${f}: ${e.message}`); continue; }
  if (got.status !== 200) { fail(`${f}: HTTP ${got.status}`); continue; }
  if (got.body.equals(want)) { ok(`${f} (${want.length} bytes)`); continue; }
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
    check(home.status === 200 && home.body.equals(fs.readFileSync(path.join(root, 'index.html'))),
      '/ serves index.html byte-for-byte');
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
