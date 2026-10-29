import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import * as C from "./calc.js";
import { parseResultText } from "./parser.js";
import { renderLineChart, chartTableHTML } from "./chart.js";
import { downloadCSV, downloadBlob, makePDF } from "./exporter.js";

/* =====================================================================
   Firebase
   ===================================================================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Offline mode: Firestore keeps a copy on the device and queues writes until the network is back.
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn("Offline cache not available, using memory cache", e);
  db = getFirestore(app);
}
const provider = new GoogleAuthProvider();

// Rules the app needs. Shown to the user if Firestore says "permission denied".
const RULES_TEXT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Everything inside a user's own folder is private to that user
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Read-only share links: anyone with the link can read ONE document, nobody can list them
    match /shares/{shareId} {
      allow get: if true;
      allow list: if false;
      allow create: if request.auth != null && request.resource.data.ownerUid == request.auth.uid;
      allow update: if request.auth != null && resource.data.ownerUid == request.auth.uid
                    && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if request.auth != null && resource.data.ownerUid == request.auth.uid;
    }
  }
}
`;

/* =====================================================================
   Small helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f3 = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toFixed(3);
const f2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const hasMarks = (r) => r.total !== undefined && r.total !== null && r.total !== "";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const gradeClass = (g) => "grade-" + String(g).replace("+", "plus").replace("-", "minus");
const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || "Timed out")), ms))]);
const randomId = () => {
  const a = new Uint8Array(15);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
};
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function toast(msg, type = "", ms = 4000) {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  $("toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

/* =====================================================================
   State
   ===================================================================== */
const shareId = new URLSearchParams(location.search).get("share");

const state = {
  user: null,
  profiles: [],
  profileId: null,
  courses: [],
  stats: C.computeStats([], C.DEFAULT_REQUIRED_CREDITS),
  mode: C.MODES.includes(lsGet("rt_mode")) ? lsGet("rt_mode") : "attempted",
  tab: "results",
  search: "",
  sort: "order",
  editId: null,
  readOnly: !!shareId,
  pendingProfiles: false,
  pendingCourses: false,
  collapsed: new Set(),
  targetTouched: false,
  parsedImport: null,
  share: null, // data of the opened share (read-only view)
};

let unsubProfiles = null;
let unsubCourses = null;
let renderQueued = false;

const profilesCol = () => collection(db, "users", state.user.uid, "profiles");
const coursesCol = (pid) => collection(db, "users", state.user.uid, "profiles", pid, "courses");
const currentProfile = () => state.profiles.find((p) => p.id === state.profileId) || null;
const requiredCredits = () => {
  if (state.readOnly) return state.share?.requiredCredits || C.DEFAULT_REQUIRED_CREDITS;
  return Number(currentProfile()?.requiredCredits) || C.DEFAULT_REQUIRED_CREDITS;
};
const profileName = () => (state.readOnly ? state.share?.profileName : currentProfile()?.name) || "My results";

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderAll();
  });
}

function handleError(err, what = "") {
  console.error(what, err);
  if (err && (err.code === "permission-denied" || /insufficient permissions/i.test(err.message || ""))) {
    showRulesNotice();
  } else {
    toast((what ? what + ": " : "") + (err?.message || err), "error", 6000);
  }
}

function showRulesNotice() {
  const n = $("notice");
  n.hidden = false;
  n.innerHTML = `<b>One-time setup needed:</b> Firebase is blocking the new data folders, so the rules must be updated.
    Firebase Console → Firestore Database → <b>Rules</b> → replace everything with the text below → <b>Publish</b>.
    <pre>${esc(RULES_TEXT)}</pre>
    <button type="button" id="copyRules" class="mini">Copy rules</button>`;
  $("copyRules").onclick = async () => {
    try { await navigator.clipboard.writeText(RULES_TEXT); toast("Rules copied", "ok"); } catch { toast("Select the text and copy it", "error"); }
  };
}

/* =====================================================================
   Theme
   ===================================================================== */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  lsSet("rt_theme", t);
  const btn = $("themeBtn");
  btn.textContent = t === "dark" ? "☀️" : "🌙";
  btn.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme(document.documentElement.dataset.theme || "light");
$("themeBtn").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

/* =====================================================================
   Online / sync indicator
   ===================================================================== */
function updateSync() {
  const el = $("syncStatus");
  if (state.readOnly || !state.user) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "sync";
  if (!navigator.onLine) {
    el.textContent = "Offline · saved on this device";
    el.classList.add("offline");
  } else if (state.pendingProfiles || state.pendingCourses) {
    el.textContent = "Syncing…";
    el.classList.add("pending");
  } else {
    el.textContent = "Synced ✓";
  }
}
window.addEventListener("online", () => { updateSync(); toast("Back online. Syncing…", "ok", 2500); });
window.addEventListener("offline", () => { updateSync(); toast("You are offline. Changes are saved on this device and will sync later.", "", 5000); });

/* =====================================================================
   Auth
   ===================================================================== */
$("loginBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      signInWithRedirect(auth, provider);
    } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      toast("Login failed: " + err.message, "error", 6000);
    }
  }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));

function stopListeners() {
  if (unsubProfiles) { unsubProfiles(); unsubProfiles = null; }
  if (unsubCourses) { unsubCourses(); unsubCourses = null; }
}

function showScreen(which) {
  $("loading").hidden = true;
  $("loginScreen").hidden = which !== "login";
  $("appScreen").hidden = which !== "app";
}

if (!shareId) {
  onAuthStateChanged(auth, (user) => {
    stopListeners();
    state.user = user;
    state.profiles = [];
    state.profileId = null;
    state.courses = [];
    state.editId = null;
    $("notice").hidden = true;
    if (!user) {
      showScreen("login");
      updateSync();
      return;
    }
    showScreen("app");
    $("userName").textContent = user.displayName || user.email || "";
    $("userPhoto").src = user.photoURL || "";
    $("userPhoto").hidden = !user.photoURL;
    updateSync();
    listenProfiles();
    migrateLegacy();
    scheduleRender();
  });
}

/* =====================================================================
   Profiles
   ===================================================================== */
function listenProfiles() {
  unsubProfiles = onSnapshot(
    profilesCol(),
    { includeMetadataChanges: true },
    (snap) => {
      state.pendingProfiles = snap.metadata.hasPendingWrites;
      updateSync();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
      state.profiles = list;

      if (!list.length) {
        if (!snap.metadata.fromCache) createDefaultProfile();
        else renderProfileSelect();
        return;
      }
      const saved = lsGet("rt_profile_" + state.user.uid);
      const wanted = state.profiles.some((p) => p.id === state.profileId) ? state.profileId
        : list.some((p) => p.id === saved) ? saved : list[0].id;
      renderProfileSelect();
      if (wanted !== state.profileId || !unsubCourses) selectProfile(wanted);
      else scheduleRender();
    },
    (err) => handleError(err, "Could not load profiles")
  );
}

function createDefaultProfile() {
  // fixed id "default" => can never be created twice, even from two devices at once
  setDoc(doc(profilesCol(), "default"), {
    name: state.user.displayName || "My results",
    createdAt: 1,
    requiredCredits: C.DEFAULT_REQUIRED_CREDITS,
  }).catch((e) => handleError(e, "Could not create profile"));
}

function selectProfile(id) {
  if (unsubCourses) { unsubCourses(); unsubCourses = null; }
  state.profileId = id;
  state.courses = [];
  state.editId = null;
  state.targetTouched = false;
  state.parsedImport = null;
  $("importPreview").innerHTML = "";
  lsSet("rt_profile_" + state.user.uid, id);
  resetForm();
  $("semester").value = "";
  renderProfileSelect();
  unsubCourses = onSnapshot(
    coursesCol(id),
    { includeMetadataChanges: true },
    (snap) => {
      state.pendingCourses = snap.metadata.hasPendingWrites;
      updateSync();
      if (!snap.docChanges().length && state.courses.length) return; // metadata-only change
      state.courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      scheduleRender();
    },
    (err) => handleError(err, "Could not load courses")
  );
  scheduleRender();
}

function renderProfileSelect() {
  const sel = $("profileSelect");
  sel.innerHTML = state.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name || "Untitled")}</option>`).join("");
  sel.value = state.profileId || "";
  $("profileDelete").disabled = state.profiles.length <= 1;
}

$("profileSelect").addEventListener("change", (e) => selectProfile(e.target.value));

$("profileAdd").addEventListener("click", () => {
  const name = (prompt("Name for the new profile (for example: Younger brother)") || "").trim();
  if (!name) return;
  const ref = doc(profilesCol());
  setDoc(ref, { name, createdAt: Date.now(), requiredCredits: C.DEFAULT_REQUIRED_CREDITS }).catch((e) => handleError(e, "Could not create profile"));
  selectProfile(ref.id);
});

$("profileRename").addEventListener("click", () => {
  const p = currentProfile();
  if (!p) return;
  const name = (prompt("New name for this profile", p.name || "") || "").trim();
  if (!name || name === p.name) return;
  setDoc(doc(profilesCol(), p.id), { name }, { merge: true }).catch((e) => handleError(e, "Rename failed"));
});

$("profileDelete").addEventListener("click", async () => {
  const p = currentProfile();
  if (!p || state.profiles.length <= 1) return;
  if (!confirm(`Delete the profile "${p.name}" and ALL its courses? This cannot be undone.`)) return;
  try {
    const snap = await withTimeout(getDocs(coursesCol(p.id)), 10000, "No connection");
    const refs = snap.docs.map((d) => d.ref);
    await commitInChunks(refs.map((r) => (b) => b.delete(r)));
    if (p.shareId) await deleteDoc(doc(db, "shares", p.shareId)).catch(() => {});
    await deleteDoc(doc(profilesCol(), p.id));
    toast("Profile deleted", "ok");
  } catch (e) {
    handleError(e, "Delete failed");
  }
});

// Firestore batches hold at most 500 writes.
function commitInChunks(ops, size = 400) {
  const commits = [];
  for (let i = 0; i < ops.length; i += size) {
    const batch = writeBatch(db);
    ops.slice(i, i + size).forEach((op) => op(batch));
    commits.push(batch.commit());
  }
  return Promise.all(commits);
}

/* One-time move of results saved by the older version (users/{uid}/results) into the default profile */
async function migrateLegacy() {
  if (!navigator.onLine || !state.user) return;
  try {
    const legacy = await withTimeout(getDocs(collection(db, "users", state.user.uid, "results")), 8000);
    if (legacy.empty) return;
    const docs = legacy.docs.slice(0, 200);
    const batch = writeBatch(db);
    const exists = (await getDoc(doc(profilesCol(), "default"))).exists();
    if (!exists) {
      batch.set(doc(profilesCol(), "default"), {
        name: state.user.displayName || "My results",
        createdAt: 1,
        requiredCredits: C.DEFAULT_REQUIRED_CREDITS,
      });
    }
    docs.forEach((d) => {
      const x = d.data();
      batch.set(doc(coursesCol("default"), d.id), {
        semester: "Imported",
        courseCode: x.courseCode || "",
        courseTitle: x.courseTitle || "",
        credit: C.DEFAULT_CREDIT,
        mid: x.mid ?? null, ct: x.ct ?? null, attendance: x.attendance ?? null, final: x.final ?? null,
        total: x.total ?? null,
        grade: x.grade || "F",
        gpa: Number(x.gpa) || 0,
        comment: "",
        createdAt: x.createdAt || Date.now(),
      });
      batch.delete(d.ref);
    });
    await batch.commit();
    toast(`Moved ${docs.length} old result(s) into your first profile (semester “Imported”). Rename the semester and set the credit.`, "ok", 9000);
  } catch (e) {
    if (e?.code === "permission-denied") showRulesNotice();
    else console.warn("Legacy migration skipped:", e);
  }
}

/* =====================================================================
   Tabs + mode
   ===================================================================== */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  ["results", "analytics", "data"].forEach((t) => ($("tab-" + t).hidden = t !== tab));
  if (tab === "analytics") renderAnalytics();
}
$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) setTab(b.dataset.tab);
});

$("modeTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b) return;
  state.mode = b.dataset.mode;
  lsSet("rt_mode", state.mode);
  renderAll();
});

/* =====================================================================
   Rendering
   ===================================================================== */
const MODE_HELP = {
  attempted: "Official sheet method: every attempt counts (a retake keeps the old F too).",
  earned: "Grade points ÷ credits of passed courses only (F and Y credits are left out).",
  latest: "A retaken course replaces its old grade, so only the newest attempt counts.",
};

function renderAll() {
  state.stats = C.computeStats(state.courses, requiredCredits());
  renderSummary();
  renderSemesters();
  renderSemesterList();
  renderShareState();
  if (state.tab === "analytics") renderAnalytics();
}

function levelOf(c) {
  if (c >= 3.75) return "great";
  if (c >= 3.0) return "good";
  if (c >= 2.0) return "ok";
  return "low";
}

function renderSummary() {
  const st = state.stats;
  const cg = C.cgpaOf(st, state.mode);
  $("cgpa").textContent = f3(cg);
  $("cgpaCard").dataset.level = levelOf(cg);
  document.querySelectorAll("#modeTabs button").forEach((b) => {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  $("modeHelp").textContent = MODE_HELP[state.mode];

  if (document.activeElement && document.activeElement.id === "reqCredits") return; // don't steal focus while typing
  const pct = clamp((st.completedCredits / st.requiredCredits) * 100, 0, 100);
  let best = null;
  st.semesters.forEach((s) => { if (!best || s.gpa > best.gpa) best = s; });
  const lastSem = st.semesters[st.semesters.length - 1];
  const prevSem = st.semesters[st.semesters.length - 2];
  const delta = lastSem && prevSem ? lastSem.gpa - prevSem.gpa : null;
  const reqCtl = state.readOnly
    ? `<span class="value">${num(st.requiredCredits)}</span>`
    : `<input id="reqCredits" type="number" min="1" max="400" step="1" value="${st.requiredCredits}" aria-label="Credits required for the degree">`;

  $("stats").innerHTML = `
    <div class="stat wide">
      <div class="label">Degree progress (completed credits)</div>
      <div class="value">${num(st.completedCredits)} <small>/ ${num(st.requiredCredits)}</small></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="sub">${num(st.balanceCredits)} credits left · ${Math.round(pct)}% done</div>
    </div>
    <div class="stat"><div class="label">Credits required</div><div>${reqCtl}</div><div class="sub">for your degree</div></div>
    <div class="stat"><div class="label">Credits attempted</div><div class="value">${num(st.totalCredits)}</div><div class="sub">${st.courseCount} courses</div></div>
    <div class="stat"><div class="label">Latest semester GPA</div><div class="value">${lastSem ? f3(lastSem.gpa) : "–"}</div>
      <div class="sub">${lastSem ? esc(lastSem.name) : "no data"}${delta !== null ? ` · ${delta >= 0 ? "▲" : "▼"} ${f3(Math.abs(delta))}` : ""}</div></div>
    <div class="stat"><div class="label">Best semester</div><div class="value">${best ? f3(best.gpa) : "–"}</div><div class="sub">${best ? esc(best.name) : ""}</div></div>
    <div class="stat"><div class="label">To retake</div><div class="value">${st.pendingRetakes.length}</div><div class="sub">F / Y not retaken yet</div></div>`;

  const req = $("reqCredits");
  if (req) req.addEventListener("change", () => {
    const v = Number(req.value);
    if (!(v > 0) || !state.profileId) return;
    setDoc(doc(profilesCol(), state.profileId), { requiredCredits: v }, { merge: true }).catch((e) => handleError(e, "Could not save"));
  });
}

function sortRows(rows) {
  const r = [...rows];
  const by = {
    code: (a, b) => String(a.courseCode).localeCompare(String(b.courseCode)),
    "gpa-desc": (a, b) => (Number(b.gpa) || 0) - (Number(a.gpa) || 0),
    "gpa-asc": (a, b) => (Number(a.gpa) || 0) - (Number(b.gpa) || 0),
    "credit-desc": (a, b) => b.credit - a.credit,
  }[state.sort];
  return by ? r.sort(by) : r;
}

function rowMatches(r, q) {
  if (!q) return true;
  const hay = `${r.courseCode} ${r.courseTitle} ${r.semester || ""}`.toLowerCase();
  return hay.includes(q) || String(r.grade).toLowerCase() === q;
}

function renderSemesters() {
  const st = state.stats;
  const host = $("semesters");
  const q = state.search.trim().toLowerCase();
  if (!st.semesters.length) {
    host.innerHTML = `<div class="card empty">${state.readOnly ? "Nothing to show yet." : "No courses yet. Add one above, or import your whole result from the “Import &amp; Export” tab."}</div>`;
    return;
  }
  const showMarks = st.semesters.some((s) => s.rows.some(hasMarks));
  const ro = state.readOnly;
  const html = st.semesters.map((sem) => {
    const rows = sortRows(sem.rows.filter((r) => rowMatches(r, q)));
    if (q && !rows.length) return "";
    const collapsed = state.collapsed.has(sem.name);
    const body = rows.map((r) => {
      const m = hasMarks(r);
      const badges =
        (r.isRetake ? `<span class="badge retake">Retake #${r.attempt}</span>` : "") +
        (r.retaken && state.mode === "latest" ? `<span class="badge replaced">replaced</span>` : "");
      const dim = r.retaken && state.mode === "latest" ? " replaced" : "";
      return `<tr class="${gradeClass(r.grade)}${dim}" data-id="${esc(r.id)}">
        <td class="left" data-label="Code">${esc(r.courseCode)}</td>
        <td class="left title-cell" data-label="Title">${esc(r.courseTitle) || "–"}${badges}${r.comment ? `<small>${esc(r.comment)}</small>` : ""}</td>
        <td data-label="Credit">${num(r.credit)}</td>
        ${showMarks ? `<td data-label="Mid">${m ? num(r.mid) : "–"}</td><td data-label="CT">${m ? num(r.ct) : "–"}</td><td data-label="Attendance">${m ? num(r.attendance) : "–"}</td><td data-label="Final">${m ? num(r.final) : "–"}</td><td data-label="Total">${m ? num(r.total) : "–"}</td>` : ""}
        <td data-label="Grade"><b>${esc(r.grade)}</b></td>
        <td data-label="Point">${f2(r.gpa)}</td>
        ${ro ? "" : `<td class="actions"><button class="edit" data-act="edit">Edit</button> <button class="delete" data-act="delete">Delete</button></td>`}
      </tr>`;
    }).join("");
    return `<section class="card sem${collapsed ? " collapsed" : ""}" data-sem="${esc(sem.name)}">
      <div class="sem-head" role="button" tabindex="0" aria-expanded="${!collapsed}">
        <span class="caret">▾</span>
        <span class="sem-name">${esc(sem.name)}</span>
        <span class="chips">
          <span class="chip">GPA <b>${f3(sem.gpa)}</b></span>
          <span class="chip">${num(sem.credits)} credits</span>
          <span class="chip">CGPA <b>${f3(C.semesterCgpa(sem, state.mode))}</b></span>
        </span>
        ${ro ? "" : `<span class="sem-tools"><button class="mini" data-act="rename-sem">Rename</button><button class="mini danger-text" data-act="delete-sem">Delete</button></span>`}
      </div>
      <div class="table-container"><table>
        <thead><tr>
          <th class="left">Code</th><th class="left">Course title</th><th>Credit</th>
          ${showMarks ? "<th>Mid</th><th>CT</th><th>Att.</th><th>Final</th><th>Total</th>" : ""}
          <th>Grade</th><th>Point</th>${ro ? "" : "<th>Action</th>"}
        </tr></thead>
        <tbody>${body}</tbody></table></div>
    </section>`;
  }).join("");
  host.innerHTML = html || `<div class="card empty">No course matches “${esc(state.search)}”.</div>`;
}

function renderSemesterList() {
  $("semesterList").innerHTML = state.stats.semesters.map((s) => `<option value="${esc(s.name)}"></option>`).join("");
  const sem = $("semester");
  if (!sem.value && state.stats.semesters.length && state.editId === null) {
    sem.value = state.stats.semesters[state.stats.semesters.length - 1].name;
  }
}

/* ---- semester list interactions (collapse / rename / delete / edit / delete course) ---- */
$("semesters").addEventListener("click", (e) => {
  const sectionEl = e.target.closest(".sem");
  if (!sectionEl) return;
  const semName = sectionEl.dataset.sem;
  const act = e.target.closest("[data-act]")?.dataset.act;

  if (!act) {
    if (e.target.closest(".sem-head")) toggleSem(sectionEl, semName);
    return;
  }
  if (state.readOnly) return;
  const tr = e.target.closest("tr");
  const id = tr?.dataset.id;

  if (act === "edit") startEdit(id);
  else if (act === "delete") deleteCourse(id);
  else if (act === "rename-sem") renameSemester(semName);
  else if (act === "delete-sem") deleteSemester(semName);
});
$("semesters").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("sem-head")) {
    e.preventDefault();
    const s = e.target.closest(".sem");
    toggleSem(s, s.dataset.sem);
  }
});
function toggleSem(el, name) {
  const collapsed = !el.classList.contains("collapsed");
  el.classList.toggle("collapsed", collapsed);
  el.querySelector(".sem-head").setAttribute("aria-expanded", !collapsed);
  collapsed ? state.collapsed.add(name) : state.collapsed.delete(name);
}

const semKey = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ") || "unassigned";
const coursesInSemester = (name) => state.courses.filter((c) => semKey(c.semester) === semKey(name));

function renameSemester(name) {
  const next = (prompt(`Rename semester "${name}" to:`, name) || "").trim();
  if (!next || next === name) return;
  const list = coursesInSemester(name);
  commitInChunks(list.map((c) => (b) => b.set(doc(coursesCol(state.profileId), c.id), { semester: next }, { merge: true })))
    .catch((e) => handleError(e, "Rename failed"));
}

function deleteSemester(name) {
  const list = coursesInSemester(name);
  if (!confirm(`Delete the semester "${name}" and its ${list.length} course(s)?`)) return;
  commitInChunks(list.map((c) => (b) => b.delete(doc(coursesCol(state.profileId), c.id))))
    .catch((e) => handleError(e, "Delete failed"));
}

function deleteCourse(id) {
  const c = state.courses.find((x) => x.id === id);
  if (!c || !confirm(`Delete ${c.courseCode || "this course"}?`)) return;
  deleteDoc(doc(coursesCol(state.profileId), id)).catch((e) => handleError(e, "Delete failed"));
  if (state.editId === id) resetForm();
}

$("search").addEventListener("input", (e) => { state.search = e.target.value; renderSemesters(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderSemesters(); });

/* =====================================================================
   Course form
   ===================================================================== */
const form = $("resultForm");
$("gradeSelect").innerHTML = C.GRADE_OPTIONS.map((g) => `<option value="${g}">${g === "Y" ? "Y (expelled)" : g}</option>`).join("");
$("gradeSelect").value = "B";
$("retakeGrade").innerHTML = C.GRADES.filter((g) => g.gpa > 0).map((g) => `<option value="${g.grade}">${g.grade}</option>`).join("");
$("retakeGrade").value = "B+";

function entryMode() { return form.elements.entry.value; }

function updateEntryMode() {
  const marks = entryMode() === "marks";
  $("marksFields").hidden = !marks;
  $("gradeField").hidden = marks;
  updatePreview();
}

function formResult() {
  if (entryMode() === "marks") {
    const mid = clamp(Number($("mid").value) || 0, 0, 30);
    const ct = clamp(Number($("ct").value) || 0, 0, 10);
    const attendance = clamp(Number($("attendance").value) || 0, 0, 10);
    const final = clamp(Number($("final").value) || 0, 0, 50);
    const total = mid + ct + attendance + final;
    return { mid, ct, attendance, final, total, ...C.gradeFromTotal(total) };
  }
  const grade = $("gradeSelect").value;
  return { mid: null, ct: null, attendance: null, final: null, total: null, grade, gpa: C.gradeToGpa(grade) };
}

function updatePreview() {
  const r = formResult();
  const credit = Number($("credit").value) || 0;
  const q = credit * r.gpa;
  $("formPreview").innerHTML =
    (r.total !== null ? `Total <b>${num(r.total)}</b> → ` : "") +
    `Grade <b>${esc(r.grade)}</b> (${f2(r.gpa)}) · quality points <b>${f2(q)}</b>`;
}

form.addEventListener("input", updatePreview);
form.querySelectorAll('input[name="entry"]').forEach((r) => r.addEventListener("change", updateEntryMode));

function resetForm() {
  const keepSemester = $("semester").value;
  form.reset();
  $("semester").value = state.editId ? "" : keepSemester;
  state.editId = null;
  $("credit").value = 3;
  $("gradeSelect").value = "B";
  $("formTitle").textContent = "➕ Add a course";
  $("saveBtn").textContent = "Add course";
  $("cancelEdit").hidden = true;
  updateEntryMode();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.readOnly || !state.profileId) return;
  const semester = $("semester").value.trim();
  if (!semester) { toast("Please write the semester (for example Autumn-2026)", "error"); return; }
  const data = {
    semester,
    courseCode: $("courseCode").value.trim().toUpperCase(),
    courseTitle: $("courseTitle").value.trim(),
    credit: Number($("credit").value) || C.DEFAULT_CREDIT,
    ...formResult(),
  };
  let ref;
  if (state.editId) {
    ref = doc(coursesCol(state.profileId), state.editId);
  } else {
    ref = doc(coursesCol(state.profileId));
    data.createdAt = Date.now();
    data.comment = "";
  }
  // Not awaited on purpose: offline, the write is queued and the screen updates immediately.
  setDoc(ref, data, { merge: true }).catch((err) => handleError(err, "Could not save"));
  const wasEdit = !!state.editId;
  state.editId = null;
  resetForm();
  $("semester").value = semester;
  toast(wasEdit ? "Course updated" : "Course added", "ok", 1800);
});

$("cancelEdit").addEventListener("click", () => { state.editId = null; resetForm(); });

function startEdit(id) {
  const r = state.courses.find((x) => x.id === id);
  if (!r) return;
  state.editId = id;
  $("semester").value = r.semester || "";
  $("courseCode").value = r.courseCode || "";
  $("courseTitle").value = r.courseTitle || "";
  $("credit").value = C.creditOf(r);
  if (hasMarks(r)) {
    form.elements.entry.value = "marks";
    $("mid").value = r.mid ?? ""; $("ct").value = r.ct ?? "";
    $("attendance").value = r.attendance ?? ""; $("final").value = r.final ?? "";
  } else {
    form.elements.entry.value = "grade";
    $("gradeSelect").value = r.grade;
  }
  $("formTitle").textContent = "✏️ Edit course";
  $("saveBtn").textContent = "Update course";
  $("cancelEdit").hidden = false;
  $("addCard").open = true;
  updateEntryMode();
  setTab("results");
  $("addCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Pre-fill the form for a retake (used from the Analytics tab) */
function startRetake(id) {
  const r = state.stats.semesters.flatMap((s) => s.rows).find((x) => x.id === id);
  if (!r) return;
  state.editId = null;
  resetForm();
  $("semester").value = "";
  $("courseCode").value = r.courseCode || "";
  $("courseTitle").value = r.courseTitle || "";
  $("credit").value = r.credit;
  form.elements.entry.value = "grade";
  updateEntryMode();
  setTab("results");
  $("addCard").open = true;
  $("addCard").scrollIntoView({ behavior: "smooth", block: "start" });
  $("semester").focus();
  toast("Write the semester of the retake, pick the grade, and save.", "", 5000);
}

/* =====================================================================
   Analytics
   ===================================================================== */
let chartTable = false;

function renderAnalytics() {
  renderChart();
  renderTarget();
  renderPredictor();
  renderRetakes();
}

function renderChart() {
  const st = state.stats;
  const labels = st.semesters.map((s) => s.name);
  const series = [
    { name: "Semester GPA", values: st.semesters.map((s) => s.gpa), color: "var(--series-1)" },
    { name: { attempted: "CGPA (attempted)", earned: "CGPA (earned)", latest: "CGPA (retake replaces)" }[state.mode], values: st.semesters.map((s) => C.semesterCgpa(s, state.mode)), color: "var(--series-2)" },
  ];
  $("chartTable").hidden = !chartTable;
  $("chartWrap").hidden = chartTable;
  $("chartTableBtn").textContent = chartTable ? "Show chart" : "Show table";
  $("chartTableBtn").setAttribute("aria-pressed", chartTable);
  if (chartTable) {
    $("chartTable").innerHTML = labels.length ? chartTableHTML(labels, series, f3) : '<p class="empty">No data yet.</p>';
  } else {
    renderLineChart($("chartWrap"), { labels, series, fmt: f3 });
  }
}
$("chartTableBtn").addEventListener("click", () => { chartTable = !chartTable; renderChart(); });

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.tab === "analytics" && !chartTable) renderChart(); }, 150);
});

/* ---- target CGPA ---- */
function renderTarget() {
  const st = state.stats;
  if (!state.targetTouched && st.courseCount) {
    const cur = C.cgpaOf(st, state.mode);
    $("targetCgpa").value = Math.min(4, Math.ceil((cur + 0.05) * 4) / 4).toFixed(2);
  }
  const target = Number($("targetCgpa").value);
  const credits = Number($("targetCredits").value);
  const basis = state.mode;
  const box = $("targetResult");
  if (!st.courseCount || !(credits > 0) || !(target >= 0 && target <= 4)) {
    box.className = "result-box";
    box.textContent = st.courseCount ? "Enter a target between 0 and 4 and the credits of next semester." : "Add your courses first.";
    $("whatIf").innerHTML = "";
    return;
  }
  const { needed, best } = C.requiredGpa(st, { target, credits, basis });
  const letter = C.GRADES.filter((g) => g.gpa >= needed).pop();
  let html;
  let bad = false;
  if (needed <= 0) {
    html = `You are already above <b>${f2(target)}</b>. Any passing GPA next semester keeps you there.`;
  } else if (needed <= 4) {
    html = `To reach <b>${f2(target)}</b> you need a GPA of at least <b>${f3(needed)}</b> next semester (${num(credits)} credits)${letter ? ` — about <b>${letter.grade}</b> average` : ""}.`;
  } else {
    bad = true;
    const n = C.semestersNeeded(st, { target, credits, basis });
    html = `Reaching <b>${f2(target)}</b> in one semester is not possible: you would need a GPA of <b>${f3(needed)}</b>. Even straight A+ gives <b>${f3(best)}</b>.` +
      (Number.isFinite(n) ? ` At straight 4.00 it takes about <b>${n}</b> semesters of ${num(credits)} credits.` : "");
  }
  const rem = st.balanceCredits;
  if (rem > 0 && rem !== credits) {
    const r2 = C.requiredGpa(st, { target, credits: rem, basis }).needed;
    html += `<br>Over your remaining <b>${num(rem)}</b> credits you need an average GPA of ` +
      (r2 > 4 ? `<b class="bad-text">${f3(r2)} (not reachable)</b>.` : r2 <= 0 ? "<b>nothing special</b> (already above target)." : `<b>${f3(r2)}</b>.`);
  }
  box.className = "result-box" + (bad ? " bad" : "");
  box.innerHTML = html;

  const rows = [2.5, 3.0, 3.25, 3.5, 3.75, 4.0].map((g) => {
    const c = C.whatIfCgpa(st, { gpa: g, credits, basis });
    const cur = C.cgpaOf(st, basis);
    const d = c - cur;
    return `<tr><td>${f2(g)}</td><td><b>${f3(c)}</b></td><td>${d >= 0 ? "▲" : "▼"} ${f3(Math.abs(d))}</td></tr>`;
  }).join("");
  $("whatIf").innerHTML = `<table class="mini-table"><thead><tr><th>Next semester GPA</th><th>CGPA becomes</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>`;
}
["targetCgpa", "targetCredits"].forEach((id) =>
  $(id).addEventListener("input", () => { if (id === "targetCgpa") state.targetTouched = true; renderTarget(); })
);

/* ---- final marks predictor ---- */
function renderPredictor() {
  const vals = ["pMid", "pCt", "pAtt"].map((id) => $(id).value);
  const host = $("predictResult");
  if (vals.every((v) => v === "")) {
    host.innerHTML = '<p class="hint">Fill in at least one box to see the table.</p>';
    return;
  }
  const mid = clamp(Number(vals[0]) || 0, 0, 30);
  const ct = clamp(Number(vals[1]) || 0, 0, 10);
  const att = clamp(Number(vals[2]) || 0, 0, 10);
  const { have, list } = C.neededFinal(mid, ct, att);
  const rows = list.map((g) => {
    let tag;
    if (g.secured) tag = '<span class="tag ok">✓ Already secured</span>';
    else if (!g.reachable) tag = '<span class="tag no">✕ Not possible</span>';
    else tag = `<span class="tag maybe">Need ${num(g.need)} / ${C.FINAL_MAX}</span>`;
    return `<tr><td><b>${g.grade}</b></td><td>${g.minTotal}+</td><td>${tag}</td></tr>`;
  }).join("");
  host.innerHTML = `<p class="hint">So far: <b>${num(have)}</b> / 50 (Final adds up to 50 more).</p>
    <table class="mini-table"><thead><tr><th>Grade</th><th>Total needed</th><th>Final marks needed</th></tr></thead><tbody>${rows}</tbody></table>`;
}
["pMid", "pCt", "pAtt"].forEach((id) => $(id).addEventListener("input", renderPredictor));

/* ---- retake & improvement ---- */
function renderRetakes() {
  const st = state.stats;
  const host = $("retakeList");
  const items = [...st.pendingRetakes, ...st.improvable];
  if (!items.length) {
    host.innerHTML = '<p class="hint">Nothing to retake right now. 🎉</p>';
    return;
  }
  const g = $("retakeGrade").value;
  const cur = C.cgpaOf(st, state.mode);
  host.innerHTML = items.map((r) => {
    const after = C.cgpaAfterRetake(state.courses, r, g, state.mode, st.requiredCredits);
    const d = after - cur;
    return `<div class="retake-item">
      <div><b>${esc(r.courseCode)}</b> ${esc(r.courseTitle)}<br><small class="hint">${esc(r.semester)} · ${num(r.credit)} cr · grade <b>${esc(r.grade)}</b></small></div>
      <div>CGPA ${f3(cur)} → <b>${f3(after)}</b> <span class="${d >= 0 ? "ok-text" : "bad-text"}">(${d >= 0 ? "+" : "−"}${f3(Math.abs(d))})</span></div>
      ${state.readOnly ? "" : `<button class="mini" data-retake="${esc(r.id)}">Add retake</button>`}
    </div>`;
  }).join("");
}
$("retakeGrade").addEventListener("change", renderRetakes);
$("retakeList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-retake]");
  if (b) startRetake(b.dataset.retake);
});

/* =====================================================================
   Import from the university result page
   ===================================================================== */
$("importClear").addEventListener("click", () => {
  $("importText").value = "";
  $("importPreview").innerHTML = "";
  state.parsedImport = null;
});

$("importParse").addEventListener("click", () => {
  const parsed = parseResultText($("importText").value);
  state.parsedImport = parsed;
  const host = $("importPreview");
  if (!parsed.semesters.length) {
    host.innerHTML = '<p class="bad-text import-sum">I could not find any course rows. Copy the whole result page (Ctrl+A, Ctrl+C) and paste it again.</p>';
    return;
  }
  const rowsFor = parsed.semesters.map((s) => ({ ...s, stats: C.computeStats(s.courses.map((c, i) => ({ ...c, id: "p" + i, semester: s.name })), 161).semesters[0] }));
  const total = rowsFor.reduce((a, s) => a + s.courses.length, 0);
  const all = C.computeStats(parsed.semesters.flatMap((s) => s.courses.map((c, i) => ({ ...c, id: s.name + i, semester: s.name, createdAt: i }))), parsed.requiredCredits || 161);
  const last = parsed.semesters[parsed.semesters.length - 1].reported;
  const match = (a, b) => (b === undefined ? "" : Math.abs(a - b) < 0.0011 ? '<span class="ok-text">✓</span>' : `<span class="bad-text">≠ ${b}</span>`);
  const trs = rowsFor.map((s) => `<tr><td class="left">${esc(s.name)}</td><td>${s.courses.length}</td><td>${num(s.stats.credits)}</td><td>${f3(s.stats.gpa)} ${match(s.stats.gpa, s.reported.gpa)}</td></tr>`).join("");
  host.innerHTML = `<div class="import-sum">
    <p><b>${total}</b> courses in <b>${parsed.semesters.length}</b> semesters found${parsed.requiredCredits ? ` · degree needs <b>${parsed.requiredCredits}</b> credits` : ""}.
    ${parsed.skipped.length ? `<span class="warn">${parsed.skipped.length} line(s) looked like courses but could not be read.</span>` : ""}</p>
    <table class="mini-table"><thead><tr><th class="left">Semester</th><th>Courses</th><th>Credits</th><th>GPA (✓ = same as your sheet)</th></tr></thead><tbody>${trs}</tbody></table>
    <p class="hint">CGPA from this data: attempted <b>${f3(all.cgpaAttempted)}</b> ${match(all.cgpaAttempted, last.cgpaAttempted)} · earned <b>${f3(all.cgpaEarned)}</b> ${match(all.cgpaEarned, last.cgpaEarned)}</p>
    <div class="import-options">
      <label><input type="radio" name="importMode" value="skip" checked> Add to this profile (skip courses already there)</label>
      <label><input type="radio" name="importMode" value="replace"> Replace everything in this profile with this result</label>
    </div>
    <button type="button" class="primary" id="importGo">Import ${total} courses into “${esc(profileName())}”</button>
  </div>`;
  $("importGo").addEventListener("click", doImport);
});

async function doImport() {
  const parsed = state.parsedImport;
  if (!parsed || !state.profileId) return;
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  if (mode === "replace" && state.courses.length && !confirm(`This deletes the ${state.courses.length} existing course(s) in this profile first. Continue?`)) return;

  const have = new Set(state.courses.map((c) => semKey(c.semester) + "|" + C.codeKey(c.courseCode)));
  const ops = [];
  if (mode === "replace") state.courses.forEach((c) => ops.push((b) => b.delete(doc(coursesCol(state.profileId), c.id))));
  let added = 0, skipped = 0;
  const base = Date.now();
  parsed.semesters.forEach((s) => s.courses.forEach((c) => {
    const key = semKey(s.name) + "|" + C.codeKey(c.courseCode);
    if (mode === "skip" && have.has(key)) { skipped++; return; }
    have.add(key);
    const ref = doc(coursesCol(state.profileId));
    const data = {
      semester: s.name, courseCode: c.courseCode, courseTitle: c.courseTitle, credit: c.credit,
      mid: null, ct: null, attendance: null, final: null, total: null,
      grade: c.grade, gpa: c.gpa, comment: c.comment || "", createdAt: base + added,
    };
    ops.push((b) => b.set(ref, data));
    added++;
  }));
  if (parsed.requiredCredits && parsed.requiredCredits !== requiredCredits()) {
    ops.push((b) => b.set(doc(profilesCol(), state.profileId), { requiredCredits: parsed.requiredCredits }, { merge: true }));
  }
  commitInChunks(ops).catch((e) => handleError(e, "Import failed"));
  toast(`Imported ${added} course(s)${skipped ? `, skipped ${skipped} already there` : ""}.`, "ok", 5000);
  $("importText").value = "";
  $("importPreview").innerHTML = "";
  state.parsedImport = null;
  setTab("results");
}

/* =====================================================================
   Downloads
   ===================================================================== */
const fileBase = () => (profileName() || "result").replace(/[^\w\-]+/g, "_").slice(0, 40) || "result";

$("csvBtn").addEventListener("click", () => {
  downloadCSV(`${fileBase()}-result.csv`, state.stats);
});

$("pdfBtn").addEventListener("click", async () => {
  const btn = $("pdfBtn");
  btn.disabled = true;
  toast("Preparing PDF…", "", 2000);
  try {
    const blob = await makePDF({ profileName: profileName(), stats: state.stats, mode: state.mode });
    downloadBlob(`${fileBase()}-result.pdf`, blob);
  } catch (e) {
    toast(navigator.onLine ? "PDF failed: " + e.message : "The PDF tool needs internet the first time. Connect and try again.", "error", 6000);
  } finally {
    btn.disabled = false;
  }
});

/* =====================================================================
   Share (read-only link)
   ===================================================================== */
const shareUrl = (id) => `${location.origin}${location.pathname}?share=${id}`;

function renderShareState() {
  if (state.readOnly) return;
  const p = currentProfile();
  const box = $("shareState");
  if (!p || !p.shareId) {
    box.innerHTML = "";
    $("shareCreate").textContent = "Create link";
    $("shareStop").hidden = true;
    return;
  }
  const url = shareUrl(p.shareId);
  box.innerHTML = `<div class="share-link"><input id="shareUrl" readonly value="${esc(url)}" aria-label="Share link"><button type="button" class="mini" id="shareCopy">Copy</button></div>
    <p class="hint">Anyone with this link can see ${p.shareHideMarks ? "the grades" : "the marks and grades"} as they were when you last pressed “Update link”.</p>`;
  $("shareCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied", "ok", 2000); }
    catch { $("shareUrl").select(); toast("Press Ctrl+C to copy", "", 3000); }
  };
  $("shareCreate").textContent = "Update link";
  $("shareStop").hidden = false;
}

$("shareCreate").addEventListener("click", async () => {
  const p = currentProfile();
  if (!p) return;
  if (!navigator.onLine) { toast("Sharing needs internet.", "error"); return; }
  const hide = $("shareHideMarks").checked;
  const id = p.shareId || randomId();
  const payload = {
    ownerUid: state.user.uid,
    profileName: p.name || "",
    requiredCredits: requiredCredits(),
    hideMarks: hide,
    updatedAt: Date.now(),
    courses: state.courses.map((c) => ({
      semester: c.semester || "", courseCode: c.courseCode || "", courseTitle: c.courseTitle || "",
      credit: C.creditOf(c), grade: c.grade, gpa: Number(c.gpa) || 0, comment: c.comment || "",
      createdAt: c.createdAt || 0,
      ...(hide || !hasMarks(c) ? {} : { mid: c.mid, ct: c.ct, attendance: c.attendance, final: c.final, total: c.total }),
    })),
  };
  const btn = $("shareCreate");
  btn.disabled = true;
  try {
    await withTimeout(setDoc(doc(db, "shares", id), payload), 12000, "No connection");
    await setDoc(doc(profilesCol(), p.id), { shareId: id, shareHideMarks: hide }, { merge: true });
    toast("Share link is ready", "ok");
  } catch (e) {
    handleError(e, "Could not create link");
  } finally {
    btn.disabled = false;
  }
});

$("shareStop").addEventListener("click", async () => {
  const p = currentProfile();
  if (!p?.shareId || !confirm("Stop sharing? The old link will stop working.")) return;
  try {
    await withTimeout(deleteDoc(doc(db, "shares", p.shareId)), 12000, "No connection");
    await setDoc(doc(profilesCol(), p.id), { shareId: null }, { merge: true });
    toast("Sharing stopped", "ok");
  } catch (e) {
    handleError(e, "Could not stop sharing");
  }
});

/* ---- shared (read-only) view ---- */
async function openSharedView(id) {
  document.body.classList.add("readonly");
  ["userBar", "addCard"].forEach((x) => ($(x).hidden = true));
  document.querySelector('#tabs [data-tab="data"]').hidden = true;
  try {
    const snap = await withTimeout(getDoc(doc(db, "shares", id)), 12000, "No connection");
    if (!snap.exists()) throw new Error("not-found");
    const d = snap.data();
    state.share = d;
    state.courses = (d.courses || []).map((c, i) => ({ id: "s" + i, ...c }));
    $("shareBanner").hidden = false;
    $("shareBanner").innerHTML = `<span>👀 Read-only result of <b>${esc(d.profileName || "someone")}</b> · updated ${esc(new Date(d.updatedAt || Date.now()).toLocaleDateString("en-GB"))}</span>
      <a href="${esc(location.pathname)}">Open my own tracker →</a>`;
    document.title = `${d.profileName || "Result"} · Personal Result Tracker`;
    showScreen("app");
    renderAll();
  } catch (e) {
    $("loading").hidden = true;
    $("notice").hidden = false;
    $("notice").innerHTML = `This link is not valid, or the owner stopped sharing. <a href="${esc(location.pathname)}">Open the tracker</a>`;
  }
}
if (shareId) openSharedView(shareId);

/* =====================================================================
   Boot
   ===================================================================== */
updateEntryMode();
if (!shareId) updatePreview();

// Offline support: cache the app files so the page also opens without internet.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered", e));
}
