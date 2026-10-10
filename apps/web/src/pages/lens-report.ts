import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LensView } from "./lens-insights";

// Same black-and-white style as the list report.
const INK: [number, number, number] = [0, 0, 0];
const GREY: [number, number, number] = [95, 95, 95];
const RULE: [number, number, number] = [200, 200, 200];

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lens";
}

/** The Lens page as a document: the same insights, one after another, in plain black and white. */
export async function downloadLensReport(input: { name: string; kind: string; query: string; view: LensView }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const width = pageWidth - margin * 2;
  doc.setProperties({ title: `${input.name} insights`, subject: input.query, creator: "Dig" });

  let y = margin + 2;
  doc.setTextColor(...GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${input.kind}  ·  ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, margin, y);

  y += 7;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(doc.splitTextToSize(input.name, width)[0] ?? input.name, margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY);
  const query = doc.splitTextToSize(`Query: ${input.query}`, width) as string[];
  doc.text(query, margin, y);
  y += query.length * 4.4 + 1;
  doc.text(input.view.stats.map((stat) => `${stat.label}: ${stat.value}`).join("   ·   "), margin, y);

  y += 3.5;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  for (const section of input.view.sections) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(section.title, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    const takeaway = doc.splitTextToSize(section.takeaway, width) as string[];
    doc.text(takeaway, margin, y);
    y += takeaway.length * 4;

    const rows = section.bars?.length
      ? section.bars.map((bar) => [bar.label, String(bar.count)])
      : (section.names ?? []).map((item) => [item.name, item.detail ?? ""]);
    if (rows.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, top: margin, bottom: 16 },
        body: rows,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 0, right: 2 }, overflow: "linebreak" },
        bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: RULE },
        columnStyles: section.bars?.length ? { 0: { cellWidth: width - 25 }, 1: { cellWidth: 25, halign: "right" } } : { 0: { cellWidth: width * 0.45, fontStyle: "bold" } },
      });
      y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    }
    y += 2;
  }

  if (input.view.sourcesLine) {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = margin;
    }
    y += 6;
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(input.view.sourcesLine, width) as string[], margin, y);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.1);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(`Dig  ·  ${input.name}`, margin, pageHeight - 6);
    const label = `Page ${page} of ${pages}`;
    doc.text(label, pageWidth - margin - doc.getTextWidth(label), pageHeight - 6);
  }

  doc.save(`dig-${slug(input.name)}-insights.pdf`);
}
