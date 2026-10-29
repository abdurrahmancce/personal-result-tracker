// parser.js — turns the text of the university "Result View" page (copied and pasted) into semesters + courses.
// Pure function, no DOM. Works with tabs or spaces, and with Windows line endings.
import { gradeToGpa } from "./calc.js";

const SEM_RE = /^Semester:\s*(.+?)\s+Semester Enrolled:\s*(.+?)\s*$/i;
const ROW_RE =
  /^\s*(\d{1,3})\s+(?:\d{4}\s+)?([A-Za-z]{2,6}[ -]?\d{3,4}[A-Za-z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(A\+|A-|A|B\+|B-|B|C\+|C|D|F|Y)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*(.*?)\s*$/;
const TOTAL_RE = /Total Credit Hours\s+([\d.]+)\s+GPA\s+([\d.]+)/i;
const CUM_RE = /Cumulative Credit Hours\s+([\d.]+)\s+CGPA \(Attempted Credits\)\s+([\d.]+)/i;
const EARNED_RE = /CGPA \(Earned Credits\):\s*([\d.]+)/i;
const REQUIRED_RE = /Total Required Credit:\s*([\d.]+)/i;

export function parseResultText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const semesters = [];
  const skipped = [];
  let cur = null;
  let requiredCredits = null;

  const ensure = () => {
    if (!cur) {
      cur = { name: "Imported", enrolled: "", courses: [], reported: {} };
      semesters.push(cur);
    }
    return cur;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    let m = line.match(SEM_RE);
    if (m) {
      cur = { name: m[1].trim(), enrolled: m[2].trim(), courses: [], reported: {} };
      semesters.push(cur);
      continue;
    }
    if ((m = line.match(REQUIRED_RE))) requiredCredits = Number(m[1]);
    if (cur && (m = line.match(TOTAL_RE))) {
      cur.reported.credits = Number(m[1]);
      cur.reported.gpa = Number(m[2]);
    }
    if (cur && (m = line.match(CUM_RE))) {
      cur.reported.cumCredits = Number(m[1]);
      cur.reported.cgpaAttempted = Number(m[2]);
    }
    if (cur && (m = line.match(EARNED_RE))) cur.reported.cgpaEarned = Number(m[1]);

    m = line.match(ROW_RE);
    if (m) {
      const grade = m[5];
      ensure().courses.push({
        courseCode: m[2].replace(/\s+/, "-").toUpperCase(),
        courseTitle: m[3].trim(),
        credit: Number(m[4]),
        grade,
        gpa: gradeToGpa(grade),
        comment: m[8] || "",
      });
    } else if (/^\d{1,3}\s/.test(line) && /[A-Za-z]{2,6}-?\d{3,4}/.test(line)) {
      skipped.push(line); // looked like a course row but didn't parse
    }
  }

  return {
    semesters: semesters.filter((s) => s.courses.length),
    requiredCredits,
    skipped,
  };
}
