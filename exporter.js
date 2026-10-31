// exporter.js — CSV (opens in Excel) and PDF downloads. No Firebase, only needs the computed stats.
import { cgpaOf } from "./calc.js";

// PDF libraries: a copy hosted in this repository (vendor/) is used first, because it cannot change behind our back.
// If the copy is not there, the same versions are loaded from cdnjs.
const JSPDF_URLS = ["vendor/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
const AUTOTABLE_URLS = ["vendor/jspdf.plugin.autotable.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"];

const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const hasMarks = (r) => r.total !== undefined && r.total !== null && r.total !== "";

function csvCell(v) {
  let s = v === undefined || v === null ? "" : String(v);
  // stop spreadsheet formula injection from text typed into the app
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(stats) {
  const head = [
    "Semester", "Course Code", "Course Title", "Credit", "Mid", "CT", "Attendance", "Final",
    "Total", "Grade", "Grade Point", "Credit x Point", "Note",
  ];
  const lines = [head.map(csvCell).join(",")];
  stats.semesters.forEach((sem) => {
    sem.rows.forEach((r) => {
      if (r.ongoing) {
        // ongoing: keep the marks typed so far, no grade, clearly marked, not part of any total
        lines.push([sem.name, r.courseCode, r.courseTitle, r.credit, r.mid ?? "", r.ct ?? "", r.attendance ?? "", "", "", "", "", "", "Ongoing (not counted)"].map(csvCell).join(","));
        return;
      }
      const m = hasMarks(r);
      lines.push(
        [
          sem.name, r.courseCode, r.courseTitle, r.credit,
          m ? r.mid : "", m ? r.ct : "", m ? r.attendance : "", m ? r.final : "", m ? r.total : "",
          r.grade, f2(Number(r.gpa) || 0), f3(r.credit * (Number(r.gpa) || 0)),
          r.isRetake ? "Retake" : r.comment || "",
        ].map(csvCell).join(",")
      );
    });
  });
  lines.push("");
  lines.push(["", "CGPA (Attempted)", f3(stats.cgpaAttempted)].map(csvCell).join(","));
  lines.push(["", "CGPA (Earned)", f3(stats.cgpaEarned)].map(csvCell).join(","));
  lines.push(["", "CGPA (Retake replaces)", f3(stats.cgpaLatest)].map(csvCell).join(","));
  // BOM so Excel reads UTF-8 correctly
  return "﻿" + lines.join("\r\n");
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCSV(filename, stats) {
  downloadBlob(filename, new Blob([toCSV(stats)], { type: "text/csv;charset=utf-8" }));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    if (/^https?:/.test(src)) { s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer"; }
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error("Could not load " + src)); };
    document.head.appendChild(s);
  });
}
async function loadFirst(urls, ready) {
  let last;
  for (const u of urls) {
    try { await loadScript(u); if (ready()) return; } catch (err) { last = err; }
  }
  throw last || new Error("Could not load the PDF library");
}

// jsPDF's built-in fonts only know Latin text; anything else becomes "?".
const pdfText = (s) => String(s ?? "").replace(/[^\x20-\x7E -ÿ‘’“”–—]/g, "?");

export async function makePDF({ profileName, stats, mode }) {
  if (!window.jspdf) await loadFirst(JSPDF_URLS, () => !!window.jspdf);
  if (!window.jspdf.jsPDF.API.autoTable) await loadFirst(AUTOTABLE_URLS, () => !!window.jspdf.jsPDF.API.autoTable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Result Sheet", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(pdfText(profileName || ""), margin, 22);
  doc.setTextColor(110);
  doc.text("Generated " + new Date().toLocaleDateString("en-GB"), pageW - margin, 22, { align: "right" });
  doc.setTextColor(0);

  const sum = [
    ["CGPA (Attempted credits)", f3(stats.cgpaAttempted)],
    ["CGPA (Earned credits)", f3(stats.cgpaEarned)],
    ["CGPA (Retake replaces old grade)", f3(stats.cgpaLatest)],
    ["Credits attempted / completed / required", `${stats.totalCredits} / ${stats.completedCredits} / ${stats.requiredCredits}`],
  ];
  doc.autoTable({
    startY: 26,
    body: sum,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 } },
    margin: { left: margin, right: margin },
  });

  const withMarks = stats.semesters.some((s) => s.rows.some((r) => !r.ongoing && hasMarks(r)));
  const columns = ["Code", "Course title", "Cr", ...(withMarks ? ["Mid", "CT", "Att", "Final", "Total"] : []), "Grade", "Point", "Cr x Pt"];

  stats.semesters.filter((s) => !s.inProgress).forEach((sem) => {
    const y0 = doc.lastAutoTable.finalY + 6;
    const body = sem.rows.filter((r) => !r.ongoing).map((r) => {
      const m = hasMarks(r);
      return [
        pdfText(r.courseCode),
        pdfText(r.courseTitle) + (r.isRetake ? " (retake)" : ""),
        r.credit,
        ...(withMarks ? (m ? [r.mid, r.ct, r.attendance, r.final, r.total] : ["", "", "", "", ""]) : []),
        r.grade,
        f2(Number(r.gpa) || 0),
        f3(r.credit * (Number(r.gpa) || 0)),
      ];
    });
    doc.autoTable({
      startY: y0,
      head: [
        [{ content: pdfText(`${sem.name}   |   GPA ${f3(sem.gpa)}   |   ${sem.credits} credits   |   CGPA ${f3(cgpaOf({ cgpaAttempted: sem.cgpaAttempted, cgpaEarned: sem.cgpaEarned, cgpaLatest: sem.cgpaLatest }, mode))}`), colSpan: columns.length, styles: { halign: "left", fillColor: [15, 118, 110] } }],
        columns,
      ],
      body,
      styles: { fontSize: 8, cellPadding: 1.4 },
      headStyles: { fillColor: [63, 158, 90], textColor: 255 },
      columnStyles: { 1: { cellWidth: withMarks ? 52 : 80 } },
      margin: { left: margin, right: margin },
      didParseCell: (d) => {
        if (d.section === "head" && d.row.index === 0) d.cell.styles.fillColor = [15, 118, 110];
      },
    });
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Page ${i} of ${pages}`, pageW / 2, 290, { align: "center" });
  }
  return doc.output("blob");
}
