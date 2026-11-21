const admin = require("firebase-admin");

const OWNER_EMAIL = "kaboo7766@gmail.com";

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: "kab-cut" });
  return admin.app();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const app = getAdminApp();
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "سجّل الدخول أولاً." });

    const decoded = await app.auth().verifyIdToken(token, true);
    const email = String(decoded.email || "").toLowerCase();
    const body = req.body || {};
    const action = String(body.action || "access");

    if (action === "bootstrap") {
      if (email !== OWNER_EMAIL || decoded.email_verified !== true) {
        return res.status(403).json({ error: "هذا البريد غير مخوّل بإنشاء حساب المالك." });
      }
      const ref = app.firestore().collection("admins").doc(decoded.uid);
      const existing = await ref.get();
      if (!existing.exists) {
        const admins = await app.firestore().collection("admins").limit(1).get();
        if (!admins.empty) return res.status(403).json({ error: "تم تعيين مالك بالفعل." });
        await ref.create({ email: OWNER_EMAIL, role: "owner", createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      return res.status(200).json({ ok: true, role: "owner" });
    }

    const ownerDoc = await app.firestore().collection("admins").doc(decoded.uid).get();
    const isOwner = email === OWNER_EMAIL && decoded.email_verified === true && ownerDoc.exists;
    if (action === "access") {
      if (isOwner) return res.status(200).json({ ok: true, role: "owner" });
      const userDoc = await app.firestore().collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data().status !== "active") {
        await app.auth().revokeRefreshTokens(decoded.uid).catch(() => {});
        return res.status(403).json({ error: "حسابك غير مضاف أو تم إيقافه. تواصل مع مدير KAB CUT." });
      }
      return res.status(200).json({ ok: true, role: userDoc.data().role || "editor" });
    }
    if (!isOwner) return res.status(403).json({ error: "هذه العملية متاحة للمالك فقط." });

    if (action === "list") {
      const snap = await app.firestore().collection("users").orderBy("createdAt", "desc").limit(200).get();
      return res.status(200).json({ users: snap.docs.map(d => ({ uid: d.id, ...d.data() })) });
    }

    if (action === "create") {
      const newEmail = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.displayName || "").trim().slice(0, 80);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return res.status(400).json({ error: "اكتب بريداً إلكترونياً صحيحاً." });
      if (newEmail === OWNER_EMAIL) return res.status(400).json({ error: "هذا البريد مخصص للمالك." });
      if (password.length < 8) return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف." });
      const user = await app.auth().createUser({ email: newEmail, password, displayName, disabled: false });
      await app.firestore().collection("users").doc(user.uid).set({
        email: newEmail, displayName, role: "editor", status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: decoded.uid
      });
      return res.status(201).json({ ok: true, uid: user.uid, email: newEmail });
    }

    if (action === "setStatus") {
      const uid = String(body.uid || "");
      const status = body.status === "active" ? "active" : "disabled";
      if (!uid || uid === decoded.uid) return res.status(400).json({ error: "معرّف الحساب غير صالح." });
      const ref = app.firestore().collection("users").doc(uid);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "المستخدم غير موجود." });
      await ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await app.auth().updateUser(uid, { disabled: status !== "active" });
      if (status !== "active") await app.auth().revokeRefreshTokens(uid);
      return res.status(200).json({ ok: true, status });
    }

    if (action === "delete") {
      const uid = String(body.uid || "");
      if (!uid || uid === decoded.uid) return res.status(400).json({ error: "لا يمكن حذف هذا الحساب." });
      await app.firestore().collection("users").doc(uid).delete();
      await app.auth().deleteUser(uid);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "طلب غير معروف." });
  } catch (error) {
    console.error("KAB CUT admin API:", error);
    return res.status(500).json({ error: "تعذر تنفيذ العملية. راجع إعدادات Firebase وVercel." });
  }
};
