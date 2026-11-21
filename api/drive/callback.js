const admin = require("firebase-admin");
const crypto = require("crypto");

function app() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "kab-cut" });
  return admin.app();
}
function decryptKey() {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY || "";
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64-char hex)");
  return key;
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", decryptKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}
function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  const part = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
function verifyState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", process.env.DRIVE_STATE_SECRET || "").update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload.uid || !payload.ts || Date.now() - payload.ts > 10 * 60 * 1000 || payload.ts > Date.now() + 30000) return null;
    return payload;
  } catch { return null; }
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", "kab_drive_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/drive/callback; Max-Age=0");
  const fail = (code) => res.redirect("/?drive=error&reason=" + encodeURIComponent(code));
  try {
    if (req.method !== "GET") return res.status(405).send("Method not allowed");
    if (req.query.error) return fail("تم إلغاء ربط Google Drive.");
    const state = String(req.query.state || "");
    if (!state || state !== cookieValue(req, "kab_drive_state")) return fail("فشل التحقق الأمني من جلسة الربط. أعد المحاولة.");
    const payload = verifyState(state);
    if (!payload) return fail("انتهت جلسة الربط أو أن التحقق الأمني غير صالح.");
    const code = String(req.query.code || "");
    if (!code) return fail("لم يصل رمز موافقة Google.");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri || !process.env.DRIVE_TOKEN_ENCRYPTION_KEY) return fail("إعدادات Google Drive غير مكتملة في Vercel.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) { console.error("Google OAuth token exchange failed:", tokens.error); return fail("تعذر إكمال موافقة Google. راجع إعدادات OAuth."); }
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + tokens.access_token } });
    const googleUser = await userResponse.json();
    if (!userResponse.ok || !googleUser.email || googleUser.verified_email !== true) return fail("تعذر التحقق من حساب Google.");
    if (String(googleUser.email).toLowerCase() !== payload.email) return fail("يجب ربط Google Drive بنفس البريد المستخدم في تسجيل الدخول إلى KAB CUT.");
    const db = app().firestore();
    const ref = db.collection("users").doc(payload.uid).collection("private").doc("drive");
    const old = await ref.get();
    const refreshToken = tokens.refresh_token || (old.exists ? old.data().refreshTokenEncrypted : null);
    if (!refreshToken) return fail("Google لم يُرجع صلاحية الاحتفاظ بالاتصال. أعد الربط واختر الموافقة.");
    await ref.set({
      refreshTokenEncrypted: encrypt(refreshToken),
      googleEmail: String(googleUser.email).toLowerCase(),
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      scope: tokens.scope || ""
    }, { merge: true });
    return res.redirect("/?drive=connected");
  } catch (error) {
    console.error("KAB CUT Drive callback:", error);
    return fail("حدث خطأ أثناء ربط Google Drive.");
  }
};
