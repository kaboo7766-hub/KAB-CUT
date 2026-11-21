(() => {
  "use strict";
  const firebaseConfig = {
    apiKey: "AIzaSyBLGZOY0YM15WSyUY-eFas5md-hlDQ9obE",
    authDomain: "kab-cut.firebaseapp.com",
    projectId: "kab-cut",
    storageBucket: "kab-cut.firebasestorage.app",
    messagingSenderId: "649613946164",
    appId: "1:649613946164:web:cac85cf9a404b74e0b0961",
    measurementId: "G-CS3H55FKEE"
  };
  const OWNER_EMAIL = "kaboo7766@gmail.com";
  const css = `
    body.kab-auth-locked > header, body.kab-auth-locked > main, body.kab-auth-locked > footer { visibility:hidden !important; pointer-events:none !important; }
    #kabAuthRoot { position:fixed; inset:0; z-index:999999; display:flex; align-items:center; justify-content:center; padding:18px; background:radial-gradient(circle at 20% 15%,rgba(0,229,255,.12),transparent 34%),#0b0e13; color:#f8fafc; font-family:Cairo,Arial,sans-serif; overflow:auto; }
    #kabAuthRoot * { box-sizing:border-box; }
    .kab-auth-card { width:min(100%,440px); background:#171c25; border:1px solid #303947; border-radius:22px; padding:26px; box-shadow:0 24px 80px #0009; }
    .kab-auth-logo { width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#00e5ff,#6954e8);color:#071018;font-size:25px;margin:0 auto 14px; }
    .kab-auth-card h1 { text-align:center;font-size:25px;margin:0 0 5px;font-weight:900; }
    .kab-auth-muted { text-align:center;color:#9ca9b9;font-size:13px;margin:0 0 22px; }
    .kab-auth-card label { display:block;font-size:13px;color:#cbd5e1;margin:13px 0 6px; }
    .kab-auth-card input { width:100%;background:#0d121a;border:1px solid #354153;color:white;border-radius:11px;padding:12px;font:inherit;outline:none; }
    .kab-auth-card input:focus { border-color:#00d8f5;box-shadow:0 0 0 3px #00d8f522; }
    .kab-auth-btn { width:100%;border:0;border-radius:11px;padding:12px;margin-top:17px;background:linear-gradient(90deg,#00e5ff,#39a8ff);color:#06121a;font:inherit;font-weight:900;cursor:pointer; }
    .kab-auth-btn:disabled { opacity:.55;cursor:wait; }
    .kab-auth-msg { min-height:22px;color:#fca5a5;font-size:12px;margin-top:12px;text-align:center; }
    .kab-auth-top { display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px; }
    .kab-auth-small { border:1px solid #394455;background:#222a36;color:#e2e8f0;border-radius:9px;padding:7px 10px;cursor:pointer;font:inherit;font-size:12px; }
    .kab-auth-user { padding:10px;border:1px solid #303947;border-radius:10px;margin:8px 0;background:#111720;font-size:12px; }
    .kab-auth-user button { margin-inline-start:6px; }
    .kab-auth-hidden { display:none !important; }
    @media(max-width:480px){.kab-auth-card{padding:20px}.kab-auth-card h1{font-size:22px}}
  `;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  document.body.classList.add("kab-auth-locked");
  const root = document.createElement("div");
  root.id = "kabAuthRoot";
  root.innerHTML = `
    <section class="kab-auth-card" aria-live="polite">
      <div class="kab-auth-logo"><i class="fa-solid fa-scissors"></i></div>
      <h1>KAB CUT</h1>
      <p class="kab-auth-muted">استوديو المونتاج الخاص — الدخول بدعوة من المدير فقط</p>
      <div id="kabLoginView">
        <label for="kabEmail">البريد الإلكتروني</label><input id="kabEmail" type="email" autocomplete="username" placeholder="name@example.com">
        <label for="kabPassword">كلمة المرور</label><input id="kabPassword" type="password" autocomplete="current-password" placeholder="••••••••">
        <button class="kab-auth-btn" id="kabLoginBtn">تسجيل الدخول بالبريد</button>
        <div style="display:flex;align-items:center;gap:10px;margin:15px 0;color:#94a3b8;font-size:12px"><span style="height:1px;background:#394455;flex:1"></span>أو<span style="height:1px;background:#394455;flex:1"></span></div>
        <button class="kab-auth-btn" id="kabGoogleBtn" style="margin-top:0;background:#fff;color:#1f2937;border:1px solid #d1d5db"><i class="fa-brands fa-google" style="margin-inline-end:8px"></i> المتابعة باستخدام Google</button>
        <div class="kab-auth-msg" id="kabAuthMsg">الدخول متاح للحسابات التي يضيفها المدير فقط.</div>
      </div>
      <div id="kabAdminView" class="kab-auth-hidden">
        <div class="kab-auth-top"><strong>إدارة المستخدمين</strong><button class="kab-auth-small" id="kabBackBtn">العودة للبرنامج</button></div>
        <label for="kabNewName">اسم المستخدم</label><input id="kabNewName" type="text" placeholder="الاسم">
        <label for="kabNewEmail">البريد الإلكتروني</label><input id="kabNewEmail" type="email" placeholder="user@example.com">
        <label for="kabNewPassword">كلمة مرور مؤقتة (8 أحرف على الأقل)</label><input id="kabNewPassword" type="password" autocomplete="new-password">
        <button class="kab-auth-btn" id="kabCreateBtn">إضافة مستخدم جديد</button>
        <div class="kab-auth-msg" id="kabAdminMsg"></div>
        <div id="kabUsersList"></div>
      </div>
      <div id="kabSessionView" class="kab-auth-hidden">
        <p class="kab-auth-muted" id="kabSessionText">جاري التحقق من صلاحية الحساب…</p>
        <button class="kab-auth-btn" id="kabSignOutBtn">تسجيل الخروج</button>
      </div>
    </section>`;
  document.body.appendChild(root);

  let app, auth, currentRole = null;
  const el = id => document.getElementById(id);
  const msg = (id, text, bad=true) => { const n=el(id); if(n){n.textContent=text;n.style.color=bad?"#fca5a5":"#86efac";} };
  const show = id => ["kabLoginView","kabAdminView","kabSessionView"].forEach(x=>el(x).classList.toggle("kab-auth-hidden",x!==id));
  const unlock = () => { root.classList.add("kab-auth-hidden"); document.body.classList.remove("kab-auth-locked"); };
  const lock = () => { root.classList.remove("kab-auth-hidden"); document.body.classList.add("kab-auth-locked"); show("kabLoginView"); };
  async function api(action, extra={}) {
    const user=auth.currentUser; if(!user) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const token=await user.getIdToken(true);
    const response=await fetch("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action,...extra})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"تعذر تنفيذ الطلب.");
    return data;
  }
  async function enter(user) {
    show("kabSessionView"); msg("kabAuthMsg","",false);
    el("kabSessionText").textContent="جاري التحقق من صلاحية الحساب…";
    try {
      if((user.email||"").trim().toLowerCase()===OWNER_EMAIL) await api("bootstrap");
      const access=await api("access");
      currentRole=access.role;
      unlock();
      addDriveButton();
      if(currentRole==="owner") {
        addAdminButton();
      } else {
        const b=document.getElementById("kabAdminOpen"); if(b)b.remove();
      }
    } catch(error) {
      await auth.signOut();
      lock();
      msg("kabAuthMsg",error.message||"هذا الحساب غير مصرح له بالدخول.");
    }
  }
  function addAdminButton(){
    if(document.getElementById("kabAdminOpen")) return;
    const b=document.createElement("button"); b.id="kabAdminOpen"; b.type="button"; b.title="إدارة المستخدمين";
    b.innerHTML='<i class="fa-solid fa-user-shield"></i> إدارة المستخدمين';
    b.style.cssText="position:fixed;top:62px;right:12px;z-index:99990;background:#172b36;color:#67e8f9;border:1px solid #087e91;border-radius:10px;padding:8px 12px;font:700 12px Cairo;cursor:pointer";
    b.onclick=async()=>{root.classList.remove("kab-auth-hidden");document.body.classList.add("kab-auth-locked");show("kabAdminView");await loadUsers();};
    document.body.appendChild(b);
  }
  async function driveRequest(action) {
    const user=auth.currentUser;
    if(!user) throw new Error("سجّل الدخول أولاً.");
    const token=await user.getIdToken(true);
    const response=await fetch("/api/drive/projects",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"تعذر الاتصال بـ Google Drive.");
    return data;
  }
  async function addDriveButton(){
    let b=document.getElementById("kabDriveConnect");
    if(!b){
      b=document.createElement("button");b.id="kabDriveConnect";b.type="button";
      b.innerHTML='<i class="fa-brands fa-google-drive"></i> مساحة Google Drive الخاصة بي';
      b.style.cssText="position:fixed;top:108px;right:12px;z-index:99990;background:#172b36;color:#a7f3d0;border:1px solid #16865d;border-radius:10px;padding:8px 12px;font:700 12px Cairo;cursor:pointer";
      b.onclick=async()=>{
        b.disabled=true;b.textContent="جاري فتح Google Drive…";
        try{
          const user=auth.currentUser, token=await user.getIdToken(true);
          const response=await fetch("/api/drive/connect",{headers:{"Authorization":"Bearer "+token}});
          const data=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(data.error||"تعذر بدء ربط Google Drive.");
          window.location.href=data.authUrl;
        }catch(e){alert(e.message||"تعذر ربط Google Drive.");b.disabled=false;b.innerHTML='<i class="fa-brands fa-google-drive"></i> مساحة Google Drive الخاصة بي';}
      };
      document.body.appendChild(b);
    }
    try{
      const status=await driveRequest("status");
      b.innerHTML='<i class="fa-brands fa-google-drive"></i> Drive متصل: '+status.googleEmail;
      b.title="مساحة المشاريع الخاصة بهذا الحساب فقط";
    }catch(_){
      b.innerHTML='<i class="fa-brands fa-google-drive"></i> ربط مساحة Google Drive الخاصة بي';
      b.title="اربط حساب Google Drive الخاص بك لحفظ مشاريعك بشكل خاص";
    }
  }
  async function loadUsers(){
    try {
      const data=await api("list"); const list=el("kabUsersList"); list.innerHTML="<h3 style='margin:18px 0 8px'>الحسابات المضافة</h3>";
      if(!data.users.length){list.innerHTML+="<p class='kab-auth-muted'>لا يوجد مستخدمون بعد.</p>";return;}
      data.users.forEach(u=>{
        const row=document.createElement("div");row.className="kab-auth-user";
        const label=document.createElement("span");label.textContent=(u.displayName||u.email)+" — "+(u.status==="active"?"نشط":"موقوف");
        const toggle=document.createElement("button");toggle.className="kab-auth-small";toggle.textContent=u.status==="active"?"إيقاف":"تفعيل";
        toggle.onclick=async()=>{try{await api("setStatus",{uid:u.uid,status:u.status==="active"?"disabled":"active"});await loadUsers();}catch(e){msg("kabAdminMsg",e.message);}};
        const del=document.createElement("button");del.className="kab-auth-small";del.textContent="حذف";del.onclick=async()=>{if(!confirm("حذف حساب "+u.email+" نهائياً؟"))return;try{await api("delete",{uid:u.uid});await loadUsers();}catch(e){msg("kabAdminMsg",e.message);}};
        row.append(label,toggle,del);list.appendChild(row);
      });
    } catch(e){msg("kabAdminMsg",e.message);}
  }
  el("kabLoginBtn").addEventListener("click",async()=>{
    const email=el("kabEmail").value.trim(),password=el("kabPassword").value;
    if(!email||!password)return msg("kabAuthMsg","اكتب البريد وكلمة المرور.");
    el("kabLoginBtn").disabled=true;el("kabLoginBtn").textContent="جاري تسجيل الدخول…";
    try{await auth.signInWithEmailAndPassword(email,password);}catch(e){msg("kabAuthMsg","بيانات الدخول غير صحيحة أو الحساب غير مفعّل.");}
    finally{el("kabLoginBtn").disabled=false;el("kabLoginBtn").textContent="تسجيل الدخول";}
  });
  el("kabGoogleBtn").addEventListener("click",async()=>{
    const btn=el("kabGoogleBtn");
    btn.disabled=true;btn.textContent="جاري فتح Google…";
    try{
      const provider=new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      await auth.signInWithPopup(provider);
    }catch(e){
      console.error("KAB CUT Google sign-in:",e);
      const code=e&&e.code||"";
      const messages={
        "auth/popup-blocked":"المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.",
        "auth/popup-closed-by-user":"تم إغلاق نافذة Google قبل اكتمال الدخول.",
        "auth/unauthorized-domain":"هذا النطاق غير مضاف إلى النطاقات المصرح بها في Firebase Authentication.",
        "auth/operation-not-allowed":"فعّل تسجيل الدخول باستخدام Google من Firebase Authentication ثم أعد المحاولة.",
        "auth/account-exists-with-different-credential":"هذا البريد مرتبط بطريقة دخول أخرى. استخدم طريقة الدخول الأصلية أو اربط الحسابين بأمان."
      };
      msg("kabAuthMsg",messages[code]||"تعذر تسجيل الدخول باستخدام Google. تحقق من إعدادات Google في Firebase ثم أعد المحاولة.");
    }finally{btn.disabled=false;btn.innerHTML='<i class="fa-brands fa-google" style="margin-inline-end:8px"></i> المتابعة باستخدام Google';}
  });
  el("kabPassword").addEventListener("keydown",e=>{if(e.key==="Enter")el("kabLoginBtn").click();});
  el("kabCreateBtn").addEventListener("click",async()=>{
    const email=el("kabNewEmail").value.trim(),password=el("kabNewPassword").value,displayName=el("kabNewName").value.trim();
    el("kabCreateBtn").disabled=true;
    try{await api("create",{email,password,displayName});msg("kabAdminMsg","تم إنشاء الحساب وإضافته بنجاح.",false);el("kabNewEmail").value="";el("kabNewPassword").value="";el("kabNewName").value="";await loadUsers();}
    catch(e){msg("kabAdminMsg",e.message);}
    finally{el("kabCreateBtn").disabled=false;}
  });
  el("kabBackBtn").onclick=()=>{root.classList.add("kab-auth-hidden");document.body.classList.remove("kab-auth-locked");};
  el("kabSignOutBtn").onclick=()=>auth.signOut();
  const sdk=document.createElement("script");sdk.src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js";
  sdk.onload=()=>{
    const s=document.createElement("script");s.src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js";
    s.onload=()=>{
      try{app=firebase.initializeApp(firebaseConfig);auth=firebase.auth();auth.onAuthStateChanged(user=>{if(user)enter(user);else{currentRole=null;const b=document.getElementById("kabAdminOpen");if(b)b.remove();lock();}});}
      catch(e){show("kabLoginView");msg("kabAuthMsg","تعذر تهيئة Firebase. تحقق من إعدادات المشروع.");}
    };s.onerror=()=>msg("kabAuthMsg","تعذر تحميل خدمة تسجيل الدخول.");document.head.appendChild(s);
  };sdk.onerror=()=>msg("kabAuthMsg","تعذر تحميل Firebase.");document.head.appendChild(sdk);
})();