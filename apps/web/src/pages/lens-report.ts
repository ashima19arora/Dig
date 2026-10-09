import Highcharts from "highcharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LensComparison } from "./LensCharts";

interface CountRow { label: string; count: number }

export interface ReportInput {
  dataset: string;
  generatedAt: string;
  summary: { records: number; avgConfidence: number; contactablePct: number; highPriority: number };
  comparison: LensComparison;
  changes: { added: number; removed: number; changed: number; conflicts: number; newContactPaths: number };
  funnel: CountRow[];
  confidence: CountRow[];
  contactability: CountRow[];
  locations: CountRow[];
  roles: CountRow[];
  categories: CountRow[];
  sources: CountRow[];
  metrics: Record<string, number | null>;
  signal: string | null;
  recommendation: string | null;
}

const PALETTE = ["#ff7a45", "#ffb020", "#f2c14e", "#7c6cf0", "#5b8def", "#3db8c9", "#3dbe7a", "#e85d75"];
const INK: [number, number, number] = [29, 29, 31];
const MUTED: [number, number, number] = [110, 110, 115];
const BLUE: [number, number, number] = [43, 134, 214];

export async function downloadLensReport(input: ReportInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `Dig Lens · ${input.dataset}`, creator: "Dig" });
  const cursor = { y: 16 };
  const title = input.dataset;

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, 210, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Dig Lens", 14, 11);
  doc.setFontSize(16);
  doc.text(doc.splitTextToSize(title, 182)[0] ?? title, 14, 20);
  cursor.y = 36;
  paragraph(doc, cursor, title, `${input.generatedAt}  ·  Counts are from this dataset.`, 10, MUTED);

  cards(doc, cursor, [
    ["Organizations", String(input.summary.records)],
    ["Avg confidence", `${input.summary.avgConfidence}%`],
    ["Contactable", `${input.summary.contactablePct}%`],
    ["High priority", String(input.summary.highPriority)],
  ]);

  if (input.signal) paragraph(doc, cursor, title, input.signal, 11, INK);
  if (input.recommendation) paragraph(doc, cursor, title, input.recommendation, 11, INK);

  sectionTitle(doc, cursor, title, "Before and after");
  if (!input.comparison.comparable || input.comparison.beforeRecords === null || input.comparison.net === null) {
    paragraph(doc, cursor, title, `This is the first snapshot, so there is no earlier record count beside the ${input.comparison.afterRecords} organizations in this run.`, 11, INK);
    table(doc, cursor, title, [["Measure", "Count"]], [
      ["Organizations in this run", String(input.comparison.afterRecords)],
      ["New contact paths", String(input.changes.newContactPaths)],
      ["Open conflicts", String(input.changes.conflicts)],
    ]);
  } else {
    table(doc, cursor, title, [["Measure", "Count"]], [
      ["Records before", String(input.comparison.beforeRecords)],
      ["Records after", String(input.comparison.afterRecords)],
      ["Added", String(input.comparison.added)],
      ["Removed", String(input.comparison.removed)],
      ["Changed", String(input.comparison.changed)],
      ["Unchanged", String(input.comparison.unchanged)],
      ["Net", String(input.comparison.net)],
      ["New contact paths", String(input.changes.newContactPaths)],
      ["Open conflicts", String(input.changes.conflicts)],
    ]);
  }

  await drawChart(doc, cursor, title, "Research funnel", "column", input.funnel, true);
  await drawPair(doc, cursor, title, [
    ["Confidence", input.confidence],
    ["Contactability", input.contactability],
  ]);
  await drawChart(doc, cursor, title, "Locations", "bar", input.locations, false);
  await drawChart(doc, cursor, title, "Roles", "column", input.roles, false);
  await drawChart(doc, cursor, title, "Categories", "bar", input.categories, false);
  await drawChart(doc, cursor, title, "Sources", "bar", input.sources, false);

  const details: Array<[string, CountRow[], boolean]> = [
    ["Research funnel", input.funnel, true],
    ["Confidence", input.confidence, true],
    ["Contactability", input.contactability, true],
    ["Locations", input.locations, false],
    ["Roles", input.roles, false],
    ["Categories", input.categories, false],
    ["Sources", input.sources, false],
  ];
  let detailHeading = false;
  for (const [name, rows, keepEmpty] of details) {
    const body = shareRows(rows, keepEmpty);
    if (!body.length) continue;
    room(doc, cursor, title, detailHeading ? 28 : 36);
    if (!detailHeading) {
      sectionTitle(doc, cursor, title, "Calculated detail");
      detailHeading = true;
    }
    sectionTitle(doc, cursor, title, name);
    table(doc, cursor, title, [["Name", "Count", "Share"]], body);
  }

  const metrics = [
    ["Verified", input.metrics.verified],
    ["Needs review", input.metrics.needsReview],
    ["Possible duplicates", input.metrics.possibleDuplicates],
    ["Incomplete", input.metrics.incomplete],
    ["Sources counted", input.metrics.sourceCount],
    ["Outreach marks", input.metrics.outreach],
    ["Interested", input.metrics.interested],
    ["Declined", input.metrics.declined],
  ].filter((row): row is [string, number] => typeof row[1] === "number");
  if (metrics.length) {
    room(doc, cursor, title, 16 + metrics.length * 7);
    sectionTitle(doc, cursor, title, "Record status");
    table(doc, cursor, title, [["Measure", "Count"]], metrics.map(([label, value]) => [label, String(value)]));
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Dig Lens", 14, 290);
    doc.text(`${page} / ${pages}`, 196, 290, { align: "right" });
  }
  await doc.save(`dig-lens-${slug(title)}.pdf`);
}

function cards(doc: jsPDF, cursor: { y: number }, items: Array<[string, string]>) {
  room(doc, cursor, "", 22);
  const width = 43;
  items.forEach((item, index) => {
    const x = 14 + index * (width + 3.3);
    doc.setFillColor(232, 242, 252);
    doc.roundedRect(x, cursor.y, width, 18, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(item[0], x + 3, cursor.y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(item[1], x + 3, cursor.y + 13);
  });
  cursor.y += 24;
}

function sectionTitle(doc: jsPDF, cursor: { y: number }, runningTitle: string, text: string) {
  room(doc, cursor, runningTitle, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BLUE);
  doc.text(text, 14, cursor.y);
  cursor.y += 6;
}

function paragraph(doc: jsPDF, cursor: { y: number }, runningTitle: string, text: string, size: number, color: [number, number, number]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, 182);
  room(doc, cursor, runningTitle, lines.length * 5 + 2);
  doc.setTextColor(...color);
  doc.text(lines, 14, cursor.y);
  cursor.y += lines.length * 5 + 2;
}

function table(doc: jsPDF, cursor: { y: number }, runningTitle: string, head: string[][], body: string[][]) {
  room(doc, cursor, runningTitle, 18);
  const columnStyles: Record<string, { halign?: "right"; cellWidth: number }> = head[0]?.length === 3
    ? { 0: { cellWidth: 120 }, 1: { halign: "right", cellWidth: 31 }, 2: { halign: "right", cellWidth: 31 } }
    : { 0: { cellWidth: 146 }, 1: { halign: "right", cellWidth: 36 } };
  autoTable(doc, {
    startY: cursor.y,
    margin: { left: 14, right: 14, bottom: 18 },
    head,
    body,
    theme: "plain",
    pageBreak: body.length <= 14 ? "avoid" : "auto",
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 2.2, lineColor: [230, 230, 232], lineWidth: 0.1 },
    headStyles: { fillColor: [232, 242, 252], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles,
  });
  cursor.y = lastTableY(doc) + 6;
}

function shareRows(rows: CountRow[], keepEmpty: boolean) {
  const shown = keepEmpty ? rows : rows.filter((row) => row.count > 0);
  const total = shown.reduce((sum, row) => sum + row.count, 0);
  if (!shown.length || !total) return [];
  const portions = portionsOf(shown.map((row) => row.count), total);
  return shown.map((row, index) => [row.label, String(row.count), `${portions[index]}%`]);
}

function portionsOf(counts: number[], total: number) {
  const exact = counts.map((count) => (count / total) * 100);
  const whole = exact.map((value) => Math.floor(value));
  let remainder = 100 - whole.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (remainder <= 0) break;
    whole[item.index] += 1;
    remainder -= 1;
  }
  return whole;
}

async function drawChart(doc: jsPDF, cursor: { y: number }, runningTitle: string, title: string, kind: "column" | "bar", rows: CountRow[], keepEmpty: boolean) {
  const shown = keepEmpty ? rows : rows.filter((row) => row.count > 0);
  const image = await chartImage(kind, shown);
  if (!image) return;
  const height = Math.min(110, image.heightMm);
  room(doc, cursor, runningTitle, height + 12);
  sectionTitle(doc, cursor, runningTitle, title);
  doc.addImage(image.data, "JPEG", 14, cursor.y, 182, height);
  doc.setDrawColor(230, 230, 232);
  doc.rect(14, cursor.y, 182, height, "S");
  cursor.y += height + 6;
}

async function drawPair(doc: jsPDF, cursor: { y: number }, runningTitle: string, charts: Array<[string, CountRow[]]>) {
  const images = await Promise.all(charts.map(async ([label, rows]) => ({ label, image: await chartImage("pie", rows.filter((row) => row.count > 0), 340, 280) })));
  const ready = images.filter((item) => item.image);
  if (!ready.length) return;
  room(doc, cursor, runningTitle, 78);
  ready.forEach((item, index) => {
    const x = 14 + index * 94;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BLUE);
    doc.text(item.label, x, cursor.y);
    if (!item.image) return;
    doc.addImage(item.image.data, "JPEG", x, cursor.y + 3, 88, 64);
    doc.setDrawColor(230, 230, 232);
    doc.rect(x, cursor.y + 3, 88, 64, "S");
  });
  cursor.y += 74;
}

function room(doc: jsPDF, cursor: { y: number }, runningTitle: string, height: number) {
  if (cursor.y + height <= 276) return;
  doc.addPage();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (runningTitle) doc.text(doc.splitTextToSize(runningTitle, 140)[0] ?? runningTitle, 14, 12);
  cursor.y = 18;
}

function lastTableY(doc: jsPDF) {
  const placed = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  return placed.lastAutoTable?.finalY ?? cursorFallback();
}

function cursorFallback() {
  return 16;
}

async function chartImage(kind: "column" | "bar" | "pie", rows: CountRow[], width = 680, height = 0) {
  if (!rows.length) return null;
  const pixelHeight = height || (kind === "bar" ? Math.min(520, Math.max(200, rows.length * 36 + 36)) : 250);
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${pixelHeight}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  try {
    const points = rows.map((row, index) => ({ name: row.label, y: row.count, color: PALETTE[index % PALETTE.length] }));
    const labelStyle = { color: "#1d1d1f", fontSize: "12px", fontWeight: "500", textOutline: "none" };
    const singleSlice = kind === "pie" && rows.length === 1;
    const chart = Highcharts.chart(host, {
      chart: { type: kind, backgroundColor: "#ffffff", animation: false, width, height: pixelHeight, spacing: [12, 12, 12, 12], style: { fontFamily: "Helvetica, Arial, sans-serif" } },
      title: singleSlice
        ? { text: rows[0]?.label ?? "", align: "center", verticalAlign: "middle", y: -4, style: { color: "#1d1d1f", fontSize: "14px", fontWeight: "600" } }
        : { text: undefined },
      subtitle: singleSlice
        ? { text: String(rows[0]?.count ?? ""), align: "center", verticalAlign: "middle", y: 16, style: { color: "#1d1d1f", fontSize: "20px", fontWeight: "700" } }
        : { text: undefined },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: { enabled: false },
      xAxis: { categories: rows.map((row) => row.label), reversed: kind === "bar", labels: { style: { color: "#1d1d1f", fontSize: "12px" } }, lineColor: "#e6e6e8" },
      yAxis: { title: { text: undefined }, allowDecimals: false, gridLineColor: "#e6e6e8", labels: { style: { color: "#6e6e73", fontSize: "11px" } } },
      tooltip: { enabled: false },
      plotOptions: {
        column: { borderWidth: 0, borderRadius: 3, colorByPoint: true, animation: false, dataLabels: { enabled: true, crop: false, overflow: "allow", style: labelStyle } },
        bar: { borderWidth: 0, borderRadius: 3, colorByPoint: true, animation: false, dataLabels: { enabled: true, crop: false, overflow: "allow", style: labelStyle } },
        pie: { innerSize: "62%", borderWidth: 2, borderColor: "#ffffff", dataLabels: { enabled: !singleSlice, distance: 16, format: "{point.name}: {point.y}", style: labelStyle }, animation: false },
        series: { animation: false },
      },
      series: [{ type: kind, name: "Rows", data: points }],
    });
    const svg = chart.container.querySelector("svg")?.outerHTML ?? "";
    chart.destroy();
    if (!svg) return null;
    const markup = svg.includes("xmlns=") ? svg : svg.replace("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"");
    return { data: await svgToJpeg(markup, width, pixelHeight), heightMm: 182 * (pixelHeight / width) };
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

function svgToJpeg(svg: string, width: number, height: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not draw the chart."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not draw the chart."));
    };
    image.src = url;
  });
}

function slug(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 48) || "dataset";
}
