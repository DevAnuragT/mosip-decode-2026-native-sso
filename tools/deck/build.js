// Pitch deck for MOSIP Decode 2026, PS03 (Native SSO in eSignet Go), Team AlphaQ.
// pptxgenjs, 16:9 (10 x 5.625 in). Run fix_ids.py on the output afterwards.
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const IMG = require("path").resolve(__dirname, "../../docs/images") + "/";
const OUT = process.argv[2] || "deck.pptx";

const THEME = {
  name: "AlphaQ Native SSO",
  headFontFace: "Georgia",
  bodyFontFace: "Arial",
  colors: {
    dk1: "1B2535", // body text / dark background
    lt1: "FFFFFF",
    dk2: "4A5568", // muted text
    lt2: "F3F5F9", // card tint
    accent1: "E8541E", // orange
    accent2: "1F5FA8", // blue
    accent3: "2E7D32", // green
    accent4: "3E4C66", // slate box
    accent5: "C9D3E3", // lines / light text on dark
    accent6: "FFE6D9", // orange tint
    hlink: "1F5FA8",
    folHlink: "1F5FA8",
  },
};
const HEAD = THEME.headFontFace, BODY = THEME.bodyFontFace, MONO = "Courier New";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
pres.title = "Native SSO in eSignet Go for Mobile Apps";
pres.author = "Team AlphaQ";
pres.subject = "MOSIP Decode 2026 - Problem statement 03";
const C = pres.SchemeColor;

// ---------- grid ----------
const L = 0.5, R = 9.5, W = R - L; // margins
const TOP = 1.15, BOT = 4.95;       // content band (footer at 5.18)
const GAP = 0.3, PAD = 0.2, RAD = 0.08, BADGE = 0.4;
const FOOT = "MOSIP Decode 2026 · PS03 · Native SSO in eSignet (Go) · Team AlphaQ";

pres.defineSlideMaster({ title: "DARK", background: { color: C.text1 }, objects: [] });
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: L, y: 0.35, w: W, h: 0.6, fontSize: 28, bold: true, fontFace: HEAD, color: C.text1, margin: 0, valign: "middle", align: "left", fit: "none", wrap: false }, text: "" } },
    { text: { text: FOOT, options: { x: L, y: 5.18, w: 7.5, h: 0.28, fontSize: 10, fontFace: BODY, color: C.text2, margin: 0, valign: "middle", isTextBox: true, objectName: "footer" } } },
  ],
  slideNumber: { x: 9.0, y: 5.18, w: 0.5, h: 0.28, fontSize: 10, fontFace: BODY, color: C.text2, align: "right", valign: "middle", margin: 0 },
});

// ---------- text measuring (real advance widths of Arial / Georgia, 1/1000 em, from widths.json) ----------
const WID = require("./widths.json");
function textWidth(str, pt, o = {}) {
  if (o.mono) return (str.length * 600 * pt) / 72000;
  const t = WID[(o.serif ? "georgia" : "arial") + (o.bold ? "b" : "")];
  let u = 0;
  for (const ch of str) u += t[ch] || 600;
  return (u * pt) / 72000;
}
function nLines(str, pt, w, o = {}) {
  let n = 0;
  const sp = textWidth(" ", pt, o);
  for (const para of String(str).split("\n")) {
    let line = 0; n++;
    for (const word of para.split(" ")) {
      const ww = textWidth(word, pt, o);
      if (line > 0 && line + sp + ww > w) { n++; line = ww; } else line += (line > 0 ? sp : 0) + ww;
    }
  }
  return n;
}
const LH = 1.2; // line height factor
function textH(s, pt, w, o = {}) { return (nLines(s, pt, w * 0.96, o) * pt * LH) / 72; }
// Break text into lines ourselves (same rule as nLines) and emit soft line breaks, so PowerPoint,
// LibreOffice and Quick Look all show exactly the measured lines. segs: [{ text, bold, ...runOptions }]
function wrapRuns(segs, pt, w, o = {}) {
  const runs = [];
  const paras = [[]];
  segs.forEach((sg, si) => String(sg.text).split("\n").forEach((part, pi) => {
    if (pi > 0) paras.push([]);
    part.split(" ").filter((x) => x.length).forEach((word) => paras[paras.length - 1].push({ word, si }));
  }));
  paras.forEach((toks, pIdx) => {
    const lines = [[]];
    let line = 0;
    toks.forEach((t) => {
      const f = Object.assign({}, o, { bold: segs[t.si].bold || o.bold });
      const ww = textWidth(t.word, pt, f), sp = textWidth(" ", pt, f);
      if (line > 0 && line + sp + ww > w * 0.96) { lines.push([t]); line = ww; } else { lines[lines.length - 1].push(t); line += (line > 0 ? sp : 0) + ww; }
    });
    lines.forEach((ln, li) => {
      let cur = null;
      ln.forEach((t, ti) => {
        const last = ti === ln.length - 1;
        if (cur && cur.si === t.si) cur.text += " " + t.word;
        else {
          if (cur) cur.text += " ";
          const { text: _t, ...rest } = segs[t.si];
          cur = { si: t.si, text: t.word, options: Object.assign({}, rest, ti === 0 && li > 0 ? { softBreakBefore: true } : {}) };
          runs.push(cur);
        }
        if (last && li === lines.length - 1 && pIdx < paras.length - 1) cur.options.breakLine = true;
      });
    });
  });
  return runs.map((r) => ({ text: r.text, options: r.options }));
}


// ---------- drawing helpers (every call builds fresh option objects) ----------
let seq = 0, SLIDE = 0;
const nm = (p) => `${p} ${++seq}`;
function bounds(what, x, y, w, h) {
  if (x < 0.45 || y < 0.3 || x + w > 9.51 || y + h > 5.11) console.warn(`slide ${SLIDE}: ${what} outside the safe area (${x.toFixed(2)}, ${y.toFixed(2)}, ${(x + w).toFixed(2)}, ${(y + h).toFixed(2)})`);
}
function rect(slide, x, y, w, h, fill, o = {}) {
  bounds(o.name || "card", x, y, w, h);
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: o.radius || RAD,
    fill: { color: fill },
    line: o.line ? { color: o.line, width: 0.75 } : { type: "none" },
    objectName: nm(o.name || "card"),
  });
}
function card(slide, x, y, w, h, o = {}) { rect(slide, x, y, w, h, o.fill || C.background2, { line: o.line === undefined ? C.accent5 : o.line, name: o.name }); }
function text(slide, t, o) {
  const opt = Object.assign({ fontSize: 12, fontFace: BODY, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: nm("text") }, o);
  if (typeof t === "string") {
    const need = textH(t, opt.fontSize, opt.w, { bold: opt.bold, serif: opt.fontFace === HEAD, mono: opt.fontFace === MONO });
    if (need > opt.h + 0.03) console.warn(`slide ${SLIDE}: text needs ${need.toFixed(2)} in, box is ${opt.h.toFixed(2)}: ${t.slice(0, 50)}`);
  }
  bounds("text", opt.x, opt.y, opt.w, opt.h);
  if (typeof t === "string" && !opt.charSpacing) t = wrapRuns([{ text: t }], opt.fontSize, opt.w, { bold: opt.bold, serif: opt.fontFace === HEAD, mono: opt.fontFace === MONO });
  slide.addText(t, opt);
}
function badge(slide, x, y, label, color) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: BADGE, h: BADGE, fill: { color }, line: { type: "none" }, objectName: nm("badge") });
  slide.addText(String(label), { x, y, w: BADGE, h: BADGE, fontSize: 12, bold: true, fontFace: BODY, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("badge text") });
}
function dot(slide, x, y, color) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: 0.1, h: 0.1, fill: { color }, line: { type: "none" }, objectName: nm("marker") });
}
// straight connectors only: horizontal drawn left to right, vertical top to bottom; arrowhead at the end
function hline(slide, x1, x2, y, color, head) {
  slide.addShape(pres.ShapeType.line, { x: x1, y, w: x2 - x1, h: 0, line: Object.assign({ color: color || C.accent4, width: 1.5 }, head ? { endArrowType: "triangle" } : {}), objectName: nm(head ? "arrow" : "connector") });
}
function vline(slide, x, y1, y2, color, head) {
  slide.addShape(pres.ShapeType.line, { x, y: y1, w: 0, h: y2 - y1, line: Object.assign({ color: color || C.accent4, width: 1.5 }, head ? { endArrowType: "triangle" } : {}), objectName: nm(head ? "arrow" : "connector") });
}
// vertical arrow from y1 down to y2 with a caption in a gap of the line
function vlabelled(slide, x, y1, y2, label, lw, lines) {
  const lh = (lines * 10 * LH) / 72 + 0.04, mid = (y1 + y2) / 2, gap = 0.06;
  vline(slide, x, y1, mid - lh / 2 - gap, C.accent4, false);
  vline(slide, x, mid + lh / 2 + gap, y2, C.accent4, true);
  text(slide, label, { x: x - lw / 2, y: mid - lh / 2, w: lw, h: lh, fontSize: 10, color: C.text2, align: "center", valign: "middle" });
}
// solid box with a bold head line and an optional sub line, centred
function box(slide, x, y, w, h, head, sub, fill, o = {}) {
  rect(slide, x, y, w, h, fill, { name: "box" });
  const runs = [{ text: head, options: { bold: true, fontSize: o.headPt || 12, breakLine: !!sub } }];
  if (sub) runs.push({ text: sub, options: { fontSize: o.subPt || 10.5, color: o.subColor || C.background1 } });
  slide.addText(runs, { x: x + 0.08, y, w: w - 0.16, h, fontFace: BODY, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("box text") });
  for (const [t, pt, b] of [[head, o.headPt || 12, true], [sub || "", o.subPt || 10.5, false]]) {
    for (const line of t.split("\n")) if (textWidth(line, pt, { bold: b }) > (w - 0.16) * 0.96) console.warn(`slide ${SLIDE}: box line wraps: ${line}`);
  }
}
// screenshots cropped at a card boundary (see CROP); width follows each crop's aspect ratio
const CROP = { "health-signed-in-silently.png": 1591, "wallet-signed-in.png": 1711 };
const CROPDIR = require("path").join(__dirname, "crop") + "/";
function phoneW(file, h) { return h * (1080 / (CROP[file] || 2412)); }
function phone(slide, file, x, y, h, name) {
  const w = phoneW(file, h);
  rect(slide, x - 0.05, y - 0.05, w + 0.1, h + 0.1, C.text1, { radius: 0.12, name: "phone frame" });
  slide.addImage({ path: (CROP[file] ? CROPDIR : IMG) + file, x, y, w, h, objectName: name, altText: name });
  return w;
}
// marker list (works on light and dark fills alike): a small ellipse plus one text box per item.
// items are strings or [bold lead, rest]. Returns the height used.
function listH(items, w, o = {}) {
  const pt = o.pt || 12, gap = o.gap === undefined ? 0.14 : o.gap;
  return items.reduce((a, it) => a + textH(Array.isArray(it) ? it.join(" ") : it, pt, w - 0.25, {}), 0) + gap * (items.length - 1);
}
function list(slide, items, x, y, w, o = {}) {
  const pt = o.pt || 12, gap = o.gap === undefined ? 0.14 : o.gap, y0 = y;
  items.forEach((it) => {
    const [lead, rest] = Array.isArray(it) ? it : [null, it];
    const h = textH(lead ? lead + " " + rest : rest, pt, w - 0.25, {});
    dot(slide, x, y + (pt * LH) / 144 - 0.05, o.marker || C.accent1);
    const segs = [];
    if (lead) segs.push({ text: lead, bold: true, color: o.leadColor || o.color || C.text1 });
    segs.push({ text: rest });
    const runs = wrapRuns(segs, pt, w - 0.25);
    slide.addText(runs, { x: x + 0.25, y, w: w - 0.25, h, fontSize: pt, fontFace: BODY, color: o.color || C.text1, margin: 0, valign: "top", isTextBox: true, objectName: nm("list item") });
    y += h + gap;
  });
  return y - gap - y0;
}
function title(slide, t) {
  if (textWidth(t, 28, { bold: true, serif: true }) > W * 0.96) console.warn(`slide ${SLIDE}: title may wrap: ${t}`);
  slide.addText(t, { placeholder: "title" });
}
function contentSlide(section) { SLIDE++; return pres.addSlide({ masterName: "CONTENT", sectionTitle: section }); }
function darkSlide(section) { SLIDE++; return pres.addSlide({ masterName: "DARK", sectionTitle: section }); }

// =====================================================================================
// 1. Title
pres.addSection({ title: "Opening" });
{
  const s = darkSlide("Opening");
  text(s, "MOSIP DECODE 2026 · PROBLEM STATEMENT 03", { x: 0.6, y: 0.7, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 1 });
  s.addText([{ text: "One login,", options: { breakLine: true } }, { text: "every app." }], { x: 0.6, y: 1.15, w: 5.4, h: 1.45, fontSize: 44, bold: true, fontFace: HEAD, color: C.background1, margin: 0, valign: "top", isTextBox: true, objectName: "deck title" });
  text(s, "OpenID Connect Native SSO for mobile apps, built into eSignet (Go) and the ThunderID engine, with an Android SDK and two reference apps.", { x: 0.6, y: 2.8, w: 5.3, h: 1.05, fontSize: 16, color: C.accent5 });
  text(s, "Team AlphaQ", { x: 0.6, y: 4.2, w: 4, h: 0.35, fontSize: 18, bold: true, color: C.background1 });
  text(s, "eSignet | Enable Native SSO in eSignet Go for Mobile Apps", { x: 0.6, y: 4.6, w: 5.4, h: 0.3, fontSize: 12, color: C.accent5 });

  // motif: one login feeding three apps through a bracket connector
  const lx = 6.35, lw = 1.15, appX = 8.25, appW = 1.25, appH = 0.75, trunk = 7.85;
  const ys = [1.35, 2.5, 3.65];
  const mid = ys[1] + appH / 2;
  rect(s, lx, mid - 0.6, lw, 1.2, C.accent1, { radius: 0.15, name: "login badge" });
  s.addText([{ text: "1", options: { fontSize: 30, bold: true, breakLine: true } }, { text: "login", options: { fontSize: 14, bold: true } }], { x: lx, y: mid - 0.6, w: lw, h: 1.2, fontFace: BODY, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "login badge text" });
  hline(s, lx + lw, appX, mid, C.accent5, true);
  vline(s, trunk, ys[0] + appH / 2, ys[2] + appH / 2, C.accent5, false);
  hline(s, trunk, appX, ys[0] + appH / 2, C.accent5, true);
  hline(s, trunk, appX, ys[2] + appH / 2, C.accent5, true);
  [["Wallet", C.accent2], ["Health", C.accent3], ["Tax", C.accent4]].forEach(([a, col], i) => {
    rect(s, appX, ys[i], appW, appH, col, { radius: 0.15, name: "app " + a });
    text(s, a, { x: appX, y: ys[i], w: appW, h: appH, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  s.addNotes("Title slide. One login, every app: a citizen signs in once in the vendor's super app and every sibling app on the phone reuses that login without a browser, an OTP or a consent screen.");
}

// =====================================================================================
// 2. Problem
pres.addSection({ title: "Problem and approach" });
{
  const s = contentSlide("Problem and approach");
  title(s, "Native apps do not share a login");
  const lw = 5.4;
  const para = "A citizen with a wallet, a health app and a tax app from the same vendor authenticates three times: UIN, OTP and consent in every app, on the same phone. Browser cookies never reach a native app's sandbox, so web SSO does not help.";
  const ph = textH(para, 14, lw);
  text(s, para, { x: L, y: TOP, w: lw, h: ph, fontSize: 14 });

  // right dark panel
  const px = 6.2, pw = R - px, ix = px + 0.3, iw = pw - 0.55;
  const items = [
    "A designed, cryptographically secured hand-off of authentication state between apps on one device",
    "No shared cookie, no repeated login, no silent widening of consent",
    "Built on OIDC Native SSO 1.0, RFC 8693 token exchange, RFC 9449 DPoP and FAPI 2.0",
  ];
  const ih = 0.25 + 0.35 + 0.15 + listH(items, iw, { gap: 0.18 }) + 0.25;

  // stat cards share the panel's bottom edge
  const cy = TOP + ph + GAP, cw = (lw - 2 * GAP) / 3;
  const stats = [["3×", "OTP and consent today, for three apps"], ["0", "shared sessions between native apps"], ["1", "trusted login is all it takes"]];
  const labelH = Math.max(...stats.map(([, l]) => textH(l, 13, cw - 0.4)));
  const inner = 0.85 + 0.1 + labelH;
  const ch = Math.max(0.25 + inner + 0.25, TOP + ih - cy);
  stats.forEach(([n, l], i) => {
    const x = L + i * (cw + GAP);
    card(s, x, cy, cw, ch);
    const top = cy + (ch - inner) / 2;
    text(s, n, { x: x + 0.2, y: top, w: cw - 0.4, h: 0.85, fontSize: 52, bold: true, color: C.accent1, valign: "middle" });
    text(s, l, { x: x + 0.2, y: top + 0.95, w: cw - 0.4, h: labelH, fontSize: 13, color: C.text2 });
  });
  const ph2 = cy + ch - TOP;
  rect(s, px, TOP, pw, ph2, C.text1, { name: "spec panel" });
  const y0 = TOP + (ph2 - ih) / 2 + 0.25;
  text(s, "What the spec asks for", { x: ix, y: y0, w: iw, h: 0.35, fontSize: 15, bold: true, color: C.background1, fontFace: HEAD });
  list(s, items, ix, y0 + 0.5, iw, { gap: 0.18, color: C.accent5 });
  s.addNotes("Why native SSO is a real problem for national ID programmes: every app of the same vendor re-runs UIN, OTP and consent.");
}

// =====================================================================================
// 3. Three moves
{
  const s = contentSlide("Problem and approach");
  title(s, "The solution in three moves");
  const moves = [
    ["SUPER APP", "Logs in once", "PAR + PKCE + DPoP with a hardware key (Key A) and the new device_sso scope. eSignet returns an access_token, an id_token and a device_secret.", C.accent2],
    ["DEVICE SECRET", "Stays bound", "A signed-then-encrypted JWT carrying cnf.jkt = Key A, sid, scope and the consented claims. The id_token carries ds_hash and the same sid.", C.accent1],
    ["CHILD APP", "Signs in silently", "Over a signature-protected IPC it receives id_token + device_secret + a DPoP proof signed by Key A, and exchanges them (RFC 8693) for its own token.", C.accent3],
  ];
  const cw = (W - 2 * GAP) / 3, iw = cw - 0.5;
  const bh = Math.max(...moves.map(([, , b]) => textH(b, 12, iw)));
  const ch = 0.25 + BADGE + 0.15 + 0.32 + 0.1 + bh + 0.25;
  moves.forEach(([k, h, b, col], i) => {
    const x = L + i * (cw + GAP);
    card(s, x, TOP, cw, ch);
    badge(s, x + 0.25, TOP + 0.25, i + 1, col);
    text(s, k, { x: x + 0.25 + BADGE + 0.15, y: TOP + 0.25, w: iw - BADGE - 0.15, h: BADGE, fontSize: 11, bold: true, color: col, charSpacing: 1, valign: "middle" });
    text(s, h, { x: x + 0.25, y: TOP + 0.25 + BADGE + 0.15, w: iw, h: 0.32, fontSize: 16, bold: true, fontFace: HEAD });
    text(s, b, { x: x + 0.25, y: TOP + 0.25 + BADGE + 0.15 + 0.32 + 0.1, w: iw, h: bh, fontSize: 12, color: C.text2 });
  });
  const res = "Result: the child app gets its own DPoP-bound token with no browser, no OTP and no consent screen, and nothing the user did not consent to.";
  const by = TOP + ch + GAP, bhh = textH(res, 13, W - 0.5, { bold: true }) + 0.36;
  rect(s, L, by, W, bhh, C.accent6, { name: "result bar" });
  text(s, res, { x: L + 0.25, y: by, w: W - 0.5, h: bhh, fontSize: 13, bold: true, valign: "middle" });
  s.addNotes("Three moves: super app logs in once with device_sso; the device secret is cryptographically bound; the child app exchanges it silently.");
}

// =====================================================================================
// 4. Architecture
pres.addSection({ title: "How it works" });
{
  const s = contentSlide("How it works");
  title(s, "Architecture: who does what");
  const gTop = TOP, gBot = BOT, rowA = 1.65, rowB = 3.85, bh = 0.9;
  const pg = { x: L, w: 2.15 }, sg = { x: 3.3, w: R - 3.3 };
  card(s, pg.x, gTop, pg.w, gBot - gTop, { name: "phone group" });
  card(s, sg.x, gTop, sg.w, gBot - gTop, { name: "server group" });
  text(s, "PHONE", { x: pg.x + 0.15, y: gTop + 0.15, w: pg.w - 0.3, h: 0.22, fontSize: 10, bold: true, color: C.text2, charSpacing: 1 });
  text(s, "eSIGNET SERVER (GO) + THUNDERID ENGINE", { x: sg.x + 0.25, y: gTop + 0.15, w: 4.2, h: 0.22, fontSize: 10, bold: true, color: C.text2, charSpacing: 1 });
  // phone column
  const ax = pg.x + 0.15, aw = pg.w - 0.3, acx = ax + aw / 2;
  box(s, ax, rowA, aw, bh, "Vendor Wallet", "super app · holds Key A", C.accent2);
  box(s, ax, rowB, aw, bh, "Vendor Health", "child app · no key", C.accent3);
  vlabelled(s, acx, rowA + bh, rowB, "IPC, same vendor\ncertificate:\nid_token, device_secret,\nDPoP proof", aw, 4);
  // server
  const ex = sg.x + 0.25, ew = 1.8;
  const px = 6.3, pw = R - 0.25 - px;
  const kw = (pw - 0.25) / 2, kx = px, cx2 = px + kw + 0.25;
  // engine: tall box with two labelled groups of lines
  rect(s, ex, rowA, ew, rowB + bh - rowA, C.text1, { name: "box" });
  const eLines = [["ThunderID engine", 13, true, C.background1, 10], ["GRANTS", 10, true, C.accent1, 2], ["authorization code", 11, false, C.accent5, 2], ["token exchange", 11, false, C.accent5, 10],
    ["CHECKS", 10, true, C.accent1, 2], ["ds_hash · sid", 11, false, C.accent5, 2], ["cnf.jkt = DPoP key", 11, false, C.accent5, 2], ["scope ⊆ grant", 11, false, C.accent5, 0]];
  eLines.forEach(([t, pt, b]) => { if (textWidth(t, pt, { bold: b }) > (ew - 0.16) * 0.96) console.warn(`slide ${SLIDE}: engine line wraps: ${t}`); });
  s.addText(eLines.map(([t, pt, b, col, after], i) => ({ text: t, options: { fontSize: pt, bold: b, color: col, charSpacing: t === t.toUpperCase() ? 1 : 0, paraSpaceAfter: after, breakLine: i < eLines.length - 1 } })),
    { x: ex + 0.08, y: rowA, w: ew - 0.16, h: rowB + bh - rowA, fontFace: BODY, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("engine text") });
  box(s, px, rowA, pw, bh, "DeviceSecretProvider", "eSignet · generate / validate", C.accent1);
  box(s, kx, rowB, kw, bh, "Keymanager", "signing and\nencryption keys", C.accent4);
  box(s, cx2, rowB, kw, bh, "Consent store", "consent_detail\n+ history", C.accent4);
  const yA = rowA + bh / 2, yB = rowB + bh / 2, gapW = ex - ax - aw;
  hline(s, ax + aw, ex, yA, C.accent4, true);
  hline(s, ax + aw, ex, yB, C.accent4, true);
  // arrow captions: two short lines centred above the shaft, clear of the arrowhead and both boxes
  const capH = (2 * 10 * LH) / 72 + 0.02;
  const cap = (t, x1, x2, y) => text(s, t, { x: x1 + 0.05, y: y - 0.08 - capH, w: x2 - x1 - 0.2, h: capH, fontSize: 10, color: C.text2, align: "center", valign: "bottom" });
  cap("PAR +\ntoken", ax + aw, ex, yA);
  cap("token\nexchange", ax + aw, ex, yB);
  hline(s, ex + ew, px, yA, C.accent4, true);
  cap("device\nsecret", ex + ew, px, yA);
  vlabelled(s, kx + kw / 2, rowA + bh, rowB, "sign + encrypt", kw, 1);
  vlabelled(s, cx2 + kw / 2, rowA + bh, rowB, "derived consent", kw, 1);
  s.addNotes("Phone side: Wallet holds Key A and exposes a ContentProvider; Health never holds a key. Server side: the ThunderID engine enforces the grant rules, eSignet's DeviceSecretProvider mints and validates the secret through the keymanager and records derived consent.");
}

// =====================================================================================
// 5 / 6. Flows: numbered steps on the left
function steps(s, list, w) {
  const n = list.length, pitch = (BOT - TOP) / n;
  list.forEach(([t, col], i) => {
    const y = TOP + i * pitch;
    badge(s, L, y, i + 1, col || C.accent2);
    const h = textH(t, 12, w);
    if (h > pitch - 0.05) console.warn(`slide ${SLIDE}: step ${i + 1} too tall`);
    text(s, t, { x: L + BADGE + 0.2, y: y + BADGE / 2 - (12 * LH) / 144, w, h, fontSize: 12 });
  });
}
{
  const s = contentSlide("How it works");
  title(s, "Flow 1: super app login with device_sso");
  steps(s, [
    ["POST /oauth2/par: scope=openid profile email device_sso, dpop_jkt = thumbprint(Key A), PKCE, private_key_jwt"],
    ["Custom Tab: eSignet OTP login and consent; the user chooses which claims to release"],
    ["POST /oauth2/token (authorization_code) with a DPoP proof signed by Key A"],
    ["Engine: is the client registered for device_sso? Then GenerateDeviceSecret(sub, sid, scope, claims, cnf.jkt, …)", C.accent1],
    ["eSignet signs the claims and encrypts the JWS to its own encryption key: an opaque device_secret", C.accent1],
    ["Response: access_token (cnf.jkt), id_token (ds_hash, sid) and device_secret, stored encrypted on the phone", C.accent1],
  ], 4.6);
  const x = 6.0, w = R - x, ix = x + 0.25, iw = w - 0.5;
  // card A: what the id_token gains
  const aH = 0.22 + 0.3 + 0.12 + 4 * 0.2 + 0.08 + 0.22;
  rect(s, x, TOP, w, aH, C.text1, { name: "id_token card" });
  text(s, "id_token gains", { x: ix, y: TOP + 0.22, w: iw, h: 0.3, fontSize: 14, bold: true, fontFace: HEAD, color: C.background1 });
  s.addText([
    { text: "ds_hash", options: { bold: true, color: C.accent1, fontFace: MONO, breakLine: true } },
    { text: "BASE64URL(SHA-256(device_secret))", options: { breakLine: true, paraSpaceAfter: 6 } },
    { text: "sid", options: { bold: true, color: C.accent1, fontFace: MONO, breakLine: true } },
    { text: "the same value as in the device secret" },
  ], { x: ix, y: TOP + 0.64, w: iw, h: 4 * 0.2 + 0.1, fontSize: 12, fontFace: BODY, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: "id token claims" });
  // card B: claims inside the device secret
  const by = TOP + aH + GAP, bH = BOT - by;
  rect(s, x, by, w, bH, C.text1, { name: "device secret card" });
  text(s, "device_secret carries", { x: ix, y: by + 0.22, w: iw, h: 0.3, fontSize: 14, bold: true, fontFace: HEAD, color: C.background1 });
  const claims = ["iss", "sub", "auth_id", "sid", "client_id", "scope", "acr", "claims", "cnf.jkt", "iat", "exp", "jti"];
  const cols = 4, cg = 0.08, chw = (iw - (cols - 1) * cg) / cols, chh = 0.28, rowsN = Math.ceil(claims.length / cols);
  const gh = rowsN * chh + (rowsN - 1) * cg, gtop = by + 0.22 + 0.3 + 0.15, gy0 = gtop + (bH - (gtop - by) - 0.22 - gh) / 2;
  claims.forEach((c, i) => {
    const cx = ix + (i % cols) * (chw + cg), cy = gy0 + Math.floor(i / cols) * (chh + cg);
    rect(s, cx, cy, chw, chh, C.accent4, { radius: 0.06, name: "claim chip" });
    text(s, c, { x: cx, y: cy, w: chw, h: chh, fontSize: 11, color: C.background1, align: "center", valign: "middle" });
  });
  s.addNotes("Flow 1 is a standard FAPI 2.0 authorization-code login plus the device_sso scope. Steps 4 to 6 (orange) are the new engine and provider work.");
}
{
  const s = contentSlide("How it works");
  title(s, "Flow 2: child app silent sign-in");
  steps(s, [
    ["Over a ContentProvider behind a signature-level permission, the child asks the super app for its id_token, device_secret and a DPoP proof", C.accent3],
    ["The super app re-checks the caller's signing certificate and signs the proof with Key A; the key never leaves the Wallet", C.accent3],
    ["POST /oauth2/token as a token exchange: subject_token = id_token, actor_token = device_secret"],
    ["The engine verifies the secret, ds_hash, sid, sub, cnf.jkt = DPoP key, vendor family, scope ⊆ grant and consent", C.accent1],
    ["Response: a DPoP-bound access_token with act.sub = super app; userinfo returns the consented claims", C.accent1],
  ], 4.0);
  const ph = 2.9, py = TOP + (BOT - TOP - ph) / 2, px = 5.4;
  const pw = phone(s, "health-signed-in-silently.png", px, py, ph, "Vendor Health signed in silently");
  const tx = px + pw + 0.05 + GAP, tw = R - tx;
  text(s, "On the phone", { x: tx, y: py, w: tw, h: 0.3, fontSize: 14, bold: true, fontFace: HEAD });
  const cap = "Signed in silently in 215\u00a0ms: no browser, no OTP, no consent screen.";
  const capH = textH(cap, 12, tw);
  text(s, cap, { x: tx, y: py + 0.4, w: tw, h: capH, fontSize: 12, color: C.text2 });
  let y = py + 0.4 + capH + GAP;
  [["act.sub", "mosip-super-app"], ["cnf.jkt", "Key A"]].forEach(([k, v]) => {
    card(s, tx, y, tw, 0.72, { name: "token fact" });
    text(s, k, { x: tx + 0.2, y: y + 0.12, w: tw - 0.4, h: 0.22, fontSize: 12, bold: true, fontFace: MONO, color: C.accent2 });
    text(s, v, { x: tx + 0.2, y: y + 0.38, w: tw - 0.4, h: 0.22, fontSize: 12 });
    y += 0.72 + 0.2;
  });
  s.addNotes("Flow 2 is RFC 8693 token exchange with the device secret as actor token. The child app never touches Key A; the Wallet signs its DPoP proofs. The screenshot shows the silent sign-in on the phone.");
}

// =====================================================================================
// 7. Six bindings
{
  const s = contentSlide("How it works");
  title(s, "Six bindings make the hand-off safe");
  const items = [
    ["ds_hash", "The id_token names exactly one device secret. Swap either and the exchange fails."],
    ["sid", "Both tokens come from the same authentication: session id or authorization id."],
    ["cnf.jkt", "The DPoP proof must come from Key A; a stolen pair is useless without it."],
    ["Vendor family", "Only the same relying party or an allow-listed sibling; others get invalid_grant."],
    ["Scope ⊆ grant", "Never more than the super app was granted; device_sso is never exchangeable."],
    ["Derived consent", "Only claims accepted for the super app reach the child; the rest is refused."],
  ];
  const cw = (W - 2 * GAP) / 3, iw = cw - 0.5;
  const bh = Math.max(...items.map(([, b]) => textH(b, 12, iw)));
  const ch = 0.25 + BADGE + 0.15 + bh + 0.25;
  items.forEach(([h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = L + col * (cw + GAP), y = TOP + row * (ch + GAP);
    card(s, x, y, cw, ch);
    badge(s, x + 0.25, y + 0.25, i + 1, row === 0 ? C.accent2 : C.accent1);
    text(s, h, { x: x + 0.25 + BADGE + 0.15, y: y + 0.25, w: iw - BADGE - 0.15, h: BADGE, fontSize: 14, bold: true, fontFace: HEAD, valign: "middle" });
    text(s, b, { x: x + 0.25, y: y + 0.25 + BADGE + 0.15, w: iw, h: bh, fontSize: 12, color: C.text2 });
  });
  s.addNotes("Each binding is enforced in the engine and covered by a negative end-to-end test. Blue: token-level bindings; orange: policy bindings.");
}

// =====================================================================================
// 8. Bonus
{
  const s = contentSlide("How it works");
  title(s, "Bonus: re-consent instead of over-sharing");
  const intro = "The super app's consent is reused, never widened: eSignet checks the child's requested claims against what the user accepted, then derives a consent record (with an audit row) or refuses the silent path.";
  const ih = textH(intro, 13, W);
  text(s, intro, { x: L, y: TOP, w: W, h: ih, fontSize: 13 });
  const cA = { x: L, w: 2.4 }, cB = { x: 3.4, w: 2.6 }, cC = { x: 6.5, w: R - 6.5 };
  const hy = TOP + ih + 0.25;
  [["CHILD REQUESTS", cA], ["SUPER-APP CONSENT", cB], ["eSIGNET ANSWERS", cC]].forEach(([t, c]) => text(s, t, { x: c.x, y: hy, w: c.w, h: 0.22, fontSize: 10, bold: true, color: C.text2, align: "center", charSpacing: 1 }));
  const rows = [
    ["openid email", "email was declined", "interaction_required", "claims not consented: email", C.accent1],
    ["openid profile", "name was accepted", "Silent sign-in", "child consent recorded + history row", C.accent3],
  ];
  const bh = 0.8, ry = hy + 0.32;
  rows.forEach(([a, b, c, d, col], i) => {
    const y = ry + i * (bh + 0.25), yc = y + bh / 2;
    box(s, cA.x, y, cA.w, bh, a, "scope requested by the child", C.accent2);
    hline(s, cA.x + cA.w, cB.x, yc, C.accent4, true);
    box(s, cB.x, y, cB.w, bh, b, "at the super app's consent", C.accent4);
    hline(s, cB.x + cB.w, cC.x, yc, C.accent4, true);
    box(s, cC.x, y, cC.w, bh, c, d, col);
  });
  const note = "On interaction_required or invalid_scope, the child explains why and opens eSignet consent for its own client.";
  const ny = ry + 2 * bh + 0.25 + GAP, nh = textH(note, 12, W - 0.5) + 0.3;
  rect(s, L, ny, W, nh, C.accent6, { name: "fallback bar" });
  text(s, note, { x: L + 0.25, y: ny, w: W - 0.5, h: nh, fontSize: 12, valign: "middle" });
  s.addNotes("The bonus task: when the child needs a claim the user declined for the super app, the silent path is refused and the child falls back to an interactive consent for its own client.");
}

// =====================================================================================
// 9. Task table
pres.addSection({ title: "Delivery" });
{
  const s = contentSlide("Delivery");
  title(s, "Every mandatory task, plus the bonus");
  const data = [
    ["1", "device_sso scope on the authorize request", "eSignet config · ThunderID scope"],
    ["2", "Token endpoint validates the scope for the client", "ThunderID auth-code grant"],
    ["3–4", "DeviceSecretProvider: generate and validate", "ThunderID + eSignet keymanager"],
    ["5–6", "Token endpoint issues and returns the secret", "ThunderID auth-code grant"],
    ["7–8", "Child app: IPC fetch, exchange with Key A proof", "Android SDK + apps"],
    ["9", "Exchange checks ds_hash, sid, client, cnf.jkt", "ThunderID token exchange"],
    ["10a/b", "Child scope ⊆ super scope; device_sso refused", "ThunderID"],
    ["Bonus", "Re-consent in the child app", "ThunderID, eSignet, apps"],
  ];
  const colW = [0.85, 4.2, 3.1, 0.85];
  data.forEach(([, b, c]) => {
    if (textWidth(b, 12) > (colW[1] - 0.24) * 0.96) console.warn(`slide ${SLIDE}: table cell wraps: ${b}`);
    if (textWidth(c, 12) > (colW[2] - 0.24) * 0.96) console.warn(`slide ${SLIDE}: table cell wraps: ${c}`);
  });
  const xs = [L]; colW.forEach((cwid) => xs.push(xs[xs.length - 1] + cwid));
  const hh = 0.4, rh = 0.4;
  rect(s, L, TOP, W, hh, C.text1, { radius: 0.06, name: "table header" });
  ["#", "Task", "Where", "Status"].forEach((t, c) => text(s, t, { x: xs[c] + 0.12, y: TOP, w: colW[c] - 0.24, h: hh, fontSize: 12, bold: true, color: C.background1, valign: "middle", align: c === 0 || c === 3 ? "center" : "left" }));
  data.forEach(([a, b, c2], r) => {
    const y = TOP + hh + r * rh;
    if (r % 2 === 1) s.addShape(pres.ShapeType.rect, { x: L, y, w: W, h: rh, fill: { color: C.background2 }, line: { type: "none" }, objectName: nm("table row") });
    text(s, a, { x: xs[0] + 0.06, y, w: colW[0] - 0.12, h: rh, fontSize: 12, bold: true, color: a === "Bonus" ? C.accent1 : C.text1, align: "center", valign: "middle" });
    text(s, b, { x: xs[1] + 0.12, y, w: colW[1] - 0.24, h: rh, fontSize: 12, valign: "middle" });
    text(s, c2, { x: xs[2] + 0.12, y, w: colW[2] - 0.24, h: rh, fontSize: 12, color: C.text2, valign: "middle" });
    const pw = 0.62, ph = 0.24, pxx = xs[3] + (colW[3] - pw) / 2, pyy = y + (rh - ph) / 2;
    rect(s, pxx, pyy, pw, ph, C.accent3, { radius: 0.12, name: "done pill" });
    text(s, "done", { x: pxx, y: pyy, w: pw, h: ph, fontSize: 10, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  s.addNotes("The ten tasks of the problem statement and the bonus, with where each lives.");
}

// =====================================================================================
// 10. Proof
{
  const s = contentSlide("Delivery");
  title(s, "What we built and how we proved it");
  const stats = [
    ["2", "upstream pull requests", "thunder-id/thunderid and mosip/esignet (develop-go)"],
    ["35/35", "end-to-end checks", "against a live eSignet, negative cases included"],
    ["50+", "new unit tests", "across the ThunderID engine and the eSignet provider"],
    ["3", "Android modules", "nativesso-sdk, Vendor Wallet and Vendor Health"],
  ];
  // fixed number column, numbers right-aligned so every number sits the same distance from its heading
  const cw = (W - GAP) / 2, nw = 1.3, ng = 0.3, tw = cw - 0.25 - nw - ng - 0.25;
  const lh = Math.max(...stats.map(([, l]) => textH(l, 13, tw, { bold: true, serif: true })));
  const dh = Math.max(...stats.map(([, , d]) => textH(d, 12, tw)));
  const inner = lh + 0.08 + dh, ch = inner + 0.44;
  const also = "Also delivered: Postman collection (20 requests), design and API documentation, OpenAPI update, configuration reference, one-command docker compose stack and the demo video.";
  const ah = textH(also, 12, W - 0.5) + 0.34;
  stats.forEach(([n, l, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = L + col * (cw + GAP), y = TOP + row * (ch + GAP);
    card(s, x, y, cw, ch);
    text(s, n, { x: x + 0.25, y, w: nw, h: ch, fontSize: 36, bold: true, color: C.accent1, valign: "middle", align: "right" });
    const ty = y + (ch - inner) / 2, tx0 = x + 0.25 + nw + ng;
    text(s, l, { x: tx0, y: ty, w: tw, h: lh, fontSize: 13, bold: true, fontFace: HEAD });
    text(s, d, { x: tx0, y: ty + lh + 0.08, w: tw, h: dh, fontSize: 12, color: C.text2 });
  });
  const ay = TOP + 2 * ch + 2 * GAP;
  rect(s, L, ay, W, ah, C.accent6, { name: "also bar" });
  text(s, also, { x: L + 0.25, y: ay, w: W - 0.5, h: ah, fontSize: 12, valign: "middle" });
  s.addNotes("Evidence: two upstream PRs, 35 end-to-end checks, 50+ unit tests, three Android modules, plus the documentation set. Both PR branches are DCO signed-off.");
}

// =====================================================================================
// 11. Apps
{
  const s = contentSlide("Delivery");
  title(s, "Reference apps and SDK for relying parties");
  const ph = 3.0, py = TOP + (BOT - TOP - ph) / 2;
  const w1 = phone(s, "wallet-signed-in.png", L + 0.05, py, ph, "Vendor Wallet signed in");
  const w2 = phone(s, "health-signed-in-silently.png", L + 0.05 + w1 + GAP, py, ph, "Vendor Health signed in silently");
  const tx = L + 0.05 + w1 + GAP + w2 + 0.45, tw = R - tx;
  const items = [
    ["nativesso-sdk:", "PAR / PKCE / DPoP client, Key A in the Android Keystore (StrongBox preferred), PS256 private_key_jwt, ID-token verification, encrypted session store, IPC contract"],
    ["Vendor Wallet:", "exports a ContentProvider behind a signature-level permission and re-checks the caller's certificate on every call"],
    ["Vendor Health:", "never holds a key; the Wallet signs its DPoP proofs, so its token is bound to Key A"],
    ["Demo details:", "sid, ds_hash, SHA-256 of the stored secret, act.sub and cnf.jkt shown on screen"],
    ["Fallback:", "interactive consent when eSignet answers interaction_required or invalid_scope"],
  ];
  const lh = listH(items, tw, { gap: 0.16 });
  if (lh > BOT - TOP - 0.2) console.warn(`slide ${SLIDE}: list taller than the content band`);
  list(s, items, tx, TOP + (BOT - TOP - lh) / 2, tw, { gap: 0.16, marker: C.accent2 });
  s.addNotes("The SDK and the two apps are a template for relying parties: everything a vendor needs to adopt native SSO is in the SDK. Left: Vendor Wallet signed in; right: Vendor Health signed in silently.");
}

// =====================================================================================
// 12. Upstream and next
{
  const s = contentSlide("Delivery");
  title(s, "Upstream path and what comes next");
  const cw = (W - GAP) / 2, iw = cw - 0.5;
  const left = [
    ["thunder-id/thunderid:", "provider contracts, device-secret issuance, token exchange with device-secret actor tokens, consent hook"],
    ["mosip/esignet develop-go:", "DeviceSecretProvider, derived consent, token_exchange clients, config, docs, Postman collection"],
    ["Community fix #2555:", "unrecognised consent purposeName"],
    ["Both branches:", "DCO signed-off, rebased on thunderid main and esignet develop-go"],
  ];
  const right = [
    "Revoke a device-secret family on super-app sign-out (jti is signed and available)",
    "Single-use jti tracking where a deployment wants it",
    "A consent-screen line item explaining device_sso to the citizen",
    "iOS reference app (App Groups + Keychain access groups)",
    "MOSIP IDA: encrypted KYC stays opaque; sibling apps share the relying-party decryption key",
  ];
  const lg = 0.16; // one item spacing for both cards
  const lH = listH(left, iw, { gap: lg }), rH = listH(right, iw, { gap: lg });
  const ch = 0.25 + 0.35 + 0.15 + Math.max(lH, rH) + 0.2;
  [["Upstream contributions", C.accent1, left], ["Natural follow-ups", C.accent2, right]].forEach(([h, col, items], i) => {
    const x = L + i * (cw + GAP);
    card(s, x, TOP, cw, ch);
    text(s, h, { x: x + 0.25, y: TOP + 0.25, w: iw, h: 0.35, fontSize: 15, bold: true, fontFace: HEAD, color: col });
    list(s, items, x + 0.25, TOP + 0.75, iw, { gap: lg, marker: col });
  });
  s.addNotes("Where the work goes upstream and what a production deployment would add next.");
}

// =====================================================================================
// 13. Closing
pres.addSection({ title: "Closing" });
{
  const s = darkSlide("Closing");
  text(s, "THANK YOU", { x: 0.6, y: 0.7, w: 6, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 1 });
  s.addText("One trusted login, reused securely across every app in the family.", { x: 0.6, y: 1.1, w: 8.6, h: 1.3, fontSize: 34, bold: true, fontFace: HEAD, color: C.background1, margin: 0, valign: "top", isTextBox: true, objectName: "closing title" });
  text(s, "Code, tests, Postman collection, documentation and the demo video are in the submission repository.", { x: 0.6, y: 2.6, w: 8.4, h: 0.55, fontSize: 16, color: C.accent5 });
  // command panel + recap tiles share one row
  const cy = 3.4, chh = 1.3, cw = 5.2;
  rect(s, 0.6, cy, cw, chh, C.accent4, { name: "command panel" });
  text(s, "Try it in ten minutes", { x: 0.85, y: cy + 0.18, w: cw - 0.5, h: 0.28, fontSize: 13, bold: true, color: C.background1 });
  s.addText("scripts/fetch-backends.sh\ndocker compose -f deploy/docker-compose.yml up\npython3 tests/native_sso_e2e.py", { x: 0.85, y: cy + 0.55, w: cw - 0.45, h: 0.62, fontSize: 12, fontFace: MONO, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: "try it commands" });
  const tiles = [["2", "upstream PRs"], ["35/35", "e2e checks"], ["50+", "unit tests"]];
  const tx0 = 0.6 + cw + GAP, tg = 0.15, tw = (9.4 - tx0 - 2 * tg) / 3;
  tiles.forEach(([n, l], i) => {
    const x = tx0 + i * (tw + tg);
    rect(s, x, cy, tw, chh, C.accent4, { name: "recap tile" });
    text(s, n, { x, y: cy + 0.22, w: tw, h: 0.5, fontSize: 24, bold: true, color: C.accent1, align: "center", valign: "middle" });
    text(s, l, { x, y: cy + 0.78, w: tw, h: 0.3, fontSize: 10.5, color: C.accent5, align: "center" });
  });
  text(s, "Team AlphaQ · MOSIP Decode 2026 · Problem statement 03", { x: 0.6, y: 4.84, w: 8, h: 0.26, fontSize: 12, color: C.accent5 });
  s.addNotes("Closing: one trusted login, reused securely across every app in the vendor family. Everything needed to run it is in the submission repository; the three commands bring up the stack and run the end-to-end checks.");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  // pptxgenjs writes a <a:pPr> before every run of a multi-run paragraph; keep only the first one
  const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
  const fs = require("fs");
  const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const xml = await zip.file(name).async("string");
    const fixed = xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (m, body) => {
      let seen = false;
      return "<a:p>" + body.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (pp) => (seen ? "" : ((seen = true), pp))) + "</a:p>";
    });
    zip.file(name, fixed);
  }
  fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("wrote", OUT);
})();
