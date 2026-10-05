#!/usr/bin/env node
// Builds tests/fixtures/own-file-stress/own-file-stress.zip from src/.
//
// The archive is what tests/own-file-stress.mjs hands to the real upload input:
// a Word SSP excerpt, an OSCAL system-security-plan stub and a four-row scanner
// CSV, every name in them invented (see src/README-EXAMPLE.txt). The ZIP is
// committed so a reader can open the exact bytes the harness uploaded; the
// sources are committed so those bytes can be rebuilt; and the harness rebuilds
// them and compares, so the two cannot drift apart without a red check.
//
// Everything that could make two builds differ is pinned: member order is the
// list below, every timestamp is zero, and the ZIP writer is the one in
// tests/browser.mjs (deflate level 9, CRC over the uncompressed bytes).
//
//   node tests/fixtures/own-file-stress/build.mjs          write the ZIP
//   import { buildFixtureZip } from './build.mjs'          bytes, for a check
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ZIP = path.join(here, 'own-file-stress.zip');
export const CANARY = 'OWNFILE-CANARY-3f9c7a1e';

const CRC_T = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32b = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export function zipOf(members) {
  const local = [], central = [];
  let offset = 0;
  for (const m of members) {
    const name = Buffer.from(m.name, 'utf8');
    const source = m.bytes || Buffer.from(m.text, 'utf8');
    const deflate = !!m.deflate;
    const data = deflate ? zlib.deflateRawSync(source, { level: 9 }) : source;
    const method = deflate ? 8 : 0;
    const uncomp = source.length;
    const crc = crc32b(source);
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(uncomp, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28); name.copy(lh, 30);
    local.push(lh, data);
    const ch = Buffer.alloc(46 + name.length);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(uncomp, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42); name.copy(ch, 46);
    central.push(ch);
    offset += lh.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(members.length, 8); eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cd, eocd]);
}

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One <w:p> per source line, which is how a pasted SSP section lands in Word.
export function docxOf(paragraphText) {
  const paras = paragraphText.split(/\r?\n/).filter(l => l.trim())
    .map(l => '<w:p><w:r><w:t xml:space="preserve">' + xmlEsc(l) + '</w:t></w:r></w:p>').join('');
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paras + '</w:body></w:document>';
  return zipOf([
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>' },
    { name: 'word/document.xml', text: documentXml, deflate: true },
  ]);
}

export const MEMBERS = [
  'README-EXAMPLE.txt',
  'Harborline-EXAMPLE-SSP-excerpt.docx',
  'oscal/Harborline-EXAMPLE-ssp-oscal.json',
  'scans/Harborline-EXAMPLE-nessus-export.csv',
];

export function buildFixtureZip() {
  const src = (f) => fs.readFileSync(path.join(here, 'src', f), 'utf8');
  return zipOf([
    { name: MEMBERS[0], text: src('README-EXAMPLE.txt') },
    { name: MEMBERS[1], bytes: docxOf(src('Harborline-EXAMPLE-SSP-excerpt.docx.txt')) },
    { name: MEMBERS[2], text: src('oscal/Harborline-EXAMPLE-ssp-oscal.json'), deflate: true },
    { name: MEMBERS[3], text: src('scans/Harborline-EXAMPLE-nessus-export.csv') },
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = buildFixtureZip();
  fs.writeFileSync(FIXTURE_ZIP, bytes);
  console.log(`wrote ${path.relative(process.cwd(), FIXTURE_ZIP)} (${bytes.length} bytes, ${MEMBERS.length} members)`);
}
