// The look of every TripTab email (Mike's note, 11/18: the first one "does not match the TripTab
// design look"). The landing photo with the TripTab mark on top, as on the app's first screen; then
// a white card with the small uppercase brown label, a Playfair italic heading, DM Sans text and the
// brown pill button with a Playfair label (docs/DESIGN.md, sections 1, 2 and 5).
//
// Email apps drop most CSS, so it's tables and inline styles. Playfair and DM Sans load where the
// app allows web fonts (Apple Mail, iOS Mail) and fall back to Georgia and Helvetica (Gmail).
// No imports, so the app's unit tests run this same file.

/** Drawn from the app's look and served by triptab.org (app/public/email/header.jpg). */
export const HEADER_IMAGE = "https://triptab.org/email/header.jpg";

const INK = "#181825";
const MUTED = "#5f6676";
const BROWN = "#8c7054";
const BROWN_DARK = "#6a5239";
const IVORY = "#f9f8f5";
const BORDER = "#e5e1dc";
const DISPLAY = `'Playfair Display',Georgia,'Times New Roman',serif`;
const BODY = `'DM Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface EmailParts {
  /** The line an inbox shows after the subject. Plain text. */
  preview: string;
  /** Small uppercase label over the heading ("Confirm your email", "You're invited"). Plain text. */
  label: string;
  /** The italic heading. Plain text. */
  title: string;
  /** A quiet line under the heading (dates and places). Plain text. */
  meta?: string;
  /** The message. Plain text; each item is a paragraph. */
  paragraphs: string[];
  button: { text: string; url: string };
  /** Small print under the button. Plain text. */
  footnote: string;
}

/** The HTML of one email. Everything passed in is escaped here, so names can't add markup. */
export function emailHtml(p: EmailParts): string {
  const e = escapeHtml;
  const url = e(p.button.url);
  const paragraphs = p.paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.55;color:${INK}">${e(t)}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${e(p.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Playfair+Display:ital,wght@0,600;1,700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${IVORY};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(p.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
<tr><td style="padding:0;line-height:0;font-size:0"><img src="${HEADER_IMAGE}" width="600" alt="TripTab: Plan it. Split it. Live it." style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:28px 32px 8px">
<p style="margin:0 0 8px;font-family:${BODY};font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:${BROWN}">${e(p.label)}</p>
<h1 style="margin:0 0 ${p.meta ? "6px" : "16px"};font-family:${DISPLAY};font-style:italic;font-weight:700;font-size:30px;line-height:1.2;color:${INK}">${e(p.title)}</h1>
${p.meta ? `<p style="margin:0 0 18px;font-family:${BODY};font-size:14px;line-height:1.5;color:${MUTED}">${e(p.meta)}</p>` : ""}
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr>
<td style="border-radius:999px;background:${BROWN}"><a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${BROWN};border:1px solid ${BROWN_DARK};font-family:${DISPLAY};font-size:17px;font-weight:600;color:#ffffff;text-decoration:none">${e(p.button.text)}</a></td>
</tr></table>
<p style="margin:0 0 6px;font-family:${BODY};font-size:13px;line-height:1.5;color:${MUTED}">${e(p.footnote)}</p>
<p style="margin:0 0 24px;font-family:${BODY};font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all">Button not working? Open <a href="${url}" style="color:${BROWN_DARK}">${url}</a></p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${BODY};font-size:12px;color:${MUTED}">TripTab · Group trips, settled · <a href="https://triptab.org" style="color:${MUTED}">triptab.org</a> · <a href="https://triptab.org/privacy" style="color:${MUTED}">Privacy</a></p>
</td></tr>
</table>
</body></html>`;
}
