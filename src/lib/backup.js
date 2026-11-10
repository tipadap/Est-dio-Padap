'use strict';

// Backups do banco de dados (SQLite) e das imagens enviadas.
//
// 1) Cópia automática diária do banco dentro do volume (DATA_DIR/backups), guardando as 7 mais
//    recentes. Protege contra erro humano e arquivo corrompido — não contra perda do volume.
// 2) Download pelo admin (Admin → Backup): um .zip com o banco + a pasta de imagens enviadas,
//    para guardar fora do Railway (ex.: OneDrive da empresa).
//
// A cópia usa a API de backup do SQLite (consistente mesmo com o sistema em uso).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');
const db = require('../db');

const DIR = path.join(config.paths.data, 'backups');
const KEEP = 7;
const DAY = 24 * 60 * 60 * 1000;

const stamp = (d = new Date()) => d.toISOString().slice(0, 10);

/** Cópia consistente do banco num arquivo. */
async function snapshot(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await db.backup(dest);
  return dest;
}

/** Lista as cópias automáticas (mais recente primeiro). */
function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => /^estudio-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({ file: f, size: fs.statSync(path.join(DIR, f)).size, date: f.slice(8, 18) }));
}

/** Faz a cópia do dia (se ainda não existe) e apaga as antigas. */
async function daily() {
  const dest = path.join(DIR, `estudio-${stamp()}.db`);
  if (!fs.existsSync(dest)) await snapshot(dest);
  for (const old of list().slice(KEEP)) fs.rmSync(path.join(DIR, old.file), { force: true });
  return dest;
}

/** Agenda a cópia diária (1 min após iniciar e depois a cada 24 h). */
function schedule() {
  if (process.env.NODE_ENV === 'test') return;
  const run = () => daily().catch((e) => console.error('Backup automático falhou:', e.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, DAY).unref();
}

// ---- .zip mínimo (sem compressão: imagens já são comprimidas) -----------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf);
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Escreve um .zip (método "store") no stream. files = [{ name, path }].
 * Lê um arquivo por vez para não segurar tudo na memória.
 */
async function writeZip(out, files) {
  // respeita o "backpressure" e para se o download for interrompido
  const write = (buf) =>
    new Promise((resolve, reject) => {
      if (out.destroyed) return reject(new Error('Download interrompido.'));
      if (out.write(buf)) return resolve();
      const fail = () => {
        out.off('drain', done);
        reject(new Error('Download interrompido.'));
      };
      const done = () => {
        out.off('close', fail);
        resolve();
      };
      out.once('drain', done);
      out.once('close', fail);
      return undefined;
    });
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = await fs.promises.readFile(f.path);
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(data);
    const { time, date } = dosTime(fs.statSync(f.path).mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(0, 8); // sem compressão
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    await write(local);
    await write(name);
    await write(data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, name]));
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  await write(cd);
  await write(end);
}

/** Backup completo (banco + imagens enviadas) como .zip no stream (ex.: a resposta HTTP). */
async function fullZip(out) {
  const tmp = path.join(os.tmpdir(), `estudio-backup-${process.pid}-${Date.now()}.db`);
  try {
    await snapshot(tmp);
    const files = [{ name: 'estudio.db', path: tmp }];
    const up = config.paths.uploads;
    if (fs.existsSync(up)) {
      for (const f of fs.readdirSync(up)) {
        const p = path.join(up, f);
        if (fs.statSync(p).isFile()) files.push({ name: `uploads/${f}`, path: p });
      }
    }
    await writeZip(out, files);
    return files.length;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { snapshot, list, daily, schedule, fullZip, stamp, writeZip };
