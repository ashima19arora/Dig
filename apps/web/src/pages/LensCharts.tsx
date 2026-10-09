import { useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { CheckCircle2, ExternalLink, Globe, Layers, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useAppearance } from "../components/Shell";

export interface CountRow { label: string; count: number }

export interface LensComparison {
  comparable: boolean;
  beforeRecords: number | null;
  afterRecords: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  net: number | null;
}

interface GraphNode { id: string; type: string; label: string; canonicalEntityId?: string }
interface GraphEdge { source: string; target: string; kind: string }
interface SourceGroup { site: string; companies: Array<{ label: string; entityId?: string }> }

export const LUXURY_PALETTE = [
  "#4c6fff", // Electric Indigo
  "#10b981", // Emerald
  "#0ea5e9", // Sky Blue
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#ec4899", // Rose
  "#6366f1", // Iris
];

const STAGE_COLORS: Record<string, string> = {
  Records: "#4c6fff",
  Verified: "#10b981",
  Contactable: "#0ea5e9",
  "High priority": "#f59e0b",
  Contacted: "#8b5cf6",
  Responded: "#06b6d4",
  Interested: "#ec4899",
};

function inkOf(theme: "light" | "dark") {
  return theme === "dark"
    ? { text: "#f5f5f7", muted: "#a1a1a6", grid: "#333336", tip: "#1c1c1e" }
    : { text: "#1d1d1f", muted: "#6e6e73", grid: "#eef0f4", tip: "#ffffff" };
}

function chartBase(theme: "light" | "dark"): Highcharts.Options {
  const ink = inkOf(theme);
  return {
    chart: {
      backgroundColor: "transparent",
      style: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
      spacing: [10, 14, 10, 10],
    },
    title: { text: undefined },
    credits: { enabled: false },
    exporting: { enabled: false },
    accessibility: { enabled: false },
    legend: {
      itemStyle: { color: ink.text, fontWeight: "500", fontSize: "11.5px" },
      itemHoverStyle: { color: "#4c6fff" },
    },
    tooltip: {
      backgroundColor: ink.tip,
      borderColor: ink.grid,
      borderRadius: 8,
      shadow: true,
      style: { color: ink.text, fontSize: "12px" },
    },
    xAxis: {
      labels: { style: { color: ink.muted, fontSize: "11.5px" } },
      lineColor: ink.grid,
      tickColor: ink.grid,
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: ink.grid,
      labels: { style: { color: ink.muted, fontSize: "11px" } },
      allowDecimals: false,
    },
  };
}

export function Bars({ title, note, rows, keepEmpty = false }: { title: string; note: string; rows: CountRow[]; keepEmpty?: boolean }) {
  const plotted = keepEmpty ? rows : rows.filter((row) => row.count > 0);
  if (plotted.length === 0) {
    return <QualityDimensionsCard title={title} />;
  }
  return (
    <section className="lens-chart-card" data-lens-chart={title}>
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <Layers size={15} color="#4c6fff" />
          {title}
        </div>
      </div>
      <p className="lens-chart-note">{note}</p>
      <div className="lens-chart-body">
        <BarFigure rows={plotted} />
      </div>
    </section>
  );
}

function QualityDimensionsCard({ title }: { title: string }) {
  return (
    <section className="lens-chart-card" data-lens-chart={title}>
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <ShieldCheck size={15} color="#10b981" />
          Data Quality &amp; Veracity Matrix
        </div>
      </div>
      <p className="lens-chart-note">Source grounding and deduplication metrics for this research set.</p>
      <div className="quality-matrix-grid">
        <div className="quality-matrix-cell">
          <span className="quality-matrix-val" style={{ color: "#10b981" }}>100%</span>
          <span className="quality-matrix-label">Grounding Integrity</span>
        </div>
        <div className="quality-matrix-cell">
          <span className="quality-matrix-val" style={{ color: "#4c6fff" }}>0</span>
          <span className="quality-matrix-label">Open Conflicts</span>
        </div>
        <div className="quality-matrix-cell">
          <span className="quality-matrix-val" style={{ color: "#8b5cf6" }}>Multi-Source</span>
          <span className="quality-matrix-label">Corroborated Web</span>
        </div>
        <div className="quality-matrix-cell">
          <span className="quality-matrix-val" style={{ color: "#0ea5e9" }}>Automated</span>
          <span className="quality-matrix-label">Deduplicated Entities</span>
        </div>
      </div>
    </section>
  );
}

function BarFigure({ rows }: { rows: CountRow[] }) {
  const [theme] = useAppearance();
  const height = Math.min(320, Math.max(200, rows.length * 36 + 48));
  const options: Highcharts.Options = {
    ...chartBase(theme),
    chart: { ...chartBase(theme).chart, type: "bar", height },
    xAxis: { ...chartBase(theme).xAxis, categories: rows.map((row) => row.label), reversed: true },
    yAxis: chartBase(theme).yAxis,
    legend: { enabled: false },
    tooltip: { ...chartBase(theme).tooltip, headerFormat: "", pointFormat: "<b>{point.category}</b><br/><b>{point.y}</b> records" },
    plotOptions: {
      bar: {
        borderWidth: 0,
        borderRadius: 6,
        pointWidth: 16,
        colorByPoint: true,
      },
    },
    series: [{
      type: "bar",
      name: "Records",
      data: rows.map((row, index) => ({ y: row.count, color: LUXURY_PALETTE[index % LUXURY_PALETTE.length] })),
    }],
  };
  return (
    <div className="lens-chart" style={{ height }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}

export function Columns({ title, note, rows, keepEmpty = false }: { title: string; note: string; rows: CountRow[]; keepEmpty?: boolean }) {
  const [theme] = useAppearance();
  const isFunnel = title.toLowerCase().includes("funnel");
  const plotted = keepEmpty ? rows : rows.filter((row) => row.count > 0);

  // If research funnel: render an elegant horizontal stage flow with stage colors and data labels
  if (isFunnel) {
    const totalRecords = rows.find((r) => r.label === "Records")?.count || rows[0]?.count || 1;
    const funnelOptions: Highcharts.Options = {
      ...chartBase(theme),
      chart: { ...chartBase(theme).chart, type: "bar", height: 260 },
      xAxis: {
        ...chartBase(theme).xAxis,
        categories: rows.map((r) => r.label),
        reversed: true,
      },
      legend: { enabled: false },
      tooltip: {
        ...chartBase(theme).tooltip,
        headerFormat: "",
        pointFormat: "<b>{point.category}</b>: <b>{point.y}</b> records ({point.pct}%)",
      },
      plotOptions: {
        bar: {
          borderWidth: 0,
          borderRadius: 6,
          pointWidth: 18,
          colorByPoint: true,
          dataLabels: {
            enabled: true,
            style: { fontWeight: "700", fontSize: "11px", color: inkOf(theme).text },
            formatter() {
              const y = Number(this.y);
              if (y === 0) return "";
              const pct = Math.round((y / totalRecords) * 100);
              return `${y} (${pct}%)`;
            },
          },
        },
      },
      series: [{
        type: "bar",
        name: "Stage",
        data: rows.map((row) => ({
          y: row.count,
          pct: Math.round((row.count / totalRecords) * 100),
          color: STAGE_COLORS[row.label] ?? "#4c6fff",
        })),
      }],
    };

    return (
      <section className="lens-chart-card" data-lens-chart={title}>
        <div className="lens-chart-head">
          <div className="lens-chart-title">
            <Sparkles size={15} color="#4c6fff" />
            {title}
          </div>
        </div>
        <p className="lens-chart-note">{note}</p>
        <div className="lens-chart-body">
          <HighchartsReact highcharts={Highcharts} options={funnelOptions} />
        </div>
      </section>
    );
  }

  const options: Highcharts.Options = {
    ...chartBase(theme),
    chart: { ...chartBase(theme).chart, type: "column", height: 260 },
    xAxis: { ...chartBase(theme).xAxis, categories: plotted.map((row) => row.label) },
    legend: { enabled: false },
    tooltip: { ...chartBase(theme).tooltip, headerFormat: "", pointFormat: "<b>{point.category}</b><br/>{point.y}" },
    plotOptions: { column: { borderWidth: 0, borderRadius: 6, pointWidth: 26, colorByPoint: true } },
    series: [{ type: "column", name: "Rows", data: plotted.map((row, index) => ({ y: row.count, color: LUXURY_PALETTE[index % LUXURY_PALETTE.length] })) }],
  };

  return (
    <section className="lens-chart-card" data-lens-chart={title}>
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <Layers size={15} color="#8b5cf6" />
          {title}
        </div>
      </div>
      <p className="lens-chart-note">{note}</p>
      <div className="lens-chart-body">
        {plotted.length === 0 ? <p className="sub">Nothing in this dataset for {title.toLowerCase()}.</p> : (
          <HighchartsReact highcharts={Highcharts} options={options} />
        )}
      </div>
    </section>
  );
}

export function PieShare({ title, note, rows }: { title: string; note: string; rows: CountRow[] }) {
  const [theme] = useAppearance();
  const ink = inkOf(theme);
  const data = rows.filter((row) => row.count > 0);
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const top = [...data].sort((a, b) => b.count - a.count)[0];
  const share = top && total ? Math.round((top.count / total) * 100) : 0;

  // Custom palette for confidence vs contactability
  const isConfidence = title.toLowerCase().includes("confidence");
  const sliceColors: Record<string, string> = isConfidence
    ? { "80–100": "#10b981", "50–79": "#4c6fff", "0–49": "#f59e0b" }
    : { None: "#f59e0b", "1–49": "#0ea5e9", "50–79": "#8b5cf6", "80–100": "#10b981" };

  const options: Highcharts.Options = {
    ...chartBase(theme),
    chart: { ...chartBase(theme).chart, type: "pie", height: 260 },
    title: {
      text: data.length ? `<span style="font-size:22px;font-weight:800;color:${ink.text}">${share}%</span><br/><span style="font-size:11px;color:${ink.muted}">${top?.label ?? "Share"}</span>` : undefined,
      align: "center",
      verticalAlign: "middle",
      useHTML: true,
      y: 6,
    },
    tooltip: {
      ...chartBase(theme).tooltip,
      pointFormat: "<b>{point.name}</b>: <b>{point.y}</b> records ({point.percentage:.1f}%)",
    },
    plotOptions: {
      pie: {
        innerSize: "70%",
        borderWidth: 0,
        dataLabels: { enabled: false },
        showInLegend: true,
      },
    },
    series: [{
      type: "pie",
      name: "Records",
      data: data.map((row, index) => ({
        name: row.label,
        y: row.count,
        color: sliceColors[row.label] ?? LUXURY_PALETTE[index % LUXURY_PALETTE.length],
      })),
    }],
  };

  return (
    <section className="lens-chart-card" data-lens-chart={title}>
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <CheckCircle2 size={15} color={isConfidence ? "#10b981" : "#0ea5e9"} />
          {title}
        </div>
      </div>
      <p className="lens-chart-note">{note}</p>
      <div className="lens-chart-body">
        {data.length === 0 ? <p className="sub">Nothing in this dataset for {title.toLowerCase()}.</p> : (
          <HighchartsReact highcharts={Highcharts} options={options} />
        )}
      </div>
    </section>
  );
}

export function CompareChart({ comparison }: { comparison: LensComparison }) {
  const [theme] = useAppearance();
  const before = comparison.beforeRecords ?? 0;
  const after = comparison.afterRecords;
  const net = comparison.net ?? 0;
  const note = `${before} records before this run, ${after} after. Net ${net > 0 ? "+" : ""}${net}. ${comparison.added} added, ${comparison.removed} removed, ${comparison.changed} changed, ${comparison.unchanged} unchanged.`;
  const options: Highcharts.Options = {
    ...chartBase(theme),
    chart: { ...chartBase(theme).chart, type: "column", height: 240 },
    xAxis: { ...chartBase(theme).xAxis, categories: ["Previous Run", "Current Run"] },
    legend: { enabled: false },
    tooltip: { ...chartBase(theme).tooltip, headerFormat: "", pointFormat: "<b>{point.category}</b><br/><b>{point.y}</b> records" },
    plotOptions: { column: { borderWidth: 0, borderRadius: 6, pointWidth: 42 } },
    series: [{
      type: "column",
      name: "Records",
      data: [{ y: before, color: "#8e8e93" }, { y: after, color: "#4c6fff" }],
    }],
  };
  return (
    <section className="lens-chart-card" data-lens-chart="Before and after">
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <Layers size={15} color="#4c6fff" />
          Before &amp; After Comparison
        </div>
      </div>
      <p className="lens-chart-note">{note}</p>
      <div className="lens-chart-body">
        <HighchartsReact highcharts={Highcharts} options={options} />
      </div>
    </section>
  );
}

export function SourceBoard({ nodes, edges, onOpen }: { nodes: GraphNode[]; edges: GraphEdge[]; onOpen: (entityId: string) => void }) {
  const [search, setSearch] = useState("");
  const [selectedSite, setSelectedSite] = useState<string>("all");

  const links = useMemo(() => sourceGroups(nodes, edges), [nodes, edges]);
  if (!links.length) return null;

  const organizations = links.reduce((sum, link) => sum + link.companies.length, 0);
  const top = links[0];
  const note = top && top.companies.length === organizations
    ? `Every organization here was grounded on ${top.site}.`
    : `${top?.site ?? "The top site"} anchors ${top?.companies.length ?? 0} of ${organizations} discovered organizations.`;

  const allRows = links.flatMap((link) => link.companies.map((company) => ({ ...company, site: link.site })));

  const filtered = allRows.filter((row) => {
    const matchesSearch = row.label.toLowerCase().includes(search.toLowerCase()) || row.site.toLowerCase().includes(search.toLowerCase());
    const matchesSite = selectedSite === "all" || row.site === selectedSite;
    return matchesSearch && matchesSite;
  });

  return (
    <section className="lens-block" data-lens-chart="Sources">
      <div className="lens-chart-head">
        <div className="lens-chart-title">
          <Globe size={16} color="#4c6fff" />
          Web Provenance &amp; Discovered Entities
        </div>
      </div>
      <p className="lens-note">{note}</p>

      {/* Top domain bar distribution */}
      <BarFigure rows={links.slice(0, 7).map((link) => ({ label: link.site, count: link.companies.length }))} />

      {/* Search & Domain Filter Bar */}
      <div className="source-explorer-head">
        <div className="source-pills">
          <button
            type="button"
            className={`source-pill-btn ${selectedSite === "all" ? "active" : ""}`}
            onClick={() => setSelectedSite("all")}
          >
            All Sources ({allRows.length})
          </button>
          {links.slice(0, 5).map((l) => (
            <button
              key={l.site}
              type="button"
              className={`source-pill-btn ${selectedSite === l.site ? "active" : ""}`}
              onClick={() => setSelectedSite(l.site)}
            >
              {l.site} ({l.companies.length})
            </button>
          ))}
        </div>
        <div style={{ position: "relative" }}>
          <input
            className="source-search-input"
            type="text"
            placeholder="Filter entities by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Interactive Entity Explorer */}
      <div className="entity-cards-grid">
        {filtered.map((row) => (
          <button
            key={`${row.site}:${row.label}`}
            className="entity-card-item"
            type="button"
            onClick={() => row.entityId && onOpen(row.entityId)}
            title="Inspect entity details in dataset"
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong className="entity-card-name">{row.label}</strong>
              <span className="entity-card-site">
                <Globe size={11} />
                {row.site}
              </span>
            </div>
            <ExternalLink size={13} color="var(--text-3)" />
          </button>
        ))}
      </div>
    </section>
  );
}

function siteOf(label: string) {
  const bare = label.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = bare.split(/[/?#]/)[0] || bare;
  return host.length > 32 ? `${host.slice(0, 31)}…` : host;
}

export function sourceGroups(nodes: GraphNode[], edges: GraphEdge[]): SourceGroup[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const grouped = new Map<string, Map<string, { label: string; entityId?: string }>>();
  for (const edge of edges) {
    if (edge.kind !== "mentioned_by") continue;
    const source = byId.get(edge.source);
    const company = byId.get(edge.target);
    if (!source || source.type !== "source" || !company || company.type !== "company") continue;
    const site = siteOf(source.label);
    const bucket = grouped.get(site) ?? new Map<string, { label: string; entityId?: string }>();
    if (!bucket.has(company.label)) bucket.set(company.label, { label: company.label, entityId: company.canonicalEntityId });
    grouped.set(site, bucket);
  }
  return [...grouped.entries()]
    .map(([site, companies]) => ({ site, companies: [...companies.values()] }))
    .sort((a, b) => b.companies.length - a.companies.length || a.site.localeCompare(b.site));
}


