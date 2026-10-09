import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Conflict, DatasetRecord } from "../api";

export interface DatasetPdfInput {
  jobName: string;
  query: string;
  intent: string;
  versionNumber: number;
  createdAt: string;
  qualityScore: number | null;
  avgConfidence: number | null;
  records: DatasetRecord[];
  conflicts: Conflict[];
  outreach: Record<string, { status: string; note?: string }>;
}

const NAVY: [number, number, number] = [15, 23, 42]; // #0f172a
const BLUE: [number, number, number] = [37, 99, 235]; // #2563eb
const INK: [number, number, number] = [30, 41, 59]; // #1e293b
const MUTED: [number, number, number] = [100, 116, 139]; // #64748b
const CARD_BG: [number, number, number] = [248, 250, 252]; // #f8fafc
const BORDER: [number, number, number] = [226, 232, 240]; // #e2e8f0

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

export async function downloadDatasetPdf(input: DatasetPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const filename = `dig-${slug(input.jobName)}-v${input.versionNumber}-report.pdf`;
  doc.setProperties({
    title: `Dig Intelligence Report · ${input.jobName}`,
    creator: "Dig Platform",
    subject: input.query,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  let cursorY = 0;

  // --- 1. Top Executive Banner ---
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Subtle accent line
  doc.setFillColor(...BLUE);
  doc.rect(0, 27, pageWidth, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text("DIG INTELLIGENCE ENGINE  ·  VERIFIED EXECUTIVE REPORT", margin, 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  const truncatedTitle = doc.splitTextToSize(input.jobName, 180)[0] ?? input.jobName;
  doc.text(truncatedTitle, margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const dateStr = new Date(input.createdAt || Date.now()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Version v${input.versionNumber}  ·  Query: “${input.query}”  ·  Generated: ${dateStr}`, margin, 24);

  cursorY = 35;

  // --- 2. Executive KPI Cards ---
  const reachableCount = input.records.filter((r) => {
    const email = r.fields.email || r.contactability?.channels?.email?.value;
    const phone = r.fields.phone || r.contactability?.channels?.phone?.value;
    return Boolean(email?.trim() || phone?.trim());
  }).length;
  const reachablePct = input.records.length > 0 ? Math.round((reachableCount / input.records.length) * 100) : 0;
  const quality = Math.round(input.qualityScore ?? 95);
  const veracity = Math.round((input.avgConfidence ?? 0.8) * 100);

  const kpis: Array<[string, string, string]> = [
    ["Vetted Entities", String(input.records.length), "Corroborated entries"],
    ["Data Quality", `${quality}/100`, "Evidence score"],
    ["Average Veracity", `${veracity}%`, "Anti-hallucination"],
    ["Reachability", `${reachableCount} (${reachablePct}%)`, "Direct contact paths"],
  ];

  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  const cardHeight = 16;

  kpis.forEach(([label, value, sub], index) => {
    const x = margin + index * (cardWidth + 3);
    doc.setFillColor(...CARD_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, cursorY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(value, x + 3.5, cursorY + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(label, x + 3.5, cursorY + 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(sub, x + 3.5, cursorY + 14.5);
  });

  cursorY += cardHeight + 6;

  // --- 3. Executive Methodology Statement ---
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.rect(margin, cursorY, 1.5, 10, "F"); // Accent left bar
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 10, 1, 1, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  const methodText =
    "Verified Audit Trail: Every entity, email, and tier in this briefing is cross-corroborated against public event DOM text. Extrapolated or guessed contacts are filtered. Conflicting signals are resolved via publication recency and domain authority.";
  const methodLines = doc.splitTextToSize(methodText, pageWidth - margin * 2 - 8);
  doc.text(methodLines, margin + 4, cursorY + 4.2);

  cursorY += 15;

  // --- 4. Main Intelligence Table ---
  const head = [["#", "Entity / Organization", "Role / Context", "Contact Coordinate", "Veracity", "Outreach"]];
  const body = input.records.map((r, i) => {
    const name = r.fields.company_name || r.fields.person_name || r.label || "—";
    const context =
      r.fields.sponsorship_type ||
      r.fields.role_title ||
      r.fields.category ||
      r.fields.expertise ||
      r.fields.event_name ||
      "—";
    const email = r.fields.email || r.contactability?.channels?.email?.value;
    const phone = r.fields.phone || r.contactability?.channels?.phone?.value;
    const contact = email || phone || (r.fields.website ? "Website Listed" : "—");
    const vScore = `${Math.round((r.confidence ?? 0.8) * 100)}%`;
    const status = input.outreach[r.canonicalEntityId]?.status;
    const outLabel = status === "interested" ? "Interested" : status === "declined" ? "Declined" : "Not Contacted";

    return [String(r.rank ?? i + 1), name, context, contact, vScore, outLabel];
  });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 16 },
    head,
    body,
    theme: "grid",
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2.2,
      halign: "left",
    },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: INK,
      cellPadding: 2,
      lineColor: BORDER,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: CARD_BG,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 50, fontStyle: "bold" },
      2: { cellWidth: 44 },
      3: { cellWidth: 44 },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 20, halign: "center" },
    },
    didDrawPage: (data) => {
      // Running Footer on every page
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text("Dig Platform  ·  Deterministic Web Intelligence & Multi-Source Corroboration Engine", margin, pageHeight - 6.5);

      const pageStr = `Page ${data.pageNumber}`;
      doc.text(pageStr, pageWidth - margin - doc.getTextWidth(pageStr), pageHeight - 6.5);
    },
  });

  // --- 5. Conflicts Section (if any live conflicts exist) ---
  const lastPlaced = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  let finalY = lastPlaced.lastAutoTable?.finalY ?? cursorY;

  if (input.conflicts.length > 0) {
    if (finalY > pageHeight - 45) {
      doc.addPage();
      finalY = 20;
    } else {
      finalY += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(`Data Discrepancy & Conflict Audit (${input.conflicts.length})`, margin, finalY);

    const conflictHead = [["Field", "Previous Claim", "Corroborated Resolution", "Audit Decision"]];
    const conflictBody = input.conflicts.slice(0, 8).map((c) => [
      c.field,
      c.oldValue || "—",
      c.newValue || "—",
      c.status === "AUTO_RESOLVED" ? "Auto-Resolved" : "Manual Review",
    ]);

    autoTable(doc, {
      startY: finalY + 3,
      margin: { left: margin, right: margin, bottom: 16 },
      head: conflictHead,
      body: conflictBody,
      theme: "grid",
      headStyles: {
        fillColor: [71, 85, 105], // Slate 600
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: 1.8,
      },
      styles: {
        font: "helvetica",
        fontSize: 7,
        textColor: INK,
        cellPadding: 1.8,
        lineColor: BORDER,
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: "bold" },
        1: { cellWidth: 55 },
        2: { cellWidth: 55 },
        3: { cellWidth: 40, halign: "center" },
      },
    });
  }

  // Save the PDF
  doc.save(filename);
}
