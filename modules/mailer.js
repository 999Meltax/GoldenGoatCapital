// ─────────────────────────────────────────────────────────────
//  mailer.js  –  Golden Goat Capital  –  E-Mail-Versand
//
//  Einrichtung:
//    1. npm install nodemailer
//    2. In .env setzen:
//         MAIL_USER=deine@gmail.com
//         MAIL_PASS=xxxx xxxx xxxx xxxx   ← Google App-Passwort
//         MAIL_FROM="Golden Goat Capital <deine@gmail.com>"
//
//  Google App-Passwort erstellen:
//    myaccount.google.com → Sicherheit → App-Passwörter
// ─────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

// ── Basis-HTML-Template ───────────────────────────────────────
function baseTemplate({ title, preheader, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#0f0f17; font-family:'Segoe UI',Arial,sans-serif; color:#e2e8f0; }
  .wrapper { max-width:580px; margin:0 auto; padding:32px 16px; }
  .card { background:#1a1a2e; border:1px solid #2a2a40; border-radius:16px; overflow:hidden; }
  .header { background:linear-gradient(135deg,#2563eb 0%,#6358e6 100%); padding:32px 32px 28px; text-align:center; }
  .header img { width:48px; height:48px; margin-bottom:12px; }
  .header-title { font-size:22px; font-weight:800; color:#fff; margin:0 0 4px; letter-spacing:-0.3px; }
  .header-sub   { font-size:13px; color:rgba(255,255,255,0.75); margin:0; }
  .body   { padding:28px 32px; }
  .body p { font-size:14px; line-height:1.7; color:#cbd5e1; margin:0 0 16px; }
  .section-title { font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.07em; margin:24px 0 10px; }
  .item-card { background:#13131a; border:1px solid #2a2a40; border-radius:10px; padding:14px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .item-name  { font-size:14px; font-weight:600; color:#f1f5f9; }
  .item-sub   { font-size:12px; color:#64748b; margin-top:2px; }
  .badge      { font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; white-space:nowrap; }
  .badge-red    { background:rgba(239,68,68,0.15);  color:#ef4444; border:1px solid rgba(239,68,68,0.3);  }
  .badge-amber  { background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
  .badge-green  { background:rgba(34,197,94,0.15);  color:#22c55e; border:1px solid rgba(34,197,94,0.3);  }
  .badge-blue   { background:rgba(99,88,230,0.15);  color:#818cf8; border:1px solid rgba(99,88,230,0.3);  }
  .amount-red   { font-size:14px; font-weight:700; color:#ef4444; white-space:nowrap; }
  .amount-green { font-size:14px; font-weight:700; color:#22c55e; white-space:nowrap; }
  .amount-blue  { font-size:14px; font-weight:700; color:#818cf8; white-space:nowrap; }
  .divider { height:1px; background:#2a2a40; margin:20px 0; }
  .cta-btn { display:inline-block; background:linear-gradient(135deg,#2563eb,#6358e6); color:#fff !important; text-decoration:none; font-size:14px; font-weight:700; padding:13px 28px; border-radius:10px; margin:16px 0 4px; letter-spacing:0.02em; }
  .footer { padding:20px 32px 28px; text-align:center; }
  .footer p { font-size:11px; color:#475569; margin:4px 0; line-height:1.5; }
  .footer a { color:#6358e6; text-decoration:none; }
  .progress-wrap { background:#2a2a40; border-radius:6px; height:8px; overflow:hidden; margin-top:6px; }
  .progress-bar  { height:100%; border-radius:6px; transition:width 0.3s; }
  .stat-row { display:flex; gap:8px; margin-bottom:16px; }
  .stat-box { flex:1; background:#13131a; border:1px solid #2a2a40; border-radius:10px; padding:12px 14px; text-align:center; }
  .stat-val { font-size:18px; font-weight:800; margin-bottom:2px; }
  .stat-lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
</style>
</head>
<body>
<div class="wrapper">
  <!-- Preheader (unsichtbar, aber in E-Mail-Clients sichtbar) -->
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>

  <div class="card">
    <div class="header">
      <div class="header-title">🐐 Golden Goat Capital</div>
      <p class="header-sub">${title}</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Du erhältst diese E-Mail, weil du Erinnerungen in Golden Goat Capital aktiviert hast.</p>
      <p><a href="{{APP_URL}}/users/einstellungen">Einstellungen ändern</a> &nbsp;·&nbsp; <a href="{{APP_URL}}/users/login">Zur App</a></p>
      <p style="margin-top:12px;color:#334155;">© ${new Date().getFullYear()} Golden Goat Capital</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── E-Mail senden ─────────────────────────────────────────────
export async function sendMail({ to, subject, title, preheader, bodyHtml }) {
    const html = baseTemplate({ title, preheader, bodyHtml })
        .replace(/\{\{APP_URL\}\}/g, process.env.APP_URL || 'http://localhost:3001');

    await transporter.sendMail({
        from:    process.env.MAIL_FROM || `"Golden Goat Capital" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html,
    });
}

// ── Template-Bausteine ────────────────────────────────────────

export function greetingHtml(name) {
    return `<p>Hallo${name ? ' <strong>' + name + '</strong>' : ''},</p>`;
}

export function ctaButtonHtml(label, path) {
    const url = (process.env.APP_URL || 'http://localhost:3001') + path;
    return `<div style="text-align:center;margin-top:8px;"><a href="${url}" class="cta-btn">${label}</a></div>`;
}

export function dividerHtml() {
    return '<div class="divider"></div>';
}

export function itemCardHtml({ name, sub, badgeText, badgeClass, amountText, amountClass }) {
    return `<div class="item-card">
      <div>
        <div class="item-name">${name}</div>
        ${sub ? '<div class="item-sub">' + sub + '</div>' : ''}
        ${badgeText ? '<div style="margin-top:6px;"><span class="badge ' + badgeClass + '">' + badgeText + '</span></div>' : ''}
      </div>
      ${amountText ? '<div class="' + (amountClass || 'amount-red') + '">' + amountText + '</div>' : ''}
    </div>`;
}

export function sectionTitleHtml(title) {
    return `<div class="section-title">${title}</div>`;
}

export function progressHtml(pct, color) {
    return `<div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(pct,100)}%;background:${color || '#6358e6'};"></div></div>`;
}

export function statRowHtml(stats) {
    // stats = [{ val, lbl, color }]
    const boxes = stats.map(s =>
        '<div class="stat-box"><div class="stat-val" style="color:' + (s.color || '#f1f5f9') + ';">' + s.val + '</div><div class="stat-lbl">' + s.lbl + '</div></div>'
    ).join('');
    return '<div class="stat-row">' + boxes + '</div>';
}

// ── Verifikation (optional beim Start) ───────────────────────
export async function verifyMailer() {
    try {
        await transporter.verify();
        console.log('[Mailer] SMTP-Verbindung OK');
        return true;
    } catch (err) {
        console.warn('[Mailer] SMTP nicht konfiguriert:', err.message);
        return false;
    }
}