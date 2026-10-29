// calc.js — pure calculation helpers (no DOM, no Firebase).
// Follows the IIUC result-sheet method:
//   CGPA (Attempted) = all grade points / all attempted credits
//   CGPA (Earned)    = all grade points / credits of passed courses only
//   CGPA (Latest)    = a retaken course REPLACES its older attempt (extra view, not on the official sheet)
// By default a retaken course keeps both attempts in the totals, exactly like the official sheet.

export const DEFAULT_CREDIT = 3;
export const DEFAULT_REQUIRED_CREDITS = 161;
export const MODES = ["attempted", "earned", "latest"];

export const GRADES = [
  { grade: "A+", gpa: 4.0, min: 80 },
  { grade: "A", gpa: 3.75, min: 75 },
  { grade: "A-", gpa: 3.5, min: 70 },
  { grade: "B+", gpa: 3.25, min: 65 },
  { grade: "B", gpa: 3.0, min: 60 },
  { grade: "B-", gpa: 2.75, min: 55 },
  { grade: "C+", gpa: 2.5, min: 50 },
  { grade: "C", gpa: 2.25, min: 45 },
  { grade: "D", gpa: 2.0, min: 40 },
  { grade: "F", gpa: 0.0, min: 0 },
];

// Grades the user can pick by hand. "Y" = expelled / not allowed in exam (0 points, not passed).
export const GRADE_OPTIONS = [...GRADES.map((g) => g.grade), "Y"];

export function gradeFromTotal(total) {
  const t = Math.max(0, Number(total) || 0);
  const g = GRADES.find((x) => t >= x.min);
  return { grade: g.grade, gpa: g.gpa };
}

export function gradeToGpa(grade) {
  if (grade === "Y") return 0;
  const g = GRADES.find((x) => x.grade === grade);
  return g ? g.gpa : null;
}

export function isPassed(grade) {
  return grade !== "F" && grade !== "Y";
}

export function creditOf(course) {
  const n = Number(course && course.credit);
  return n > 0 ? n : DEFAULT_CREDIT;
}

// Same course code written differently ("CCE 1103", "cce-1103") is the same course.
export function codeKey(code) {
  return String(code || "").toUpperCase().replace(/[\s-]+/g, "");
}

// ---------- Semester ordering ----------
const TERMS = { spring: 1, summer: 2, autumn: 3, fall: 3, winter: 4 };

function semesterKey(name) {
  const s = String(name || "");
  const y = s.match(/(\d{4})/);
  const t = s.match(/(spring|summer|autumn|fall|winter)/i);
  if (!y || !t) return null;
  return Number(y[1]) * 10 + TERMS[t[1].toLowerCase()];
}

export function compareSemesters(a, b) {
  const ka = semesterKey(a);
  const kb = semesterKey(b);
  if (ka !== null && kb !== null) return ka - kb;
  if (ka !== null) return -1;
  if (kb !== null) return 1;
  return String(a).localeCompare(String(b));
}

const byCreated = (a, b) =>
  (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id));

export function groupBySemester(courses) {
  const map = new Map();
  [...courses].sort(byCreated).forEach((c) => {
    const name = String(c.semester || "").trim() || "Unassigned";
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (!map.has(key)) map.set(key, { name, courses: [] });
    map.get(key).courses.push(c);
  });
  return [...map.values()].sort((a, b) => compareSemesters(a.name, b.name));
}

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
}

// ---------- Totals ----------
// rows must already be in chronological order.
//   credits    = every credit in the rows (used for a single semester's GPA)
//   cumCredits = same, but WITHOUT "Y" (expelled) courses. The official sheet counts a Y course in that
//                semester's GPA but leaves its credits out of "Cumulative Credit Hours" (checked against a real
//                5-semester sheet: attempted CGPA only matches when Y credits are left out).
function tally(rows) {
  let credits = 0;
  let cumCredits = 0;
  let points = 0;
  let completed = 0;
  rows.forEach((r) => {
    credits += r.credit;
    if (r.grade !== "Y") cumCredits += r.credit;
    points += r.credit * (Number(r.gpa) || 0);
    if (isPassed(r.grade)) completed += r.credit;
  });
  return { credits, cumCredits, points, completed };
}

// Keep only the newest attempt of every course code.
function latestOnly(rows) {
  const last = new Map();
  rows.forEach((r, i) => {
    const k = codeKey(r.courseCode);
    last.set(k || "#" + i, r);
  });
  return [...last.values()];
}

// ---------- Main statistics ----------
// Mid + CT + Attendance entered so far for a course whose Final is not out yet (max 50).
export function marksSoFar(c) {
  return (Number(c.mid) || 0) + (Number(c.ct) || 0) + (Number(c.attendance) || 0);
}

export function computeStats(courses, requiredCredits = DEFAULT_REQUIRED_CREDITS) {
  const groups = groupBySemester(courses);

  const rowsBySem = groups.map((g) =>
    g.courses.map((c) => ({ ...c, credit: creditOf(c), retaken: false, isRetake: false, attempt: 1, ongoing: !!c.ongoing }))
  );

  // Retake detection: same course code attempted more than once.
  const lastByCode = new Map();
  rowsBySem.forEach((rows) =>
    rows.forEach((r) => {
      if (r.ongoing) return;
      const code = codeKey(r.courseCode);
      if (!code) return;
      const prev = lastByCode.get(code);
      if (prev) {
        prev.retaken = true; // older attempt
        r.isRetake = true; // newer attempt
        r.attempt = prev.attempt + 1;
      }
      lastByCode.set(code, r);
    })
  );

  const upTo = []; // all rows up to and including the current semester
  const semesters = groups.map((g, i) => {
    const rows = rowsBySem[i];
    const counted = rows.filter((r) => !r.ongoing);
    const ongoingRows = rows.filter((r) => r.ongoing);
    upTo.push(...counted);
    const own = tally(counted);
    const all = tally(upTo);
    const latest = tally(latestOnly(upTo));
    return {
      name: g.name,
      number: i + 1,
      rows,
      ongoingCount: ongoingRows.length,
      ongoingCredits: ongoingRows.reduce((a, r) => a + r.credit, 0),
      inProgress: !counted.length && ongoingRows.length > 0, // only ongoing courses so far: no GPA yet
      credits: own.credits,
      points: own.points,
      completed: own.completed,
      gpa: own.credits ? own.points / own.credits : 0,
      cumCredits: all.cumCredits,
      cumPoints: all.points,
      cumCompleted: all.completed,
      cumLatestCredits: latest.cumCredits,
      cumLatestPoints: latest.points,
      cgpaAttempted: all.cumCredits ? all.points / all.cumCredits : 0,
      cgpaEarned: all.completed ? all.points / all.completed : 0,
      cgpaLatest: latest.cumCredits ? latest.points / latest.cumCredits : 0,
    };
  });

  const flat = rowsBySem.flat();
  const done = flat.filter((r) => !r.ongoing); // ongoing courses have no result yet: they are not counted anywhere
  const ongoing = flat.filter((r) => r.ongoing);
  const ongoingCodes = new Set(ongoing.map((r) => codeKey(r.courseCode)).filter(Boolean));
  const all = tally(done);
  const latest = tally(latestOnly(done));

  // A failed course that is being retaken right now is not "pending" any more.
  const pendingRetakes = done.filter((r) => !isPassed(r.grade) && !r.retaken && !ongoingCodes.has(codeKey(r.courseCode)));
  // Passed but weak (D): worth improving, only if not already retaken.
  const improvable = done.filter((r) => isPassed(r.grade) && Number(r.gpa) <= 2 && !r.retaken && !ongoingCodes.has(codeKey(r.courseCode)));

  return {
    semesters,
    courseCount: courses.length,
    countedCount: done.length,
    ongoingCount: ongoing.length,
    ongoingCredits: ongoing.reduce((a, r) => a + r.credit, 0),
    totalCredits: all.cumCredits,
    totalPoints: all.points,
    completedCredits: all.completed,
    latestCredits: latest.cumCredits,
    latestPoints: latest.points,
    requiredCredits,
    balanceCredits: Math.max(0, requiredCredits - all.completed),
    cgpaAttempted: all.cumCredits ? all.points / all.cumCredits : 0,
    cgpaEarned: all.completed ? all.points / all.completed : 0,
    cgpaLatest: latest.cumCredits ? latest.points / latest.cumCredits : 0,
    pendingRetakes,
    improvable,
  };
}

export function cgpaOf(stats, mode) {
  if (mode === "earned") return stats.cgpaEarned;
  if (mode === "latest") return stats.cgpaLatest;
  return stats.cgpaAttempted;
}

export function semesterCgpa(sem, mode) {
  if (mode === "earned") return sem.cgpaEarned;
  if (mode === "latest") return sem.cgpaLatest;
  return sem.cgpaAttempted;
}

// points + credit base for a basis ("attempted" | "earned" | "latest")
function basisTotals(stats, basis) {
  if (basis === "earned") return { points: stats.totalPoints, base: stats.completedCredits };
  if (basis === "latest") return { points: stats.latestPoints, base: stats.latestCredits };
  return { points: stats.totalPoints, base: stats.totalCredits };
}

// ---------- Target CGPA ----------
// Assumes the next courses are new and passed.
export function requiredGpa(stats, { target, credits, basis }) {
  const { points, base } = basisTotals(stats, basis);
  const needed = (target * (base + credits) - points) / credits;
  const best = (points + 4 * credits) / (base + credits);
  return { needed, best };
}

// Fewest semesters (each `credits` long) at straight 4.00 that would reach the target. Infinity if impossible.
export function semestersNeeded(stats, { target, credits, basis }) {
  const { points, base } = basisTotals(stats, basis);
  const gap = target * base - points; // points still missing on the credits we already have
  if (gap <= 0) return 1;
  if (target >= 4) return Infinity;
  return Math.max(1, Math.ceil(gap / (credits * (4 - target)) - 1e-9));
}

export function whatIfCgpa(stats, { gpa, credits, basis }) {
  const { points, base } = basisTotals(stats, basis);
  const passes = basis === "earned" ? (gpa > 0 ? credits : 0) : credits;
  const denom = base + passes;
  return denom ? (points + gpa * credits) / denom : 0;
}

// CGPA if one course is retaken and ends with `newGrade`.
export function cgpaAfterRetake(courses, row, newGrade, mode, requiredCredits) {
  const sim = {
    id: "__retake_sim__",
    semester: "~ retake (simulated)", // not a real term, so it sorts after every real semester
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    credit: creditOf(row),
    grade: newGrade,
    gpa: gradeToGpa(newGrade),
    createdAt: Number.MAX_SAFE_INTEGER,
  };
  return cgpaOf(computeStats([...courses, sim], requiredCredits), mode);
}

// ---------- Final marks predictor ----------
export const FINAL_MAX = 50;

export function neededFinal(mid, ct, attendance) {
  const have = (Number(mid) || 0) + (Number(ct) || 0) + (Number(attendance) || 0);
  return {
    have,
    list: GRADES.filter((g) => g.grade !== "F").map((g) => {
      const need = g.min - have;
      return {
        grade: g.grade,
        gpa: g.gpa,
        minTotal: g.min,
        need: Math.max(0, need),
        secured: need <= 0,
        reachable: need <= FINAL_MAX,
      };
    }),
  };
}

// ---------- Ongoing courses: "what if" ----------
// picks = { [courseId]: "A-" ... } the grade you expect in each ongoing course (default B+).
// Returns the CGPA you would have if the ongoing courses ended with those grades, plus the GPA of just those courses.
export const DEFAULT_EXPECTED_GRADE = "B+";

export function projectWithGrades(courses, picks, mode, requiredCredits = DEFAULT_REQUIRED_CREDITS) {
  const gradeOf = (c) => (gradeToGpa((picks || {})[c.id]) === null ? DEFAULT_EXPECTED_GRADE : (picks || {})[c.id]);
  const sim = courses.map((c) =>
    c.ongoing ? { ...c, ongoing: false, grade: gradeOf(c), gpa: gradeToGpa(gradeOf(c)) } : c
  );
  const stats = computeStats(sim, requiredCredits);
  const ong = courses.filter((c) => c.ongoing);
  const credits = ong.reduce((a, c) => a + creditOf(c), 0);
  const points = ong.reduce((a, c) => a + creditOf(c) * gradeToGpa(gradeOf(c)), 0);
  return { stats, cgpa: cgpaOf(stats, mode), semesterGpa: credits ? points / credits : 0, credits };
}

