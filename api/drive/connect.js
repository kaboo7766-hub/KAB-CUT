const admin = require("firebase-admin");
const crypto = require("crypto");

function app() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "kab-cut" });
  return admin.app();
}
function b64url(value) { return Buffer.from(value).toString("base64url"); }
function sign(value) {
  const secret = process.env.DRIVE_STATE_SECRET;
  if (!secret) throw new Error("DRIVE_STATE_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "سجّل الدخول أولاً." });
    const decoded = await app().auth().verifyIdToken(token, true);
    if (decoded.email_verified !== true) return res.status(403).json({ error: "يجب تأكيد بريد حسابك قبل ربط Google Drive." });
    const userDoc = await app().firestore().collection("users").doc(decoded.uid).get();
    const owner = String(decoded.email || "").toLowerCase() === "kaboo7766@gmail.com";
    if (!owner && (!userDoc.exists || userDoc.data().status !== "active")) {
      return res.status(403).json({ error: "الحساب غير نشط أو غير مصرح له." });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri || !process.env.DRIVE_STATE_SECRET) {
      return res.status(503).json({ error: "إعدادات Google Drive OAuth غير مكتملة في Vercel." });
    }
    const payload = b64url(JSON.stringify({ uid: decoded.uid, email: String(decoded.email || "").toLowerCase(), ts: Date.now(), nonce: crypto.randomBytes(18).toString("hex") }));
    const state = payload + "." + sign(payload);
    res.setHeader("Set-Cookie", "kab_drive_state=" + state + "; HttpOnly; Secure; SameSite=Lax; Path=/api/drive/callback; Max-Age=600");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.file");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent select_account");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return res.status(200).json({ authUrl: url.toString() });
  } catch (error) {
    console.error("KAB CUT Drive connect:", error);
    return res.status(500).json({ error: "تعذر بدء ربط Google Drive." });
  }
};
