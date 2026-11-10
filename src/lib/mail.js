'use strict';

// Envio de e-mail (recuperação de senha). Só funciona quando as variáveis SMTP
// estão definidas no Railway; sem elas, o sistema segue com o fluxo antigo
// ("peça ao administrador").
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (ex.: "Estúdio PADAP <nao-responda@padapagronegocios.com.br>"), APP_URL
let transporter = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function send({ to, subject, text, html }) {
  if (process.env.NODE_ENV === 'test') {
    (module.exports.outbox ||= []).push({ to, subject, text, html });
    return;
  }
  await getTransporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
}

module.exports = { isConfigured, send, outbox: [] };
