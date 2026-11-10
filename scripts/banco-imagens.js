#!/usr/bin/env node
'use strict';

/**
 * Gera as fotos do Banco de imagens embutido a partir de src/lib/banco-catalog.json.
 *
 *   npm run banco-imagens            # gera só as que faltam
 *   npm run banco-imagens -- --todas # refaz todas
 *
 * Para acrescentar uma foto: copie o endereço da foto no Unsplash (somente as gratuitas,
 * sem o selo "Unsplash+"), acrescente uma entrada no catálogo e rode o script:
 *   {
 *     "file": "nome-da-foto.jpg",                       // nome do arquivo (minúsculas, sem acento)
 *     "theme": "Hortaliças",                            // tema do filtro
 *     "title": "Título que aparece no sistema",
 *     "source": "https://unsplash.com/photos/<id>",     // página da foto (comprovação da licença)
 *     "photo": "https://images.unsplash.com/photo-..."  // endereço da imagem (botão direito → copiar endereço da imagem, sem o "?..." do final)
 *   }
 * Saída: src/public/img/banco/<file> (até 1920 px) e src/public/img/banco/mini/<file> (480×320).
 * Os originais baixados ficam em cache em ../.cache-banco (fora do git).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'src/lib/banco-catalog.json');
const OUT = path.join(ROOT, 'src/public/img/banco');
const MINI = path.join(OUT, 'mini');
const CACHE = path.join(ROOT, '.cache-banco');
const all = process.argv.includes('--todas');

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  [OUT, MINI, CACHE].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const files = new Set();
  let made = 0;
  for (const c of catalog) {
    for (const k of ['file', 'theme', 'title', 'source', 'photo']) if (!c[k]) throw new Error(`Entrada sem "${k}": ${JSON.stringify(c)}`);
    if (!/^[a-z0-9-]+\.jpg$/.test(c.file)) throw new Error(`Nome inválido (use minúsculas, números e hífen, .jpg): ${c.file}`);
    if (files.has(c.file)) throw new Error(`Arquivo repetido no catálogo: ${c.file}`);
    files.add(c.file);
    const out = path.join(OUT, c.file);
    const mini = path.join(MINI, c.file);
    if (!all && fs.existsSync(out) && fs.existsSync(mini)) continue;

    const raw = path.join(CACHE, c.file);
    if (!fs.existsSync(raw)) {
      const res = await fetch(`${c.photo.split('?')[0]}?w=2048&q=90&fm=jpg`);
      if (!res.ok) throw new Error(`Falha ao baixar ${c.file}: HTTP ${res.status}`);
      fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    }
    await sharp(raw).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
    await sharp(raw).rotate().resize(480, 320, { fit: 'cover' }).jpeg({ quality: 70, mozjpeg: true }).toFile(mini);
    made++;
    console.log(`  ✓ ${c.file}`);
  }
  // Arquivos que não estão mais no catálogo
  const extra = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg') && !files.has(f));
  if (extra.length) console.log(`Atenção: fora do catálogo (pode apagar): ${extra.join(', ')}`);
  console.log(`${catalog.length} fotos no catálogo, ${made} geradas agora.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
