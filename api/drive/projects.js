const admin = require("firebase-admin");
const crypto = require("crypto");

function app() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "kab-cut" });
  return admin.app();
}
function decrypt(value) {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY || "";
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Invalid DRIVE_TOKEN_ENCRYPTION_KEY");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8");
}
async function driveToken(uid) {
  const ref = app().firestore().collection("users").doc(uid).collection("private").doc("drive");
  const snap = await ref.get();
  if (!snap.exists || !snap.data().refreshTokenEncrypted) throw new Error("اربط Google Drive بحسابك أولاً.");
  const refreshToken = decrypt(snap.data().refreshTokenEncrypted);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("تعذر تجديد اتصال Google Drive. أعد ربط الحساب.");
  return { accessToken: data.access_token, googleEmail: snap.data().googleEmail };
}
async function driveApi(token, url, options={}) {
  const response = await fetch(url, { ...options, headers: { Authorization: "Bearer " + token, ...(options.headers || {}) } });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "Google Drive API error";
    throw new Error(message);
  }
  return data;
}
async function folderId(token) {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='KAB CUT Projects' and trashed=false");
  const found = await driveApi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&pageSize=10");
  if (found.files && found.files.length) return found.files[0].id;
  const folder = await driveApi(token, "https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "KAB CUT Projects", mimeType: "application/vnd.google-apps.folder" })
  });
  return folder.id;
}
async function findOwnedProject(token, folder, id) {
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(id || ""))) throw new Error("معرّف المشروع غير صالح.");
  const q = encodeURIComponent("'" + folder + "' in parents and trashed=false and mimeType='application/json'");
  const data = await driveApi(token, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=100");
  const file = (data.files || []).find(x => x.id === id);
  if (!file) throw new Error("المشروع غير موجود داخل مساحة Drive الخاصة بهذا الحساب.");
  return file;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!bearer) return res.status(401).json({ error: "سجّل الدخول أولاً." });
    const decoded = await app().auth().verifyIdToken(bearer, true);
    if (decoded.email_verified !== true) return res.status(403).json({ error: "يجب تأكيد بريد حسابك قبل استخدام مساحة Drive." });
    const userDoc = await app().firestore().collection("users").doc(decoded.uid).get();
    const isOwner = String(decoded.email || "").toLowerCase() === "kaboo7766@gmail.com";
    if (!isOwner && (!userDoc.exists || userDoc.data().status !== "active")) return res.status(403).json({ error: "الحساب غير نشط أو غير مصرح له." });
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.DRIVE_TOKEN_ENCRYPTION_KEY) return res.status(503).json({ error: "إعدادات Google Drive غير مكتملة في Vercel." });
    const { accessToken, googleEmail } = await driveToken(decoded.uid);
    const body = req.body || {};
    const action = String(body.action || "list");
    const folder = await folderId(accessToken);
    if (action === "status") return res.status(200).json({ connected: true, googleEmail });
    if (action === "list") {
      const q = encodeURIComponent("'" + folder + "' in parents and trashed=false and mimeType='application/json'");
      const data = await driveApi(accessToken, "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=100");
      return res.status(200).json({ projects: data.files || [], googleEmail });
    }
    if (action === "create" || action === "save") {
      const project = body.project;
      if (!project || typeof project !== "object" || Array.isArray(project)) return res.status(400).json({ error: "بيانات المشروع غير صالحة." });
      const serialized = JSON.stringify(project);
      if (Buffer.byteLength(serialized, "utf8") > 3500000) return res.status(413).json({ error: "حجم بيانات المشروع كبير. ارفع الوسائط كملفات منفصلة أولاً." });
      const name = String(body.name || project.name || "مشروع KAB CUT").slice(0, 100) + ".kabcut.json";
      let id = "";
      if (action === "save" && body.fileId) id = (await findOwnedProject(accessToken, folder, body.fileId)).id;
      const metadata = { name, mimeType: "application/json", ...(id ? {} : { parents: [folder] }) };
      const boundary = "kabcut_" + crypto.randomBytes(12).toString("hex");
      const multipart = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + serialized + "\r\n--" + boundary + "--";
      const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime" + (id ? "&" + new URLSearchParams({ uploadType: "multipart" }).toString() : "");
      const result = await driveApi(accessToken, id ? "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(id) + "?uploadType=multipart&fields=id,name,modifiedTime" : url, {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: multipart
      });
      return res.status(200).json({ ok: true, project: result });
    }
    if (action === "load") {
      const file = await findOwnedProject(accessToken, folder, body.fileId);
      const data = await driveApi(accessToken, "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media");
      return res.status(200).json({ project: data, file });
    }
    if (action === "delete") {
      const file = await findOwnedProject(accessToken, folder, body.fileId);
      await driveApi(accessToken, "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id), { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "عملية غير معروفة." });
  } catch (error) {
    console.error("KAB CUT private Drive API:", error);
    return res.status(500).json({ error: error.message || "تعذر تنفيذ طلب Google Drive." });
  }
};
