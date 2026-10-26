import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, deleteDoc,
  onSnapshot, getDocs, writeBatch, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ---------- State ----------
let results = [];          // each item: { id, courseCode, ... }
let editId = null;         // Firestore doc id being edited
let currentUser = null;
let unsubscribe = null;

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const appScreen = $("appScreen");
const form = $("resultForm");

// ---------- Auth ----------
$("loginBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Popups are often blocked on mobile browsers -> fall back to redirect
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      signInWithRedirect(auth, provider);
    } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      alert("Login failed: " + err.message);
    }
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  if (!user) {
    results = [];
    editId = null;
    appScreen.hidden = true;
    loginScreen.hidden = false;
    return;
  }

  loginScreen.hidden = true;
  appScreen.hidden = false;
  $("userName").textContent = user.displayName || user.email;
  $("userPhoto").src = user.photoURL || "";
  $("userPhoto").hidden = !user.photoURL;

  await migrateLocalData();

  // Live sync: updates instantly across all devices
  const q = query(userCol(), orderBy("createdAt", "asc"));
  unsubscribe = onSnapshot(q, (snap) => {
    results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    displayResults();
  }, (err) => {
    console.error(err);
    alert("Could not load data: " + err.message);
  });
});

function userCol() {
  return collection(db, "users", currentUser.uid, "results");
}

// One-time upload of results saved in this browser before login existed
async function migrateLocalData() {
  let local = [];
  try { local = JSON.parse(localStorage.getItem("results")) || []; } catch { local = []; }
  if (!local.length) return;

  const existing = await getDocs(userCol());
  if (existing.empty) {
    const batch = writeBatch(db);
    local.forEach((r, i) => {
      batch.set(doc(userCol()), { ...r, createdAt: Date.now() + i });
    });
    await batch.commit();
  }
  // Keep a backup copy under a different key, then clear the old one
  localStorage.setItem("results_backup", JSON.stringify(local));
  localStorage.removeItem("results");
}

// ---------- Form ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const courseCode = $("courseCode").value.trim();
  const courseTitle = $("courseTitle").value.trim();
  const mid = Number($("mid").value) || 0;
  const ct = Number($("ct").value) || 0;
  const attendance = Number($("attendance").value) || 0;
  const final = Number($("final").value) || 0;

  const total = mid + ct + attendance + final;
  const result = { courseCode, courseTitle, mid, ct, attendance, final, total, ...calculateGrade(total) };

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (editId === null) {
      await addDoc(userCol(), { ...result, createdAt: Date.now() });
    } else {
      // merge keeps the original createdAt so row order doesn't change
      await setDoc(doc(userCol(), editId), result, { merge: true });
      editId = null;
    }
    form.reset();
    btn.textContent = "Add Result";
  } catch (err) {
    alert("Save failed: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Table ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function gradeClass(grade) {
  return "grade-" + grade.replace("+", "plus").replace("-", "minus");
}

function displayResults() {
  const table = $("resultTable");
  table.innerHTML = "";
  let totalPoints = 0;

  results.forEach((r) => {
    totalPoints += r.gpa;
    const row = document.createElement("tr");
    row.className = gradeClass(r.grade);
    row.innerHTML = `
      <td>${esc(r.courseCode)}</td>
      <td>${esc(r.courseTitle)}</td>
      <td>${r.mid}</td>
      <td>${r.ct}</td>
      <td>${r.attendance}</td>
      <td>${r.final}</td>
      <td>${r.total}</td>
      <td>${esc(r.grade)}</td>
      <td>${r.gpa.toFixed(2)}</td>
      <td>
        <button class="edit" data-id="${esc(r.id)}">Edit</button>
        <button class="delete" data-id="${esc(r.id)}">Delete</button>
      </td>
    `;
    table.appendChild(row);
  });

  const cgpa = results.length ? totalPoints / results.length : 0;
  const cgpaDisplay = $("cgpa");
  cgpaDisplay.innerText = cgpa.toFixed(2);

  const cgpaCard = cgpaDisplay.parentElement;
  let color, bg;
  if (cgpa >= 3.75)      { color = "#2ecc71"; bg = "#d4f8e8"; }
  else if (cgpa >= 3.0)  { color = "#f1c40f"; bg = "#fff8d4"; }
  else if (cgpa >= 2.0)  { color = "#e67e22"; bg = "#ffe5d4"; }
  else                   { color = "#e74c3c"; bg = "#ffd4d4"; }

  cgpaDisplay.style.color = color;
  cgpaCard.style.background = bg;
  cgpaCard.style.boxShadow = `0 0 15px ${color}, 0 0 30px ${color} inset`;
}

// Edit / Delete (event delegation, since module scripts can't use inline onclick)
$("resultTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.classList.contains("edit")) {
    const r = results.find((x) => x.id === id);
    if (!r) return;
    $("courseCode").value = r.courseCode;
    $("courseTitle").value = r.courseTitle;
    $("mid").value = r.mid;
    $("ct").value = r.ct;
    $("attendance").value = r.attendance;
    $("final").value = r.final;
    editId = id;
    form.querySelector("button[type=submit]").textContent = "Update Result";
    form.scrollIntoView({ behavior: "smooth" });
  } else if (btn.classList.contains("delete")) {
    if (!confirm("Delete this result?")) return;
    try {
      await deleteDoc(doc(userCol(), id));
      if (editId === id) { editId = null; form.reset(); }
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }
});

function calculateGrade(total) {
  if (total >= 80) return { grade: "A+", gpa: 4.00 };
  if (total >= 75) return { grade: "A", gpa: 3.75 };
  if (total >= 70) return { grade: "A-", gpa: 3.50 };
  if (total >= 65) return { grade: "B+", gpa: 3.25 };
  if (total >= 60) return { grade: "B", gpa: 3.00 };
  if (total >= 55) return { grade: "B-", gpa: 2.75 };
  if (total >= 50) return { grade: "C+", gpa: 2.50 };
  if (total >= 45) return { grade: "C", gpa: 2.25 };
  if (total >= 40) return { grade: "D", gpa: 2.00 };
  return { grade: "F", gpa: 0.00 };
}