'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploads),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (EXT[file.mimetype] || '')),
});

const imageUpload = multer({
  storage,
  limits: { fileSize: config.upload.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (config.upload.mimeTypes.includes(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  },
}).single('image');

/** Upload de uma imagem (campo "image"); erros viram JSON amigável. */
function handleImage(req, res, next) {
  imageUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const mb = Math.round(config.upload.maxBytes / 1024 / 1024);
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? `A imagem excede o tamanho máximo de ${mb} MB.` : 'Envie uma imagem JPG, PNG ou WEBP.';
      return res.status(400).json({ error: msg });
    }
    return next(err);
  });
}

/** Apaga na hora um arquivo recebido que foi recusado. */
function discardUpload(file) {
  if (file) fs.rmSync(path.join(config.paths.uploads, path.basename(file.filename)), { force: true });
}

module.exports = { handleImage, discardUpload };
