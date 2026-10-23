#!/usr/bin/env node
/**
 * Drives the Native SSO demo on a USB-connected Android phone for a screen recording.
 *
 * It taps the two reference apps through adb/uiautomator and drives the eSignet login pages
 * inside the Custom Tab through Chrome DevTools (Brave/Chrome expose it over
 * `adb forward tcp:9222 localabstract:chrome_devtools_remote`). Nothing here solves a real
 * captcha: the local stack uses a Turnstile dummy key that auto-passes.
 *
 * Usage: node tools/demo_driver.js <step...>
 *   steps: wallet-login | wallet-show | health-signin | health-show | health-reconsent | all
 * Env: SERIAL (adb serial, default FUHIYLMZUO8LAMY9), UIN (default 1774231323), OTP (default 111111)
 */
const { execSync } = require("child_process");

const SERIAL = process.env.SERIAL || "FUHIYLMZUO8LAMY9";
const UIN = process.env.UIN || "1774231323";
const OTP = process.env.OTP || "111111";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args) => execSync(`adb -s ${SERIAL} ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sh = (cmd) => execSync(cmd, { encoding: "utf8" });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Taps the centre of the first on-screen element whose text matches exactly. */
async function tapText(text, tries = 10) { return tapNode(`text="${escapeRe(text)}"`, tries, text); }
/** Taps the first on-screen element with the given resource id (survives label changes). */
async function tapId(id, tries = 10) { return tapNode(`resource-id="${escapeRe(id)}"`, tries, id); }

async function tapNode(attr, tries, label) {
  for (let i = 0; i < tries; i++) {
    adb("shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true");
    const xml = adb("shell cat /sdcard/ui.xml");
    const re = new RegExp(`${attr}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
    const m = xml.match(re);
    if (m) {
      const x = Math.round((+m[1] + +m[3]) / 2), y = Math.round((+m[2] + +m[4]) / 2);
      adb(`shell input tap ${x} ${y}`);
      return true;
    }
    await sleep(800);
  }
  throw new Error(`element not found: ${label}`);
}

function scroll(down = true) {
  adb(down ? "shell input swipe 540 1800 540 700 500" : "shell input swipe 540 700 540 1800 500");
}

// ---------- DevTools over the Custom Tab ----------
async function devtoolsTarget() {
  adb("forward tcp:9222 localabstract:chrome_devtools_remote");
  for (let i = 0; i < 20; i++) {
    try {
      const list = JSON.parse(sh("curl -s http://localhost:9222/json"));
      const page = list.find((t) => t.type === "page" && /localhost:3000/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    await sleep(1000);
  }
  throw new Error("no eSignet page in the browser");
}

async function evaluate(expression) {
  const url = await devtoolsTarget();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); reject(new Error("devtools timeout")); }, 15000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id === 1) { clearTimeout(timer); ws.close(); d.result?.exceptionDetails ? reject(new Error(JSON.stringify(d.result.exceptionDetails).slice(0, 300))) : resolve(d.result?.result?.value); }
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error("ws error")); };
  });
}

/** Waits until the page has a button whose text matches, then clicks it. */
async function webClick(textRegex, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const ok = await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(b => ${textRegex}.test(b.innerText.trim()) && !b.disabled); if (!b) return false; b.scrollIntoView({block: "center"}); b.click(); return true; })()`).catch(() => false);
    if (ok) return;
    await sleep(1000);
  }
  throw new Error(`web button not found/enabled: ${textRegex}`);
}

/** Sets a React-controlled input's value and fires the input event. */
async function webType(selector, value) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  if (!ok) throw new Error(`input not found: ${selector}`);
}

async function webTypeOtp(code) {
  for (let i = 0; i < 20; i++) {
    const n = await evaluate(`document.querySelectorAll('input[maxlength="1"]').length`).catch(() => 0);
    if (n >= code.length) break;
    await sleep(1000);
  }
  // Type digit by digit so the OTP field's auto-advance behaves like a real keyboard.
  await evaluate(`(async () => { const inputs = [...document.querySelectorAll('input[maxlength="1"]')]; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; const code = ${JSON.stringify(code)}; for (let i = 0; i < code.length; i++) { const el = inputs[i]; el.focus(); setter.call(el, code[i]); el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 120)); } return inputs.length; })()`);
}

async function webButtons() {
  return evaluate(`[...document.querySelectorAll("button")].map(b => b.innerText.trim().slice(0,40) + (b.disabled ? " [disabled]" : "")).filter(Boolean).join(" | ")`);
}

// ---------- steps ----------
async function walletLogin() {
  adb("shell am force-stop com.brave.browser"); adb("shell am force-stop org.mosip.superapp");
  adb("shell am start -n org.mosip.superapp/.MainActivity >/dev/null");
  await sleep(2500);
  // Start from a signed-out Wallet: the sign-out button sits at the very bottom of the page.
  for (let i = 0; i < 3; i++) { scroll(true); await sleep(600); }
  await tapId("org.mosip.superapp:id/signOut", 2).catch(() => {});
  await sleep(800);
  for (let i = 0; i < 3; i++) { scroll(false); await sleep(600); }
  await tapId("org.mosip.superapp:id/signIn");
  await sleep(6000);
  await webClick("/^Login with OTP$/");
  await sleep(2500);
  await webType('input[placeholder*="UIN"], .thunderid-text-field__input', UIN);
  await sleep(1500);
  // Turnstile dummy key auto-passes; "Get OTP" becomes enabled when it does.
  await webClick("/^Get OTP$/", 40);
  await sleep(4000);
  await webTypeOtp(OTP);
  await sleep(1200);
  await webClick("/^(Verify|Submit)$/");
  await sleep(5000);
  console.log("buttons on consent page:", await webButtons().catch(() => "n/a"));
  await sleep(2500);
  // The consent redirect targets a custom scheme, which the browser only follows after a real user
  // gesture: tap "Allow" through the accessibility tree instead of a synthetic DOM click.
  await tapText("Allow", 15).catch(async (e) => { console.log("accessibility tap failed, DOM click:", e.message); await webClick("/^Allow$/", 10); });
  await sleep(6000);
}

async function walletShow() {
  adb("shell am start -n org.mosip.superapp/.MainActivity >/dev/null");
  await sleep(2000);
  scroll(true); await sleep(2500); scroll(true); await sleep(3000); scroll(false); await sleep(1500);
}

async function healthSignin() {
  adb("shell am start -n org.mosip.childapp/.MainActivity >/dev/null");
  await sleep(2500);
  await tapText("Sign in");
  await sleep(5000);
}

async function healthShow() {
  scroll(true); await sleep(2500); scroll(true); await sleep(3000); scroll(false); await sleep(1500);
}

async function healthReconsent() {
  adb("shell am start -n org.mosip.childapp/.MainActivity >/dev/null");
  await sleep(2500);
  for (let i = 0; i < 3; i++) { scroll(true); await sleep(600); }
  await tapId("org.mosip.childapp:id/signOut", 3).catch(() => {});
  await sleep(800);
  for (let i = 0; i < 3; i++) { scroll(false); await sleep(600); }
  await tapText("Sign in with extra claims (phone)");
  await sleep(4000);
  await tapText("Continue");
  await sleep(7000);
  // The embedded engine has no browser session, so the re-consent is a full login for the Health
  // client followed by its own consent screen (which now lists the phone number).
  await webClick("/^Login with OTP$/");
  await sleep(2500);
  await webType('input[placeholder*="UIN"], .thunderid-text-field__input', UIN);
  await sleep(1500);
  await webClick("/^Get OTP$/", 40);
  await sleep(4000);
  await webTypeOtp(OTP);
  await sleep(1200);
  await webClick("/^(Verify|Submit)$/");
  await sleep(5000);
  console.log("buttons on consent page:", await webButtons().catch(() => "n/a"));
  await sleep(2500);
  await tapText("Allow", 15).catch(async () => { await webClick("/^Allow$/", 10); });
  await sleep(7000);
  scroll(true); await sleep(2500); scroll(false); await sleep(1500);
}

const steps = { "wallet-login": walletLogin, "wallet-show": walletShow, "health-signin": healthSignin, "health-show": healthShow, "health-reconsent": healthReconsent };
(async () => {
  const wanted = process.argv.slice(2);
  const order = wanted.includes("all") ? Object.keys(steps) : wanted;
  for (const s of order) {
    if (!steps[s]) { console.error("unknown step", s); process.exit(2); }
    console.log(new Date().toISOString(), "step", s);
    await steps[s]();
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
