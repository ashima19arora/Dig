import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Building2,
  Database,
  FileDown,
  MailCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { AppWindow } from "../components/Shell";
import { ROOT_CRUMB } from "../events";
import { Bars, Columns, CompareChart, PieShare, SourceBoard, sourceGroups, type CountRow, type LensComparison } from "./LensCharts";
import { downloadLensReport } from "./lens-report";

interface LensJob { id: string; name: string; rowCount: number; demo: boolean }
interface LensReport {
  summary: { records: number; avgConfidence: number; contactablePct: number; highPriority: number };
  changes: { added: number; removed: number; changed: number; conflicts: number; newContactPaths: number };
  signal: string | null;
  recommendation: string | null;
  metrics: Record<string, number | null>;
  funnel: Array<{ label: string; count: number }>;
  confidence: Array<{ label: string; count: number }>;
  contactability: Array<{ label: string; count: number }>;
  categories: Array<{ label: string; count: number }>;
  roles: Array<{ label: string; count: number }>;
  locations: Array<{ label: string; count: number }>;
  comparison: LensComparison;
  graph: { nodes: Array<{ id: string; type: string; label: string; canonicalEntityId?: string }>; edges: Array<{ source: string; target: string; kind: string }> };
  actions: Array<{ id: string; label: string; reason: string }>;
}

export function Lens() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job") ?? "";
  const navigate = useNavigate();
  const lensQ = useQuery({
    queryKey: ["lens", jobId],
    queryFn: () => api<{ jobs: LensJob[]; report: LensReport | null; jobId?: string }>(`/api/agents/lens${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`),
  });
  const report = lensQ.data?.report;
  const dataset = lensQ.data?.jobs.find((job) => job.id === jobId)?.name ?? "Dataset";
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Auto-select latest dataset if none specified in URL
  useEffect(() => {
    if (jobId || !lensQ.data?.jobs?.length) return;
    const firstJob = lensQ.data.jobs[0];
    if (firstJob) {
      setParams({ job: firstJob.id }, { replace: true });
    }
  }, [jobId, lensQ.data?.jobs, setParams]);

  const missionsQ = useQuery({
    queryKey: ["missions"],
    queryFn: () => api<{ missions: Array<{ id: string; datasetJobId: string | null; workflowId: string | null }> }>("/api/agents/missions"),
  });

  const boundWorkflowId = missionsQ.data?.missions.find((m) => m.datasetJobId === jobId)?.workflowId;

  const download = async () => {
    if (!report || saving) return;
    setSaving(true);
    try {
      await downloadLensReport({
        dataset,
        generatedAt: new Date().toLocaleString(),
        summary: report.summary,
        comparison: report.comparison,
        changes: report.changes,
        funnel: report.funnel,
        confidence: report.confidence,
        contactability: report.contactability,
        locations: report.locations,
        roles: report.roles ?? [],
        categories: report.categories,
        sources: sourceGroups(report.graph.nodes, report.graph.edges).slice(0, 8).map((link) => ({ label: link.site, count: link.companies.length })),
        metrics: report.metrics,
        signal: report.signal,
        recommendation: report.recommendation,
      });
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: string) => {
    if (!jobId) return;
    if (id === "changes" || id === "conflicts") {
      navigate(`/jobs/${jobId}`);
      return;
    }
    if (id === "enrich") {
      setBusyAction("enrich");
      try {
        const mission = await api<{ mission: { id: string } }>("/api/agents/missions", {
          method: "POST",
          body: JSON.stringify({
            objective: `Enrich missing contact paths and verify key decision-makers for ${dataset}.`,
            jobId,
          }),
        });
        navigate(`/agents/mission?mission=${mission.mission.id}`);
      } catch {
        navigate(`/agents/flow?job=${jobId}`);
      } finally {
        setBusyAction(null);
      }
      return;
    }
    if (id === "workflow") {
      navigate(boundWorkflowId ? `/agents/flow?workflow=${boundWorkflowId}` : `/agents/flow?job=${jobId}`);
      return;
    }
    setBusyAction(id);
    try {
      const mission = await api<{ mission: { id: string } }>("/api/agents/missions", {
        method: "POST",
        body: JSON.stringify({ objective: `Rank the verified, contactable organizations in ${dataset} and prepare outreach.`, jobId }),
      });
      navigate(`/agents/mission?mission=${mission.mission.id}`);
    } finally {
      setBusyAction(null);
    }
  };

  // Health Score calculation (0 - 100)
  const avgConf = report?.summary.avgConfidence ?? 0;
  const contactPct = report?.summary.contactablePct ?? 0;
  const conflicts = report?.changes.conflicts ?? 0;
  const conflictDeduction = Math.min(15, conflicts * 5);
  const healthScore = report
    ? Math.max(10, Math.min(100, Math.round(avgConf * 0.5 + contactPct * 0.35 + (15 - conflictDeduction))))
    : 0;

  return (
    <AppWindow crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }, { label: "Agents", to: "/agents" }, { label: "Lens" }]} sidebar="agents">
      <div className="content agent-page">
        <div className="agent-toolbar flat">
          <select aria-label="Dataset" value={jobId} onChange={(event) => setParams(event.target.value ? { job: event.target.value } : {})}>
            <option value="">Choose a dataset to inspect</option>
            {lensQ.data?.jobs.map((job) => <option key={job.id} value={job.id}>{job.name} · {job.rowCount} rows{job.demo ? " · demo" : ""}</option>)}
          </select>
          <button className="btn" type="button" disabled={!report || saving} onClick={() => void download()}>
            <FileDown size={14} style={{ marginRight: 6, display: "inline", verticalAlign: "middle" }} />
            {saving ? "Preparing PDF…" : "Export Intelligence PDF"}
          </button>
        </div>

        {!report ? (
          <div className="lens-empty-state">
            <div className="lens-empty-icon-wrap">
              <Database size={28} />
            </div>
            <h4>Select a Dataset to Inspect</h4>
            <p>Lens synthesizes web extraction results into executive-grade visualizations, health scores, and verified insights.</p>
            {lensQ.data?.jobs && lensQ.data.jobs.length > 0 ? (
              <div className="lens-empty-quick-pick">
                <span>Available Datasets:</span>
                <div className="lens-quick-chips">
                  {lensQ.data.jobs.slice(0, 4).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      className="lens-chip-btn"
                      onClick={() => setParams({ job: j.id })}
                    >
                      <Database size={12} />
                      {j.name} ({j.rowCount} rows)
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Link to="/dashboard" className="btn blue" style={{ marginTop: 12 }}>
                <Sparkles size={13} style={{ marginRight: 4 }} />
                Collect First Dataset on Dashboard
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* AI Dataset Intelligence Briefing */}
            <section className="lens-hero">
              <div className="lens-hero-head">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className="source-pill-btn active" style={{ fontSize: "11px", padding: "2px 10px" }}>
                      <Sparkles size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                      Dataset Intelligence Briefing
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                      {report.comparison.comparable ? `Run Comparison · Net ${report.comparison.net && report.comparison.net > 0 ? "+" : ""}${report.comparison.net ?? 0} rows` : "First Full Snapshot"}
                    </span>
                  </div>
                  <h3 style={{ margin: "6px 0 3px", fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
                    {dataset}
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)" }}>
                    Automated multi-source extraction synthesized <b>{report.summary.records} verified organizations</b> with {report.summary.avgConfidence}% confidence score.
                  </p>
                </div>

                <div className="lens-health-badge">
                  <div className="health-score-circle">{healthScore}</div>
                  <div className="health-score-label">
                    <span className="health-score-title">
                      {healthScore >= 80 ? "Grade A · Prime" : healthScore >= 65 ? "Grade B · High Quality" : "Grade C · Action Needed"}
                    </span>
                    <span className="health-score-sub">Dataset Health Score</span>
                  </div>
                </div>
              </div>

              {/* Strategic Insights Grid */}
              <div className="lens-insights-grid">
                <div className="lens-insight-card veracity">
                  <div className="insight-card-title">
                    <ShieldCheck size={14} color="#10b981" />
                    Grounding &amp; Veracity
                  </div>
                  <p className="insight-card-desc">
                    {report.summary.records} entities multi-sourced with {report.summary.avgConfidence}% confidence.{" "}
                    {conflicts === 0 ? "Zero conflicting entity keys detected across web sources." : `${conflicts} conflict keys flagged for disambiguation.`}
                  </p>
                </div>

                <div className="lens-insight-card accent">
                  <div className="insight-card-title">
                    <TrendingUp size={14} color="#4c6fff" />
                    Market Footprint &amp; Signal
                  </div>
                  <p className="insight-card-desc">
                    {report.signal || `${dataset} captures active technology organizations and leaders corroborated across major web platforms.`}
                  </p>
                </div>

                <div className="lens-insight-card opportunity">
                  <div className="insight-card-title">
                    <Zap size={14} color="#f59e0b" />
                    Strategic Opportunity
                  </div>
                  <p className="insight-card-desc">
                    {report.recommendation || (report.summary.contactablePct < 25 ? `${report.summary.records - Math.round(report.summary.records * report.summary.contactablePct / 100)} records lack a direct contact path. Run Apollo or Hunter enrichment.` : "High direct contactability detected. Prime for automated workflow dispatch.")}
                  </p>
                </div>
              </div>

              {/* Action Bar */}
              <div className="lens-actions-bar">
                {report.actions.map((action) => (
                  <button
                    key={action.id}
                    className="btn"
                    type="button"
                    title={action.reason}
                    disabled={Boolean(busyAction)}
                    onClick={() => void act(action.id)}
                  >
                    <Sparkles
                      size={13}
                      className={busyAction === action.id ? "spin" : ""}
                      style={{ marginRight: 6, display: "inline", verticalAlign: "middle" }}
                    />
                    {busyAction === action.id ? "Planning…" : action.label}
                  </button>
                ))}
                {jobId && (
                  <Link
                    className="btn"
                    to={`/jobs/${jobId}`}
                    title="Inspect raw extracted records, sources, and conflicts in Master Dataset"
                  >
                    <Database size={13} style={{ marginRight: 6, display: "inline", verticalAlign: "middle" }} />
                    Inspect Master Dataset
                  </Link>
                )}
                <Link
                  className="btn"
                  to={boundWorkflowId ? `/agents/flow?workflow=${boundWorkflowId}` : `/agents/flow?job=${jobId}`}
                  title={boundWorkflowId ? `Open workflow canvas for ${dataset}` : `Build or open workflow grounded on ${dataset}`}
                >
                  <ArrowUpRight size={13} style={{ marginRight: 6, display: "inline", verticalAlign: "middle" }} />
                  Workflow Agent
                </Link>
              </div>
            </section>

            {/* Luxury KPI Cards Grid */}
            <section className="lens-kpi-grid">
              <div className="lens-kpi-card">
                <div className="kpi-top">
                  <div className="kpi-icon-wrap blue"><Building2 size={16} /></div>
                  <span className="kpi-pill">Verified</span>
                </div>
                <div className="kpi-val">{report.summary.records}</div>
                <div className="kpi-label">Discovered Organizations</div>
                <div className="kpi-meter blue"><span style={{ width: "100%" }} /></div>
              </div>

              <div className="lens-kpi-card">
                <div className="kpi-top">
                  <div className="kpi-icon-wrap green"><ShieldCheck size={16} /></div>
                  <span className="kpi-pill">{report.summary.avgConfidence >= 70 ? "High Trust" : "Moderate"}</span>
                </div>
                <div className="kpi-val">{report.summary.avgConfidence}%</div>
                <div className="kpi-label">Average Confidence Score</div>
                <div className="kpi-meter green"><span style={{ width: `${Math.min(100, report.summary.avgConfidence)}%` }} /></div>
              </div>

              <div className="lens-kpi-card">
                <div className="kpi-top">
                  <div className="kpi-icon-wrap amber"><MailCheck size={16} /></div>
                  <span className="kpi-pill">{Math.round(report.summary.records * (report.summary.contactablePct / 100))} of {report.summary.records}</span>
                </div>
                <div className="kpi-val">{report.summary.contactablePct}%</div>
                <div className="kpi-label">Direct Contact Paths Found</div>
                <div className="kpi-meter amber"><span style={{ width: `${Math.min(100, report.summary.contactablePct)}%` }} /></div>
              </div>

              <div className="lens-kpi-card">
                <div className="kpi-top">
                  <div className="kpi-icon-wrap purple"><Sparkles size={16} /></div>
                  <span className="kpi-pill">{report.summary.highPriority > 0 ? "Tier-1" : "Standard"}</span>
                </div>
                <div className="kpi-val">{report.summary.highPriority}</div>
                <div className="kpi-label">High Priority Targets</div>
                <div className="kpi-meter purple">
                  <span style={{ width: `${report.summary.records > 0 ? Math.min(100, Math.round((report.summary.highPriority / report.summary.records) * 100)) : 0}%` }} />
                </div>
              </div>
            </section>

            {/* Visual Intelligence Grid */}
            <section className="lens-grid">
              {report.comparison.comparable && <CompareChart comparison={report.comparison} />}
              <Columns title="Research funnel" note={funnelLine(report.funnel)} rows={report.funnel} keepEmpty />
              <PieShare title="Confidence Distribution" note={shareLine(report.confidence)} rows={report.confidence} />
              <PieShare title="Contactability Breakdown" note={shareLine(report.contactability)} rows={report.contactability} />
              <Bars title="Locations" note={shareLine(report.locations)} rows={report.locations} />
              {(report.roles ?? []).some((row) => row.count > 0) && <Columns title="Roles" note={shareLine(report.roles)} rows={report.roles} />}
              {report.categories.some((row) => row.count > 0) && <Bars title="Categories" note={shareLine(report.categories)} rows={report.categories} />}
            </section>

            {/* Operations & Pipeline Telemetry */}
            <section className="lens-block">
              <div className="lens-chart-head">
                <div className="lens-chart-title">
                  <Activity size={15} color="#4c6fff" />
                  Operations &amp; Agent Telemetry
                </div>
              </div>
              <p className="lens-chart-note">
                {report.metrics.workflowSuccessPct == null
                  ? "Workspace workflows operational. Provider latency and cost are continuously monitored."
                  : `Workspace workflow success rate is ${report.metrics.workflowSuccessPct}% (failure ${report.metrics.workflowFailurePct ?? 0}%).`}
              </p>
              <div className="lens-ops-grid">
                <div className="lens-ops-cell">
                  <span className="lens-ops-val" style={{ color: "#10b981" }}>
                    {report.metrics.workflowSuccessPct != null ? `${report.metrics.workflowSuccessPct}%` : "100%"}
                  </span>
                  <span className="lens-ops-label">Workflow Success Rate</span>
                </div>
                <div className="lens-ops-cell">
                  <span className="lens-ops-val" style={{ color: "#4c6fff" }}>
                    {report.metrics.outreach ?? 0}
                  </span>
                  <span className="lens-ops-label">Outreach Dispatched</span>
                </div>
                <div className="lens-ops-cell">
                  <span className="lens-ops-val" style={{ color: "#8b5cf6" }}>
                    {report.metrics.interested ?? 0}
                  </span>
                  <span className="lens-ops-label">Interested Responses</span>
                </div>
                <div className="lens-ops-cell">
                  <span className="lens-ops-val" style={{ color: "#0ea5e9" }}>
                    Deterministic
                  </span>
                  <span className="lens-ops-label">Extraction Engine Status</span>
                </div>
              </div>
            </section>

            {/* Web Provenance & Entity Exploration */}
            <SourceBoard
              nodes={report.graph.nodes}
              edges={report.graph.edges}
              onOpen={(entityId) => navigate(`/jobs/${jobId}?entity=${encodeURIComponent(entityId)}`)}
            />
          </>
        )}
      </div>
    </AppWindow>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="lens-stat"><b>{value}</b><span>{label}</span></div>;
}

function shareLine(rows: CountRow[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const ranked = rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  const top = ranked[0];
  if (!top || !total) return "Nothing in this set to chart.";
  if (ranked.length === 1) return top.label === "None" ? "No row has a contact score yet." : `Every row is ${top.label}.`;
  const share = Math.round((top.count / total) * 100);
  if (share < 40 && ranked.length >= 4) return `Spread across ${ranked.length} names. Most common: ${top.label} (${top.count}).`;
  return `${top.label} is ${top.count} of ${total} (${share}%).`;
}

function funnelLine(rows: CountRow[]) {
  const records = rows.find((row) => row.label === "Records")?.count ?? 0;
  const verified = rows.find((row) => row.label === "Verified")?.count ?? 0;
  const contactable = rows.find((row) => row.label === "Contactable")?.count ?? 0;
  if (!records) return "This dataset has no rows.";
  if (!contactable) return `${records} rows are collected. ${verified} are verified, and none have a contact path yet.`;
  return `${contactable} of ${records} already have a contact path. ${verified} are verified.`;
}
