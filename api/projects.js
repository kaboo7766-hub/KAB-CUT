const admin = require("firebase-admin");

const OWNER_EMAIL = "kaboo7766@gmail.com";
const MAX_PROJECT_BYTES = 700 * 1024;

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "kab-cut"
  });
  return admin.app();
}

function cleanProject(doc, includeData = true) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || "مشروع بدون اسم",
    ownerUid: data.ownerUid,
    ownerEmail: data.ownerEmail || "",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    ...(includeData ? { projectData: data.projectData || {} } : {})
  };
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
    const email = String(decoded.email || "").trim().toLowerCase();
    const db = app.firestore();
    const ownerDoc = await db.collection("admins").doc(decoded.uid).get();
    const isOwner = email === OWNER_EMAIL && decoded.email_verified === true && ownerDoc.exists;

    if (!isOwner) {
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data().status !== "active") {
        return res.status(403).json({ error: "حسابك غير نشط أو غير مصرح له." });
      }
    }

    const body = req.body || {};
    const action = String(body.action || "");
    const projects = db.collection("projects");

    if (action === "list") {
      const snap = isOwner
        ? await projects.limit(200).get()
        : await projects.where("ownerUid", "==", decoded.uid).limit(100).get();

      const items = snap.docs.map(doc => cleanProject(doc, false));
      items.sort((a, b) => {
        const at = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
        const bt = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
        return bt - at;
      });
      return res.status(200).json({ projects: items, canViewAll: isOwner });
    }

    const projectId = String(body.projectId || "").trim();
    if (action === "get" || action === "delete") {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
        return res.status(400).json({ error: "معرّف المشروع غير صالح." });
      }
      const ref = projects.doc(projectId);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "المشروع غير موجود." });
      const project = doc.data() || {};

      if (project.ownerUid !== decoded.uid && !isOwner) {
        return res.status(403).json({ error: "هذا المشروع خاص بمستخدم آخر." });
      }

      if (action === "get") return res.status(200).json({ project: cleanProject(doc) });

      // المدير يستطيع الاطلاع على مشاريع الجميع، لكن الحذف يظل لصاحب المشروع فقط.
      if (project.ownerUid !== decoded.uid) {
        return res.status(403).json({ error: "حذف المشروع متاح لصاحبه فقط." });
      }
      await ref.delete();
      return res.status(200).json({ ok: true });
    }

    if (action === "save") {
      const title = String(body.title || "مشروع بدون اسم").trim().slice(0, 120);
      const projectData = body.projectData;
      if (!projectData || typeof projectData !== "object" || Array.isArray(projectData)) {
        return res.status(400).json({ error: "بيانات المشروع غير صالحة." });
      }
      const serialized = JSON.stringify(projectData);
      if (Buffer.byteLength(serialized, "utf8") > MAX_PROJECT_BYTES) {
        return res.status(413).json({ error: "حجم بيانات المشروع كبير. احفظ الوسائط كملفات منفصلة." });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      if (projectId) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
          return res.status(400).json({ error: "معرّف المشروع غير صالح." });
        }
        const ref = projects.doc(projectId);
        const existing = await ref.get();
        if (existing.exists && existing.data().ownerUid !== decoded.uid) {
          return res.status(403).json({ error: "لا يمكنك تعديل مشروع مستخدم آخر." });
        }
        await ref.set({
          ownerUid: decoded.uid,
          ownerEmail: email,
          title,
          projectData,
          updatedAt: now,
          ...(existing.exists ? {} : { createdAt: now })
        }, { merge: true });
        return res.status(200).json({ ok: true, projectId: ref.id });
      }

      const ref = projects.doc();
      await ref.set({
        ownerUid: decoded.uid,
        ownerEmail: email,
        title,
        projectData,
        createdAt: now,
        updatedAt: now
      });
      return res.status(201).json({ ok: true, projectId: ref.id });
    }

    return res.status(400).json({ error: "طلب غير معروف." });
  } catch (error) {
    console.error("KAB CUT projects API:", error);
    return res.status(500).json({ error: "تعذر تنفيذ العملية. راجع إعدادات Firebase وVercel." });
  }
};
