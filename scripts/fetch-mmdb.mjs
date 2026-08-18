import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const month = process.env.MMDB_MONTH ?? '2026-08';
const base = 'https://download.db-ip.com/free';

const targets = [
  { url: `${base}/dbip-city-lite-${month}.mmdb.gz`, dest: 'data/dbip-city-lite.mmdb' },
  { url: `${base}/dbip-asn-lite-${month}.mmdb.gz`, dest: 'data/dbip-asn-lite.mmdb' },
];

const mmdbMarker = Buffer.from([0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d]);

function hasMmdbMagic(file) {
  if (!existsSync(file)) return false;
  return readFileSync(file).includes(mmdbMarker);
}

function download(url, dest) {
  const tmp = `${dest}.tmp`;
  const out = createWriteStream(tmp);
  const rejectWith = (err) => {
    try {
      unlinkSync(tmp);
    } catch {}
    reject(err);
  };
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          out.destroy();
          rejectWith(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        pipeline(res, createGunzip(), out)
          .then(() => {
            if (hasMmdbMagic(tmp)) {
              renameSync(tmp, dest);
              console.log(`ok ${dest} (${readFileSync(dest).length} bytes)`);
              resolve();
            } else {
              rejectWith(new Error(`bad mmdb magic in ${tmp}`));
            }
          })
          .catch(rejectWith);
      })
      .on('error', rejectWith);
  });
}

mkdirSync('data', { recursive: true });

for (const target of targets) {
  if (hasMmdbMagic(target.dest)) {
    console.log(`skip ${target.dest} (already present)`);
    continue;
  }
  await download(target.url, target.dest);
}
