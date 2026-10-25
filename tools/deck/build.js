// Rebuild of docs/pitch-deck.pptx as a structured pptxgenjs deck (16:9, 10 x 5.625 in).
const pptxgen = require("pptxgenjs");
const path = require("path");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const IMG = path.resolve(__dirname, "../../docs/images") + "/";
const OUT = process.argv[2] || "deck.pptx";

const THEME = {
  name: "AlphaQ Native SSO",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2535", // body text / dark background
    lt1: "FFFFFF",
    dk2: "4A5568", // muted text
    lt2: "F3F5F9", // card tint
    accent1: "E8541E", // orange
    accent2: "1F5FA8", // blue
    accent3: "2E7D32", // green
    accent4: "3E4C66", // slate box
    accent5: "C9D3E3", // lines
    accent6: "FFE6D9", // orange tint
    hlink: "1F5FA8",
    folHlink: "1F5FA8",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Native SSO in eSignet Go for Mobile Apps";
pres.author = "Team AlphaQ";
pres.subject = "MOSIP Decode 2026 - Problem statement 03";
const C = pres.SchemeColor;

const FOOT = "MOSIP Decode 2026 · PS03 · Native SSO in eSignet (Go) · Team AlphaQ";

pres.defineSlideMaster({
  title: "DARK",
  background: { color: C.text1 },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9, h: 0.65, fontSize: 28, bold: true, color: C.text1, margin: 0, valign: "middle", align: "left" }, text: "" } },
    { text: { text: FOOT, options: { x: 0.5, y: 5.18, w: 7.5, h: 0.3, fontSize: 9, color: C.text2, margin: 0, isTextBox: true, objectName: "footer" } } },
  ],
  slideNumber: { x: 9.1, y: 5.18, w: 0.4, h: 0.3, fontSize: 9, color: C.text2, align: "right" },
});

// ---------- helpers ----------
function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: opts.fill || C.background2 },
    line: { color: opts.line || C.accent5, width: 0.75 },
    shadow: opts.shadow ? { type: "outer", color: "000000", blur: 4, offset: 1, angle: 90, opacity: 0.12 } : undefined,
    objectName: opts.name || "card",
  });
}
function circle(slide, x, y, d, label, color) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 }, objectName: "badge " + label });
  slide.addText(String(label), { x, y, w: d, h: d, fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "badge text " + label });
}
function text(slide, t, o) {
  slide.addText(t, Object.assign({ fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: "top" }, o));
}
function bullets(slide, items, o) {
  const runs = items.map((t, i) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: o.gap || 5 } }));
  slide.addText(runs, Object.assign({ fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: "top" }, o));
}
function arrow(slide, x1, y1, x2, y2, color) {
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  slide.addShape(pres.ShapeType.line, {
    x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: color || C.accent4, width: 1.5, endArrowType: "triangle" },
    objectName: "arrow",
  });
}
function box(slide, x, y, w, h, head, sub, fill) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: "box " + head });
  slide.addText([
    { text: head, options: { bold: true, fontSize: 12, breakLine: true } },
    { text: sub, options: { fontSize: 9.5 } },
  ], { x: x + 0.08, y, w: w - 0.16, h, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "box text " + head });
}
function phone(slide, file, x, y, h, name) {
  const w = h * (1080 / 2412);
  slide.addShape(pres.ShapeType.roundRect, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, rectRadius: 0.12, fill: { color: C.text1 }, line: { color: C.text1, width: 0 }, objectName: "phone frame " + name });
  slide.addImage({ path: IMG + file, x, y, w, h, objectName: name });
  return w;
}

// ---------- 1. title ----------
pres.addSection({ title: "Opening" });
{
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Opening" });
  text(s, "MOSIP DECODE 2026 · PROBLEM STATEMENT 03", { x: 0.6, y: 0.75, w: 6, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 1 });
  s.addText("One login, every app.", { x: 0.6, y: 1.2, w: 6.3, h: 1.0, fontSize: 44, bold: true, color: C.background1, fontFace: "Cambria", margin: 0, isTextBox: true, objectName: "deck title" });
  text(s, "OpenID Connect Native SSO for Mobile Apps, implemented in eSignet (Go) and the ThunderID engine, with an Android SDK and two reference apps.", { x: 0.6, y: 2.35, w: 5.6, h: 1.0, fontSize: 16, color: C.accent5 });
  text(s, "Team AlphaQ", { x: 0.6, y: 4.3, w: 4, h: 0.35, fontSize: 16, bold: true, color: C.background1 });
  text(s, "eSignet | Enable Native SSO in eSignet Go for Mobile Apps", { x: 0.6, y: 4.65, w: 6, h: 0.3, fontSize: 11, color: C.accent5 });
  // motif: one login feeding three apps
  const bx = 7.2, by = 1.25;
  s.addShape(pres.ShapeType.roundRect, { x: bx, y: by + 1.1, w: 1.0, h: 1.0, rectRadius: 0.15, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: "login badge" });
  s.addText("1\nlogin", { x: bx, y: by + 1.1, w: 1.0, h: 1.0, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "login badge text" });
  const apps = ["Wallet", "Health", "Tax"], cols = [C.accent2, C.accent3, C.accent4];
  apps.forEach((a, i) => {
    const y = by + i * 1.1;
    arrow(s, bx + 1.0, by + 1.6, bx + 1.6, y + 0.5, C.accent5);
    s.addShape(pres.ShapeType.roundRect, { x: bx + 1.6, y, w: 1.3, h: 1.0, rectRadius: 0.15, fill: { color: cols[i] }, line: { color: cols[i], width: 0 }, objectName: "app " + a });
    s.addText(a, { x: bx + 1.6, y, w: 1.3, h: 1.0, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "app text " + a });
  });
  s.addNotes("Title slide. One login, every app: a citizen signs in once in the vendor's super app and every sibling app on the phone reuses that login without a browser, an OTP or a consent screen.");
}

// ---------- 2. problem ----------
pres.addSection({ title: "Problem and approach" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and approach" });
  s.addText("Native apps do not share a login", { placeholder: "title" });
  text(s, "A citizen with a wallet, a health app and a tax app from the same vendor authenticates three times: UIN, OTP and consent in every app, on the same phone. Browser cookies never reach a native app's sandbox, so the usual web SSO does not help.", { x: 0.5, y: 1.15, w: 5.5, h: 1.25, fontSize: 14 });
  const stats = [["3×", "OTP + consent today, for three apps"], ["0", "shared sessions between native apps"], ["1", "trusted login is all that is needed"]];
  stats.forEach(([n, l], i) => {
    const x = 0.5 + i * 1.9;
    card(s, x, 2.65, 1.7, 1.95);
    text(s, n, { x: x + 0.15, y: 2.75, w: 1.4, h: 0.8, fontSize: 36, bold: true, color: C.accent1, fontFace: "Cambria" });
    text(s, l, { x: x + 0.15, y: 3.6, w: 1.45, h: 0.9, fontSize: 11, color: C.text2 });
  });
  card(s, 6.3, 1.15, 3.2, 3.45, { fill: C.text1, line: C.text1 });
  text(s, "What the spec asks for", { x: 6.55, y: 1.35, w: 2.8, h: 0.35, fontSize: 14, bold: true, color: C.background1 });
  bullets(s, [
    "A deliberately designed, cryptographically secured hand-off of authentication state between apps on one device",
    "No shared cookie, no repeated login, no silent widening of consent",
    "Standards: OIDC Native SSO 1.0, RFC 8693 token exchange, RFC 9449 DPoP, FAPI 2.0",
  ], { x: 6.55, y: 1.8, w: 2.8, h: 2.7, fontSize: 11.5, color: C.accent5, gap: 8 });
  s.addNotes("Why native SSO is a real problem for national ID programmes: every app of the same vendor re-runs UIN, OTP and consent.");
}

// ---------- 3. three moves ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and approach" });
  s.addText("The solution in three moves", { placeholder: "title" });
  const moves = [
    ["Super app logs in once", "PAR + PKCE + DPoP with a hardware key (Key A) and the new device_sso scope. eSignet returns an access_token, an id_token and a device_secret.", C.accent2],
    ["The secret stays bound", "The device secret is a signed-then-encrypted JWT carrying cnf.jkt = Key A, sid, scope and the consented claims. The id_token carries ds_hash and the same sid.", C.accent1],
    ["Child app signs in silently", "Over a signature-protected IPC it receives id_token + device_secret + a DPoP proof signed by Key A, and exchanges them (RFC 8693) for its own token.", C.accent3],
  ];
  moves.forEach(([h, b, col], i) => {
    const x = 0.5 + i * 3.05;
    card(s, x, 1.15, 2.9, 2.95);
    circle(s, x + 0.2, 1.35, 0.42, i + 1, col);
    text(s, h, { x: x + 0.2, y: 1.9, w: 2.5, h: 0.4, fontSize: 15, bold: true });
    text(s, b, { x: x + 0.2, y: 2.35, w: 2.5, h: 1.65, fontSize: 12, color: C.text2 });
  });
  card(s, 0.5, 4.3, 9.0, 0.6, { fill: C.accent6, line: C.accent6 });
  text(s, "Result: the child app gets its own DPoP-bound token with no browser, no OTP and no consent screen, and nothing the user did not consent to.", { x: 0.7, y: 4.3, w: 8.6, h: 0.6, fontSize: 12.5, bold: true, valign: "middle" });
  s.addNotes("Three moves: super app logs in once with device_sso; the device secret is cryptographically bound; the child app exchanges it silently.");
}

// ---------- 4. architecture ----------
pres.addSection({ title: "How it works" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "How it works" });
  s.addText("Architecture: who does what", { placeholder: "title" });
  // group backgrounds
  s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 1.15, w: 2.6, h: 3.8, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.accent5, width: 0.75 }, objectName: "phone group" });
  s.addShape(pres.ShapeType.roundRect, { x: 3.5, y: 1.15, w: 6.0, h: 3.8, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.accent5, width: 0.75 }, objectName: "server group" });
  text(s, "PHONE (one vendor certificate)", { x: 0.65, y: 1.25, w: 2.4, h: 0.25, fontSize: 9, bold: true, color: C.text2, charSpacing: 0.5 });
  text(s, "eSIGNET (GO) + THUNDERID ENGINE", { x: 3.65, y: 1.25, w: 4, h: 0.25, fontSize: 9, bold: true, color: C.text2, charSpacing: 0.5 });
  box(s, 0.7, 1.65, 2.2, 0.9, "Vendor Wallet", "super app · Key A in the Keystore", C.accent2);
  box(s, 0.7, 3.8, 2.2, 0.9, "Vendor Health", "child app · no key of its own", C.accent3);
  arrow(s, 1.8, 3.8, 1.8, 2.55, C.accent4);
  text(s, "IPC: id_token, device_secret,\nDPoP proofs (signature permission)", { x: 0.75, y: 2.75, w: 2.2, h: 0.8, fontSize: 8.5, color: C.text2, align: "center", valign: "middle" });
  box(s, 3.75, 1.65, 2.65, 1.1, "ThunderID engine", "authorization-code grant · token exchange\nds_hash · sid · cnf.jkt · scope ⊆ grant", C.text1);
  box(s, 6.65, 1.65, 2.65, 1.1, "DeviceSecretProvider", "eSignet · generate / validate\nvendor family · derived consent", C.accent1);
  box(s, 3.75, 3.6, 2.65, 1.1, "Keymanager", "sign (OIDC key) + encrypt\n(DEVICE_SECRET_ENC)", C.accent4);
  box(s, 6.65, 3.6, 2.65, 1.1, "Consent store", "consent_detail + history\n(derived-consent audit)", C.accent4);
  arrow(s, 2.9, 1.95, 3.75, 1.95, C.accent4); // wallet -> engine
  s.addShape(pres.ShapeType.line, { x: 2.9, y: 4.25, w: 0.5, h: 0, line: { color: C.accent4, width: 1.5 }, objectName: "health link 1" });
  s.addShape(pres.ShapeType.line, { x: 3.4, y: 2.45, w: 0, h: 1.8, line: { color: C.accent4, width: 1.5 }, objectName: "health link 2" });
  arrow(s, 3.4, 2.45, 3.75, 2.45, C.accent4); // health -> engine
  arrow(s, 6.4, 2.2, 6.65, 2.2, C.accent4); // engine -> provider
  s.addShape(pres.ShapeType.line, { x: 7.97, y: 2.75, w: 0, h: 0.45, line: { color: C.accent4, width: 1.5 }, objectName: "provider link 1" });
  s.addShape(pres.ShapeType.line, { x: 5.07, y: 3.2, w: 2.9, h: 0, line: { color: C.accent4, width: 1.5 }, objectName: "provider link 2" });
  arrow(s, 5.07, 3.2, 5.07, 3.6, C.accent4); // provider -> keymanager
  arrow(s, 7.97, 3.2, 7.97, 3.6, C.accent4); // provider -> consent store
  s.addNotes("Phone side: Wallet holds Key A and exposes a ContentProvider; Health never holds a key. Server side: the ThunderID engine enforces the grant rules, eSignet's DeviceSecretProvider mints and validates the secret through the keymanager and records derived consent.");
}

// ---------- 5. flow 1 ----------
function flowSlide(title, steps, rightBuilder, notes, stepW = 5.0) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "How it works" });
  s.addText(title, { placeholder: "title" });
  const n = steps.length, top = 1.15, bottom = 4.95, rowH = (bottom - top) / n;
  steps.forEach(([t, col], i) => {
    const y = top + i * rowH;
    circle(s, 0.5, y + 0.08, 0.38, i + 1, col || C.accent2);
    text(s, t, { x: 1.05, y, w: stepW, h: rowH, fontSize: 11.5, valign: "top" });
  });
  rightBuilder(s);
  s.addNotes(notes);
  return s;
}
flowSlide("Flow 1: super app login with device_sso", [
  ["POST /oauth2/par with scope=openid profile email device_sso, dpop_jkt = thumbprint(Key A), PKCE and a PS256 private_key_jwt"],
  ["Custom Tab: eSignet OTP login and consent; the user chooses which claims to release"],
  ["POST /oauth2/token (authorization_code) with a DPoP proof signed by Key A"],
  ["The engine checks that the client is registered for device_sso and calls GenerateDeviceSecret(sub, auth_id, sid, client_id, scope, acr, claims, cnf.jkt)", C.accent1],
  ["eSignet signs the claims and encrypts the JWS to its component encryption key: an opaque device_secret", C.accent1],
  ["Response: access_token (cnf.jkt), id_token (ds_hash, sid) and device_secret, stored encrypted in the app", C.accent1],
], (s) => {
  card(s, 6.4, 1.15, 3.1, 3.8, { fill: C.text1, line: C.text1 });
  text(s, "id_token gains", { x: 6.6, y: 1.3, w: 2.7, h: 0.3, fontSize: 12, bold: true, color: C.background1 });
  s.addText([
    { text: "ds_hash", options: { bold: true, color: C.accent1, breakLine: true } },
    { text: "BASE64URL(SHA-256(device_secret))", options: { breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "sid", options: { bold: true, color: C.accent1, breakLine: true } },
    { text: "shared with the device secret" },
  ], { x: 6.6, y: 1.65, w: 2.7, h: 1.3, fontSize: 10.5, color: C.accent5, margin: 0, isTextBox: true, valign: "top", objectName: "id token claims" });
  text(s, "device_secret carries", { x: 6.6, y: 3.05, w: 2.7, h: 0.3, fontSize: 12, bold: true, color: C.background1 });
  text(s, "iss · sub · auth_id · sid · client_id · scope · acr · claims · cnf.jkt · iat · exp · jti", { x: 6.6, y: 3.4, w: 2.7, h: 1.4, fontSize: 10.5, color: C.accent5 });
}, "Flow 1 is a standard FAPI 2.0 authorization-code login plus the device_sso scope. Steps 4 to 6 are the new engine and provider work.");

// ---------- 6. flow 2 ----------
flowSlide("Flow 2: child app silent sign-in", [
  ["The child asks the super app over a ContentProvider behind a signature-level permission for its id_token, device_secret and a DPoP proof for POST /oauth2/token", C.accent3],
  ["The super app re-checks the caller's signing certificate and signs the proof with Key A; the key never leaves the Wallet", C.accent3],
  ["POST /oauth2/token with grant_type=token-exchange, subject_token=id_token, actor_token=device_secret, scope=openid profile email"],
  ["Engine: client enabled · secret decrypted and verified · ds_hash · sid · sub · cnf.jkt = DPoP key · vendor family · scope ⊆ grant · consent", C.accent1],
  ["Response: a DPoP-bound access_token with act.sub = super app; userinfo returns the consented claims", C.accent1],
], (s) => {
  const w = phone(s, "health-signed-in-silently.png", 5.85, 1.3, 3.4, "Vendor Health signed in silently");
  const tx = 5.85 + w + 0.35, tw = 9.5 - tx;
  text(s, "Seen on the phone", { x: tx, y: 1.3, w: tw, h: 0.3, fontSize: 12.5, bold: true });
  text(s, "Under a quarter of a second. No browser, no OTP, no consent screen.", { x: tx, y: 1.7, w: tw, h: 1.1, fontSize: 11.5, color: C.text2 });
  text(s, "act.sub = mosip-super-app", { x: tx, y: 2.9, w: tw, h: 0.3, fontSize: 11, color: C.accent2, bold: true });
  text(s, "cnf.jkt = Key A", { x: tx, y: 3.2, w: tw, h: 0.3, fontSize: 11, color: C.accent2, bold: true });
}, "Flow 2 is RFC 8693 token exchange with the device secret as actor token. The child app never touches Key A; the Wallet signs its DPoP proofs.", 4.45);

// ---------- 7. six bindings ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "How it works" });
  s.addText("Six bindings make the hand-off safe", { placeholder: "title" });
  const items = [
    ["ds_hash", "The id_token names exactly one device secret. Swap either and the exchange fails."],
    ["sid", "Both tokens descend from the same authentication (the session id, or the authorization id)."],
    ["cnf.jkt = DPoP key", "Only a proof from Key A redeems the secret; a stolen pair is useless without the hardware key."],
    ["Vendor family", "Same relying party or an allow-listed sibling, registered for device_sso. Others get invalid_grant."],
    ["Scope ⊆ grant", "The child never exceeds what the super app was granted; device_sso itself is never exchangeable."],
    ["Derived consent", "Only claims the user accepted for the super app are released; anything else is interaction_required."],
  ];
  items.forEach(([h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * 3.05, y = 1.15 + row * 1.95;
    card(s, x, y, 2.9, 1.75);
    circle(s, x + 0.2, y + 0.2, 0.36, i + 1, row === 0 ? C.accent2 : C.accent1);
    text(s, h, { x: x + 0.7, y: y + 0.2, w: 2.1, h: 0.36, fontSize: 14, bold: true, valign: "middle" });
    text(s, b, { x: x + 0.2, y: y + 0.7, w: 2.5, h: 1.0, fontSize: 11.5, color: C.text2 });
  });
  s.addNotes("Each binding is enforced in the engine and covered by a negative end-to-end test.");
}

// ---------- 8. bonus ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "How it works" });
  s.addText("Bonus: re-consent instead of over-sharing", { placeholder: "title" });
  text(s, "The super app's consent is reused, never widened. eSignet compares the child's requested claims with what the user accepted and either derives a consent record for the child (with an audit row) or refuses the silent path.", { x: 0.5, y: 1.1, w: 9, h: 0.75, fontSize: 13 });
  const rows = [
    ["Child requests\nopenid email", "email was declined\nat the super app's consent", "interaction_required\n\"claims not consented: email\"", C.accent1],
    ["Child requests\nopenid profile", "name was accepted\nat the super app's consent", "Silent sign-in; consent recorded\nfor the child app + history row", C.accent3],
  ];
  rows.forEach(([a, b, c, col], i) => {
    const y = 2.1 + i * 1.1;
    box(s, 0.5, y, 2.4, 0.85, a.split("\n")[0], a.split("\n")[1], C.accent2);
    arrow(s, 2.9, y + 0.42, 3.4, y + 0.42, C.accent4);
    box(s, 3.4, y, 2.9, 0.85, b.split("\n")[0], b.split("\n")[1], C.accent4);
    arrow(s, 6.3, y + 0.42, 6.8, y + 0.42, C.accent4);
    box(s, 6.8, y, 2.7, 0.85, c.split("\n")[0], c.split("\n")[1], col);
  });
  card(s, 0.5, 4.4, 9.0, 0.55, { fill: C.accent6, line: C.accent6 });
  text(s, "On interaction_required (or invalid_scope) the child app explains why in plain language and opens the eSignet consent flow for its own client.", { x: 0.7, y: 4.4, w: 8.6, h: 0.55, fontSize: 11.5, valign: "middle" });
  s.addNotes("The bonus task: when the child needs a claim the user declined for the super app, the silent path is refused and the child falls back to an interactive consent for its own client.");
}

// ---------- 9. task table ----------
pres.addSection({ title: "Delivery" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Delivery" });
  s.addText("Every mandatory task, plus the bonus", { placeholder: "title" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 }, fontSize: 11 } });
  const cell = (t, o) => ({ text: t, options: Object.assign({ fontSize: 10.5, color: C.text1 }, o || {}) });
  const done = () => cell("done", { bold: true, color: C.accent3 });
  const rows = [
    [hdr("#"), hdr("Task"), hdr("Where"), hdr("Status")],
    [cell("1"), cell("device_sso scope on the authorize request"), cell("eSignet config · ThunderID protocol scope"), done()],
    [cell("2"), cell("Token endpoint validates the scope for the client"), cell("ThunderID auth-code grant · eSignet provider"), done()],
    [cell("3–4"), cell("DeviceSecretProvider interface; generate / validate"), cell("ThunderID providers · eSignet keymanager (JWS + JWE)"), done()],
    [cell("5–6"), cell("Token endpoint issues and returns the device secret"), cell("ThunderID auth-code grant · token response"), done()],
    [cell("7–8"), cell("Child app fetches credentials over IPC and calls token exchange with a Key A DPoP proof"), cell("Android SDK + apps"), done()],
    [cell("9"), cell("Token exchange: device-secret actor, ds_hash, sid, client enablement, cnf.jkt"), cell("ThunderID token exchange"), done()],
    [cell("10a / 10b"), cell("Child scope ⊆ super scope; device_sso refused on exchange"), cell("ThunderID"), done()],
    [cell("Bonus"), cell("Re-consent in the child app"), cell("ThunderID + eSignet consent + apps"), done()],
  ];
  s.addTable(rows, { x: 0.5, y: 1.15, w: 9.0, colW: [0.9, 4.2, 3.1, 0.8], rowH: 0.4, border: { type: "solid", color: THEME.colors.accent5, pt: 0.5 }, fill: { color: THEME.colors.lt1 }, valign: "middle", margin: 0.06, objectName: "task table" });
  s.addNotes("The ten tasks of the problem statement and the bonus, with where each lives.");
}

// ---------- 10. proof ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Delivery" });
  s.addText("What we built and how we proved it", { placeholder: "title" });
  const stats = [
    ["2", "upstream pull requests", "thunder-id/thunderid and mosip/esignet develop-go, both DCO signed-off"],
    ["35/35", "end-to-end checks", "against a live eSignet, including every negative case and the re-consent path"],
    ["50+", "new unit tests", "across the ThunderID engine and the eSignet provider; SDK tests run in CI"],
    ["3", "Android modules", "nativesso-sdk, Vendor Wallet, Vendor Health, one vendor certificate"],
  ];
  stats.forEach(([n, l, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.15 + row * 1.6;
    card(s, x, y, 4.4, 1.45);
    text(s, n, { x: x + 0.25, y: y + 0.15, w: 1.6, h: 1.15, fontSize: 40, bold: true, color: C.accent1, fontFace: "Cambria", valign: "middle" });
    text(s, l, { x: x + 1.95, y: y + 0.25, w: 2.3, h: 0.35, fontSize: 14, bold: true });
    text(s, d, { x: x + 1.95, y: y + 0.65, w: 2.3, h: 0.75, fontSize: 11, color: C.text2 });
  });
  card(s, 0.5, 4.4, 9.0, 0.55, { fill: C.background2 });
  text(s, "Also: Postman collection (20 requests), design and API documentation, OpenAPI update, configuration reference, one-command docker compose stack, demo video.", { x: 0.7, y: 4.4, w: 8.6, h: 0.55, fontSize: 11.5, valign: "middle" });
  s.addNotes("Evidence: two upstream PRs, 35 end-to-end checks, 50+ unit tests, three Android modules, plus the documentation set.");
}

// ---------- 11. apps ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Delivery" });
  s.addText("Reference apps and SDK for relying parties", { placeholder: "title" });
  const w1 = phone(s, "wallet-signed-in.png", 0.55, 1.2, 3.65, "Vendor Wallet signed in");
  const w2 = phone(s, "health-signed-in-silently.png", 0.55 + w1 + 0.3, 1.2, 3.65, "Vendor Health signed in silently");
  const tx = 0.55 + w1 + w2 + 0.75;
  bullets(s, [
    "nativesso-sdk: PAR/PKCE/DPoP client, Key A in the Android Keystore (StrongBox preferred), PS256 private_key_jwt, ID-token verification, encrypted session store, IPC contract",
    "Vendor Wallet exports a ContentProvider behind a signature-level permission and re-checks the caller's certificate on every call",
    "Vendor Health never holds a key: every DPoP proof is signed by the Wallet, so its token is bound to the same hardware key",
    "On-screen details for the demo: sid, ds_hash, SHA-256 of the stored secret, act.sub, cnf.jkt",
    "Fallback to interactive consent when eSignet answers interaction_required or invalid_scope",
  ], { x: tx, y: 1.2, w: 9.5 - tx, h: 3.7, fontSize: 11.5, gap: 7 });
  s.addNotes("The SDK and the two apps are a template for relying parties: everything a vendor needs to adopt native SSO is in the SDK.");
}

// ---------- 12. upstream & next ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Delivery" });
  s.addText("Upstream path and what comes next", { placeholder: "title" });
  card(s, 0.5, 1.15, 4.4, 3.15);
  text(s, "Upstream contributions", { x: 0.75, y: 1.3, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.accent1 });
  bullets(s, [
    "thunder-id/thunderid: provider contracts, device-secret issuance, token exchange with device-secret actor tokens, consent hook",
    "mosip/esignet develop-go: DeviceSecretProvider, derived consent, token_exchange clients, config, docs, Postman collection",
    "Plus an eSignet community fix: #2555 (unrecognised consent purposeName)",
  ], { x: 0.75, y: 1.75, w: 3.95, h: 2.45, fontSize: 12.5, gap: 10 });
  card(s, 5.1, 1.15, 4.4, 3.15);
  text(s, "Natural follow-ups", { x: 5.35, y: 1.3, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.accent2 });
  bullets(s, [
    "Revoke a device-secret family on super-app sign-out (jti is signed and available)",
    "Single-use jti tracking where a deployment wants it",
    "A consent-screen line item explaining device_sso to the citizen",
    "iOS reference app (App Groups + Keychain access groups)",
    "MOSIP IDA: encrypted KYC stays opaque; sibling apps share the relying-party decryption key",
  ], { x: 5.35, y: 1.75, w: 3.95, h: 2.45, fontSize: 12.5, gap: 7 });
  card(s, 0.5, 4.45, 9.0, 0.5, { fill: C.accent6, line: C.accent6 });
  text(s, "Both branches are DCO signed-off and rebased on the current upstream bases (thunderid main, esignet develop-go).", { x: 0.7, y: 4.45, w: 8.6, h: 0.5, fontSize: 11.5, valign: "middle" });
  s.addNotes("Where the work goes upstream and what a production deployment would add next.");
}

// ---------- 13. closing ----------
pres.addSection({ title: "Closing" });
{
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Closing" });
  text(s, "THANK YOU", { x: 0.6, y: 0.75, w: 6, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 1 });
  s.addText("One trusted login, reused securely across every app in the family.", { x: 0.6, y: 1.2, w: 8.6, h: 1.6, fontSize: 36, bold: true, color: C.background1, fontFace: "Cambria", margin: 0, isTextBox: true, valign: "top", objectName: "closing title" });
  text(s, "Code, tests, Postman collection, documentation and the demo video are in the submission repository.", { x: 0.6, y: 3.1, w: 8.4, h: 0.6, fontSize: 15, color: C.accent5 });
  text(s, "Try it in ten minutes", { x: 0.6, y: 3.75, w: 4, h: 0.3, fontSize: 13, bold: true, color: C.background1 });
  s.addText("scripts/fetch-backends.sh\ndocker compose -f deploy/docker-compose.yml up\npython3 tests/native_sso_e2e.py", { x: 0.6, y: 4.05, w: 6, h: 0.75, fontSize: 11, fontFace: "Courier New", color: C.accent5, margin: 0, isTextBox: true, valign: "top", objectName: "try it commands" });
  text(s, "Team AlphaQ · MOSIP Decode 2026 · Problem statement 03", { x: 0.6, y: 4.95, w: 8, h: 0.3, fontSize: 11, color: C.accent5 });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
