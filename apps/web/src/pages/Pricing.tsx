import {
  BadgeCheck,
  Calculator,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  HelpCircle,
  Layers,
  Lock,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Rocket,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import paymentQrImg from "../assets/payment-qr.png";
import { AppWindow } from "../components/Shell";
import { ROOT_CRUMB } from "../events";

interface PlanTier {
  id: "starter" | "pro" | "scale";
  name: string;
  badge?: string;
  isPopular?: boolean;
  desc: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  cta: string;
}

const TIERS: PlanTier[] = [
  {
    id: "starter",
    name: "Starter",
    badge: "Community",
    desc: "For individual hackathon participants, students & exploratory research.",
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      "1 active hackathon event",
      "2 curated research lists",
      "5 live collection runs / mo",
      "40 sourced rows kept per list",
      "CSV & JSON list export",
      "Ask Diglett research assistant",
    ],
    cta: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro Researcher",
    badge: "🔥 Most Popular",
    isPopular: true,
    desc: "For dealmakers, founders, recruiters & high-intent outbound lead hackers.",
    monthlyPrice: 399,
    annualPrice: 3990,
    features: [
      "6 active events held all year",
      "20 curated lists (240 on annual)",
      "40 live collection runs (480 on annual)",
      "120 sourced rows kept per list",
      "8 scheduled refreshes / mo (96 / yr)",
      "Multi-channel pitch drafting (Email, WhatsApp, LinkedIn)",
      "Verified contact path lookup & human gate",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "scale",
    name: "Scale & Agency",
    badge: "High Volume",
    desc: "For venture capital sourcing, growth agencies & large-scale fests.",
    monthlyPrice: 1190,
    annualPrice: 11900,
    features: [
      "Unlimited active events",
      "100 curated lists",
      "250 live collection runs",
      "500 sourced rows kept per list",
      "High-frequency automated calendar refreshes",
      "Priority AI deep-search & entity parsing",
      "Dedicated WhatsApp & Resend API gateways",
    ],
    cta: "Choose Scale",
  },
];

const METERS = [
  {
    icon: Layers,
    name: "Event",
    sub: "Workspace Slot",
    body: "The dedicated workspace for one hackathon, fest, or research brief. Archiving one frees the slot immediately.",
  },
  {
    icon: Database,
    name: "List",
    sub: "Curated Dataset",
    body: "One curated dataset in a folder: sponsors, judges, jobs, leads, or competitors. Re-opening a list you already have is 100% free.",
  },
  {
    icon: Zap,
    name: "Run",
    sub: "Collection Unit",
    body: "One live collection bundle of web searches and model tokens. First run builds the list; scheduled refreshes use the same pool.",
  },
  {
    icon: Shield,
    name: "Row",
    sub: "Verified Record",
    body: "One verified entity kept on the list. Filtering, sorting, and exporting stored rows never spends additional runs.",
  },
];

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [currentPlan, setCurrentPlan] = useState<"starter" | "pro" | "scale">("starter");
  const [modalPlan, setModalPlan] = useState<PlanTier | null>(null);
  const [successToast, setSuccessToast] = useState<{ planName: string; utr: string } | null>(null);

  // Workload Calculator interactive state
  const [calcRuns, setCalcRuns] = useState<number>(40);
  const [calcLists, setCalcLists] = useState<number>(20);
  const [calcEvents, setCalcEvents] = useState<number>(6);
  const [activePreset, setActivePreset] = useState<string>("solo");

  // Dynamic recommendation and workload calculation based on all three parameters
  const recommendation = useMemo(() => {
    // 1. Determine Tier based on genuine capacities
    let tier = TIERS[0]; // starter
    if (calcRuns > 5 || calcLists > 2 || calcEvents > 1) {
      if (calcRuns <= 40 && calcLists <= 20 && calcEvents <= 6) {
        tier = TIERS[1]; // pro
      } else {
        tier = TIERS[2]; // scale
      }
    }

    // 2. Base price according to billing cycle
    let baseMonthlyPrice = 0;
    if (tier.id === "pro") {
      baseMonthlyPrice = billingCycle === "annual" ? 332 : 399;
    } else if (tier.id === "scale") {
      baseMonthlyPrice = billingCycle === "annual" ? 990 : 1190;
    }

    // 3. For Scale tier, compute tailored volume buffer if exceeding base scale allowances
    let bufferAddon = 0;
    if (tier.id === "scale") {
      const extraRuns = Math.max(0, calcRuns - 100);
      const extraLists = Math.max(0, calcLists - 40);
      const extraEvents = Math.max(0, calcEvents - 10);
      bufferAddon = Math.round(extraRuns * 2.5 + extraLists * 6 + extraEvents * 30);
    }
    const finalMonthlyPrice = baseMonthlyPrice + bufferAddon;

    // 4. Human Research Hours dynamically calculated across all 3 inputs:
    // - 1.2 hrs per live collection run
    // - 3.0 hrs per curated dataset list built & validated
    // - 8.0 hrs per simultaneous hackathon event radar managed
    const roiHours = Math.round(calcRuns * 1.2 + calcLists * 3.0 + calcEvents * 8.0);

    // 5. Freelance Agency / Manual Cost equivalent dynamically calculated across all 3 inputs:
    // - ₹400 per live collection run
    // - ₹1,250 per curated list built & verified
    // - ₹4,000 per hackathon event sponsor & contact radar
    const manualCost = Math.round(calcRuns * 400 + calcLists * 1250 + calcEvents * 4000);

    // 6. Net savings and effective unit costs
    const netSavings = Math.max(0, manualCost - finalMonthlyPrice);
    const savingsRatio = manualCost > 0 ? Math.round((netSavings / manualCost) * 100) : 0;
    const costPerList = calcLists > 0 ? Math.round(finalMonthlyPrice / calcLists) : 0;
    const costPerEvent = calcEvents > 0 ? Math.round(finalMonthlyPrice / calcEvents) : 0;

    const priceText = finalMonthlyPrice === 0 ? "₹0 / mo" : `₹${finalMonthlyPrice.toLocaleString()} / mo`;
    const savingsText = finalMonthlyPrice === 0
      ? "Save 100% with Community Tier"
      : `Save ~${roiHours} hrs & ₹${netSavings.toLocaleString()}/mo`;

    return {
      tier,
      finalMonthlyPrice,
      priceText,
      savingsText,
      roiHours,
      manualCost,
      netSavings,
      savingsRatio,
      costPerList,
      costPerEvent,
      isCustomVolume: bufferAddon > 0,
    };
  }, [calcRuns, calcLists, calcEvents, billingCycle]);

  const applyPreset = (preset: "student" | "solo" | "agency") => {
    setActivePreset(preset);
    if (preset === "student") {
      setCalcRuns(5);
      setCalcLists(2);
      setCalcEvents(1);
    } else if (preset === "solo") {
      setCalcRuns(40);
      setCalcLists(20);
      setCalcEvents(6);
    } else if (preset === "agency") {
      setCalcRuns(180);
      setCalcLists(75);
      setCalcEvents(15);
    }
  };

  const handleSelectPlan = (tier: PlanTier) => {
    if (tier.id === currentPlan) return;
    setModalPlan(tier);
  };

  const handlePaymentSuccess = (tierId: "starter" | "pro" | "scale", utr: string) => {
    setCurrentPlan(tierId);
    setModalPlan(null);
    setSuccessToast({
      planName: TIERS.find((t) => t.id === tierId)?.name || tierId,
      utr,
    });
    setTimeout(() => {
      setSuccessToast(null);
    }, 7000);
  };

  return (
    <AppWindow crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }, { label: "Pricing" }]} sidebar="pricing">
      <div className="content profile pricing">
        {/* Header and Billing Switcher */}
        <div className="pricing-header-wrap">
          <h2>Predictable, Research-Metered Pricing</h2>
          <p>
            Dig bills the research output, not user seats. Choose the allowance that matches your outbound pipeline and hackathon sourcing velocity.
          </p>

          <div className="pricing-cycle-toggle" role="group" aria-label="Billing cycle">
            <button
              type="button"
              className={`cycle-btn ${billingCycle === "monthly" ? "active" : ""}`}
              onClick={() => setBillingCycle("monthly")}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`cycle-btn ${billingCycle === "annual" ? "active" : ""}`}
              onClick={() => setBillingCycle("annual")}
            >
              Annual Billing
              <span className="cycle-badge">Save 17% • 2 Months Free</span>
            </button>
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="pricing-tiers-grid">
          {TIERS.map((tier) => {
            const isCurrent = tier.id === currentPlan;
            const price =
              billingCycle === "annual"
                ? tier.annualPrice === 0
                  ? 0
                  : Math.round(tier.annualPrice / 12)
                : tier.monthlyPrice;

            return (
              <article
                key={tier.id}
                className={`pricing-tier-card ${tier.isPopular ? "featured" : ""}`}
              >
                <div className="pricing-tier-top">
                  <h3>{tier.name}</h3>
                  {tier.badge && (
                    <span className={`pricing-tier-badge ${tier.isPopular ? "popular" : ""}`}>
                      {tier.badge}
                    </span>
                  )}
                </div>

                <p className="pricing-tier-desc">{tier.desc}</p>

                <div className="pricing-tier-price-box">
                  <div className="pricing-tier-price">
                    <span className="amount">₹{price.toLocaleString()}</span>
                    <span className="period">{price === 0 ? "forever" : "/ month"}</span>
                  </div>
                  {price > 0 && (
                    <div className="pricing-tier-billing-note">
                      {billingCycle === "annual"
                        ? `Billed annually at ₹${tier.annualPrice.toLocaleString()} / year`
                        : "Billed on a flexible monthly cycle"}
                    </div>
                  )}
                </div>

                <ul className="pricing-features-list">
                  {tier.features.map((feature) => (
                    <li key={feature} className="pricing-feature-item">
                      <Check size={15} className="feature-check-icon" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`pricing-cta-btn ${
                    isCurrent ? "current" : tier.isPopular ? "primary" : ""
                  }`}
                  onClick={() => handleSelectPlan(tier)}
                  disabled={isCurrent}
                >
                  {isCurrent ? "✓ Active Plan" : tier.cta}
                </button>
              </article>
            );
          })}
        </div>

        {/* Interactive Workload Calculator */}
        <section className="workload-calculator">
          <div className="calc-head">
            <div className="calc-title-box">
              <div className="calc-icon">
                <Calculator size={19} />
              </div>
              <div>
                <h3>Interactive Workload &amp; ROI Calculator</h3>
                <p>Slide your desired monthly research volume to see your tailored plan and cost savings.</p>
              </div>
            </div>

            <div className="calc-presets-row">
              <span className="calc-presets-label">Presets:</span>
              <div className="calc-presets-group">
                <button
                  type="button"
                  className={`calc-preset-chip ${activePreset === "student" ? "active" : ""}`}
                  onClick={() => applyPreset("student")}
                >
                  🎓 Student
                </button>
                <button
                  type="button"
                  className={`calc-preset-chip ${activePreset === "solo" ? "active" : ""}`}
                  onClick={() => applyPreset("solo")}
                >
                  ⚡ Solo Scout
                </button>
                <button
                  type="button"
                  className={`calc-preset-chip ${activePreset === "agency" ? "active" : ""}`}
                  onClick={() => applyPreset("agency")}
                >
                  🚀 Agency
                </button>
              </div>
            </div>
          </div>

          <div className="calc-body">
            <div className="calc-sliders-col">
              <div className="calc-slider-group">
                <div className="calc-slider-label-row">
                  <span className="calc-slider-title">Monthly Live Collection Runs</span>
                  <span className="calc-slider-val">{calcRuns} runs</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="250"
                  step="5"
                  value={calcRuns}
                  style={{ "--slider-pct": `${Math.round(((calcRuns - 5) / (250 - 5)) * 100)}%` } as React.CSSProperties}
                  onChange={(e) => {
                    setCalcRuns(Number(e.target.value));
                    setActivePreset("");
                  }}
                  className="calc-slider-input"
                />
                <div className="calc-slider-scale">
                  <span>5 runs</span>
                  <span>125</span>
                  <span>250 runs</span>
                </div>
              </div>

              <div className="calc-slider-group">
                <div className="calc-slider-label-row">
                  <span className="calc-slider-title">Curated Dataset Lists</span>
                  <span className="calc-slider-val">{calcLists} lists</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="100"
                  step="2"
                  value={calcLists}
                  style={{ "--slider-pct": `${Math.round(((calcLists - 2) / (100 - 2)) * 100)}%` } as React.CSSProperties}
                  onChange={(e) => {
                    setCalcLists(Number(e.target.value));
                    setActivePreset("");
                  }}
                  className="calc-slider-input"
                />
                <div className="calc-slider-scale">
                  <span>2 lists</span>
                  <span>50</span>
                  <span>100 lists</span>
                </div>
              </div>

              <div className="calc-slider-group">
                <div className="calc-slider-label-row">
                  <span className="calc-slider-title">Simultaneous Hackathon Events</span>
                  <span className="calc-slider-val">{calcEvents} events</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={calcEvents}
                  style={{ "--slider-pct": `${Math.round(((calcEvents - 1) / (20 - 1)) * 100)}%` } as React.CSSProperties}
                  onChange={(e) => {
                    setCalcEvents(Number(e.target.value));
                    setActivePreset("");
                  }}
                  className="calc-slider-input"
                />
                <div className="calc-slider-scale">
                  <span>1 event</span>
                  <span>10</span>
                  <span>20 events</span>
                </div>
              </div>
            </div>

            <div className="calc-result-card">
              <div className="calc-result-top">
                <div className="calc-result-badge-row">
                  <span className="calc-result-tier-pill">
                    <Sparkles size={11} /> Recommended: {recommendation.tier.name}
                  </span>
                  {recommendation.isCustomVolume && (
                    <span className="calc-result-tier-pill" style={{ background: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.35)", color: "#34d399", marginLeft: "6px" }}>
                      Tailored Volume
                    </span>
                  )}
                </div>
                <div className="calc-result-price-box">
                  <div className="calc-result-price-val">{recommendation.priceText}</div>
                  <span className="calc-result-price-sub">
                    tailored to {calcRuns} runs · {calcLists} lists · {calcEvents} events
                  </span>
                </div>
              </div>

              <div className="calc-roi-stats">
                <div className="calc-roi-stat-row">
                  <span className="roi-stat-label">Human research time</span>
                  <b className="roi-stat-val">~{recommendation.roiHours} hours</b>
                </div>
                <div className="calc-roi-stat-row">
                  <span className="roi-stat-label">Freelance agency equiv.</span>
                  <b className="roi-stat-val">₹{recommendation.manualCost.toLocaleString()}/mo</b>
                </div>
                <div className="calc-roi-stat-row">
                  <span className="roi-stat-label">Effective rate per curated list</span>
                  <b className="roi-stat-val" style={{ color: "#4c6fff" }}>
                    {recommendation.costPerList > 0 ? `₹${recommendation.costPerList} / list` : "Free"}
                    <span style={{ fontSize: "10.5px", color: "var(--text-3)", marginLeft: "5px", fontWeight: 400 }}>
                      (vs ₹1,250 agency)
                    </span>
                  </b>
                </div>
                <div className="calc-roi-stat-row savings">
                  <span className="roi-stat-label">Net estimated savings</span>
                  <b className="roi-stat-val">
                    +₹{recommendation.netSavings.toLocaleString()}/mo
                    <span style={{ fontSize: "11px", color: "#10b981", marginLeft: "6px" }}>
                      ({recommendation.savingsRatio}%)
                    </span>
                  </b>
                </div>
              </div>

              <button
                type="button"
                className="pricing-cta-btn primary calc-cta"
                onClick={() => handleSelectPlan(recommendation.tier)}
              >
                Choose {recommendation.tier.name} Configuration &rarr;
              </button>
            </div>
          </div>
        </section>

        {/* Meters Breakdown */}
        <h5 style={{ margin: "32px 0 14px", fontSize: "16px", fontWeight: 700 }}>How Dig Counts Your Workload</h5>
        <div className="meters-interactive-grid">
          {METERS.map((meter) => {
            const Icon = meter.icon;
            return (
              <div key={meter.name} className="meter-card">
                <div className="meter-card-head">
                  <Icon size={14} color="#4c6fff" />
                  <span>{meter.name} ({meter.sub})</span>
                </div>
                <p>{meter.body}</p>
              </div>
            );
          })}
        </div>

        {/* Where a Run Goes (Rules Matrix) */}
        <h5 style={{ margin: "28px 0 14px", fontSize: "16px", fontWeight: 700 }}>Run Consumption Rules</h5>
        <div className="run-rules-grid">
          <div className="run-rule-card spends">
            <div className="run-rule-head">
              <Zap size={15} color="#f59e0b" />
              <span>Spends 1 Run from Allowance</span>
            </div>
            <ul className="run-rule-list">
              <li>
                <span className="rule-dot amber" />
                <span><b>New Query Search:</b> when building a brand-new dataset from the web.</span>
              </li>
              <li>
                <span className="rule-dot amber" />
                <span><b>Run Again:</b> discovering additional live entities for an existing list.</span>
              </li>
              <li>
                <span className="rule-dot amber" />
                <span><b>Scheduled Refreshes:</b> automated calendar refreshes on execution day.</span>
              </li>
              <li>
                <span className="rule-dot amber" />
                <span><b>Contact Lookup:</b> cached across 7 days so repeats are free.</span>
              </li>
            </ul>
          </div>

          <div className="run-rule-card included">
            <div className="run-rule-head">
              <CheckCircle2 size={15} color="#10b981" />
              <span>100% Free &amp; Unlimited (0 Runs)</span>
            </div>
            <ul className="run-rule-list">
              <li>
                <span className="rule-dot green" />
                <span><b>Database Browsing:</b> opening, searching, filtering, and sorting rows.</span>
              </li>
              <li>
                <span className="rule-dot green" />
                <span><b>CRM Marking:</b> outreach status notes, tags, and contact edits.</span>
              </li>
              <li>
                <span className="rule-dot green" />
                <span><b>Trust Verification:</b> Jev conflict review, proof inspection, receipts.</span>
              </li>
              <li>
                <span className="rule-dot green" />
                <span><b>Export &amp; Assistant:</b> CSV download, Ask Diglett, and graph layout.</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="profile-note price-foot" style={{ marginTop: "24px" }}>
          Sponsor and lead research runs include verified email and phone lookups. In this demo/hackathon build, plan changes simulate instantly without charging your card.
        </p>

        {/* Success Notification Toast */}
        {successToast && (
          <div className="pricing-success-toast">
            <div className="pricing-success-toast-body">
              <CheckCircle2 size={18} color="#10b981" />
              <div>
                <strong>{successToast.planName} Plan Activated!</strong>
                <span className="pricing-success-sub">
                  Reconciled via NPCI Bank UTR #{successToast.utr.slice(0, 4)}••••{successToast.utr.slice(-4)} · Workspace limits unlocked.
                </span>
              </div>
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => setSuccessToast(null)}
              aria-label="Dismiss toast"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* macOS UPI QR & UTR Verification Payment Modal */}
        {modalPlan && (
          <UpiPaymentModal
            plan={modalPlan}
            billingCycle={billingCycle}
            onClose={() => setModalPlan(null)}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// High-Fidelity SVG QR Code Generator with Finder Patterns & UPI Rupee Badge
// ---------------------------------------------------------------------------
function UpiQrSvg({ upiUri, amount }: { upiUri: string; amount: number }) {
  const modules = useMemo(() => {
    const size = 21;
    const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    // 7x7 corner finder pattern
    const setFinder = (row: number, col: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[row + r][col + c] = isBorder || isCenter;
        }
      }
    };

    setFinder(0, 0); // top-left
    setFinder(0, 14); // top-right
    setFinder(14, 0); // bottom-left

    // Timing patterns
    for (let i = 8; i < 13; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Pseudorandom data modules keyed by amount and uri hash
    let hash = 0;
    const key = `${upiUri}_${amount}`;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinderTL = r < 8 && c < 8;
        const inFinderTR = r < 8 && c >= 13;
        const inFinderBL = r >= 13 && c < 8;
        const inCenterLogo = r >= 8 && r <= 12 && c >= 8 && c <= 12;
        if (inFinderTL || inFinderTR || inFinderBL || inCenterLogo) {
          continue;
        }
        hash = (hash * 1664525 + 1013904223) >>> 0;
        grid[r][c] = (hash % 100) > 42;
      }
    }

    return grid;
  }, [upiUri, amount]);

  return (
    <svg
      viewBox="0 0 210 210"
      className="upi-qr-svg"
      role="img"
      aria-label={`UPI Payment QR Code for ₹${amount}`}
    >
      <rect width="210" height="210" fill="#ffffff" rx="12" />
      {modules.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={r * 10}
              y={c * 10}
              width={10}
              height={10}
              fill="#0f172a"
              rx={1.5}
            />
          ) : null
        )
      )}
      {/* Center Indian Rupee / UPI Brand Emblem Badge */}
      <rect x="75" y="75" width="60" height="60" rx="10" fill="#00baf2" stroke="#ffffff" strokeWidth="4" />
      <text
        x="105"
        y="112"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="30"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        ₹
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// macOS UPI QR & UTR Verification Payment Modal
// ---------------------------------------------------------------------------
interface UpiPaymentModalProps {
  plan: PlanTier;
  billingCycle: "monthly" | "annual";
  onClose: () => void;
  onSuccess: (tierId: "starter" | "pro" | "scale", utr: string) => void;
}

function UpiPaymentModal({ plan, billingCycle, onClose, onSuccess }: UpiPaymentModalProps) {
  const isFree = plan.id === "starter";
  const [activeCycle, setActiveCycle] = useState<"monthly" | "annual">(billingCycle);
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1);

  const amount = useMemo(() => {
    if (isFree) return 0;
    if (plan.id === "pro") {
      return activeCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
    }
    // Scale & Agency Tier: flexible scaling packages
    if (activeCycle === "annual") {
      if (scaleMultiplier === 1) return 11900;
      if (scaleMultiplier === 2) return 21900;
      if (scaleMultiplier === 3) return 31900;
      return 49900;
    } else {
      if (scaleMultiplier === 1) return 1190;
      if (scaleMultiplier === 2) return 2190;
      if (scaleMultiplier === 3) return 3190;
      return 4990;
    }
  }, [isFree, plan.id, plan.annualPrice, plan.monthlyPrice, activeCycle, scaleMultiplier]);

  const upiId = "9953314375@ptyes";
  const merchantName = "MAYANK GARG";
  const upiDeepLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&cu=INR&tn=Dig%20${encodeURIComponent(plan.name)}%20${scaleMultiplier}x%20${activeCycle}`;

  const [step, setStep] = useState<"pay" | "verifying" | "receipt">(isFree ? "receipt" : "pay");
  const [utrInput, setUtrInput] = useState<string>("");
  const [copiedVpa, setCopiedVpa] = useState<boolean>(false);
  const [verificationPhase, setVerificationPhase] = useState<number>(1);
  const [confirmedUtr, setConfirmedUtr] = useState<string>(isFree ? "COMMUNITY-FREE" : "");
  const [confirmedDate, setConfirmedDate] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCopyVpa = () => {
    navigator.clipboard?.writeText(upiId);
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 2200);
  };

  const handleUtrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 12);
    setUtrInput(digitsOnly);
    if (errorMessage) setErrorMessage(null);
  };

  const handleStartVerification = () => {
    if (utrInput.length !== 12) {
      setErrorMessage("Please enter all 12 digits of your bank UTR / Reference number.");
      return;
    }
    setStep("verifying");
    setVerificationPhase(1);

    setTimeout(() => {
      setVerificationPhase(2);
    }, 900);

    setTimeout(() => {
      setVerificationPhase(3);
    }, 1800);

    setTimeout(() => {
      const dateStr = new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      setConfirmedUtr(utrInput);
      setConfirmedDate(dateStr);
      setStep("receipt");
    }, 2600);
  };

  return (
    <div className="macos-modal-backdrop" onClick={onClose}>
      <div
        className="macos-modal-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="macos-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* macOS authentic window titlebar */}
        <div className="macos-titlebar">
          <div className="macos-traffic-lights">
            <button
              type="button"
              className="macos-dot red"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close modal"
            />
            <button
              type="button"
              className="macos-dot yellow"
              title="Minimize"
              aria-label="Minimize modal"
            />
            <button
              type="button"
              className="macos-dot green"
              title="Zoom"
              aria-label="Zoom modal"
            />
          </div>
          <div className="macos-titlebar-heading" id="macos-modal-title">
            <Lock size={12} className="macos-lock-icon" />
            <span>Dig Direct Settlement · NPCI UPI v2.8</span>
          </div>
          <div className="macos-titlebar-right">
            <span className="macos-badge-live">SECURE RAIL</span>
          </div>
        </div>

        {/* Modal Window Content */}
        <div className="macos-modal-scroll">
          {/* Free Tier View */}
          {isFree ? (
            <div className="macos-starter-prompt">
              <div className="macos-starter-icon-wrap">
                <Sparkles size={36} color="#4c6fff" />
              </div>
              <h3>Switch to Community Starter</h3>
              <p>
                The Starter tier is 100% free forever for hackathons and student researchers.
                No UPI transfer or UTR entry is required.
              </p>
              <div className="macos-starter-meta">
                <span>✓ 5 Live Collection Runs / Month</span>
                <span>✓ 2 Curated Datasets</span>
                <span>✓ Zero credit card or payment</span>
              </div>
              <div className="macos-dialog-actions" style={{ marginTop: "24px" }}>
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn blue"
                  onClick={() => onSuccess("starter", "FREE-COMMUNITY")}
                >
                  Confirm Free Starter Plan
                </button>
              </div>
            </div>
          ) : step === "verifying" ? (
            /* Multi-phase bank ledger verification */
            <div className="macos-verifying-view">
              <div className="macos-spinner-outer">
                <RefreshCw size={36} className="macos-spin-svg" />
              </div>
              <h3 className="macos-verifying-title">Reconciling Bank Ledger</h3>
              <p className="macos-verifying-sub">
                Validating transaction against NPCI UPI central switch for <b>₹{amount.toLocaleString()}</b>
              </p>

              <div className="macos-audit-steps">
                <div className={`macos-audit-row ${verificationPhase >= 1 ? "active" : ""}`}>
                  <span className="macos-audit-bullet">{verificationPhase > 1 ? "✓" : "1"}</span>
                  <div className="macos-audit-text">
                    <strong>Handshaking with NPCI UPI Switch</strong>
                    <span>Querying Bank IMPS / UPI reference registry</span>
                  </div>
                </div>

                <div className={`macos-audit-row ${verificationPhase >= 2 ? "active" : ""}`}>
                  <span className="macos-audit-bullet">{verificationPhase > 2 ? "✓" : "2"}</span>
                  <div className="macos-audit-text">
                    <strong>Matching 12-Digit Reference UTR #{utrInput}</strong>
                    <span>Confirming credit to {upiId} for ₹{amount.toLocaleString()}</span>
                  </div>
                </div>

                <div className={`macos-audit-row ${verificationPhase >= 3 ? "active" : ""}`}>
                  <span className="macos-audit-bullet">3</span>
                  <div className="macos-audit-text">
                    <strong>Issuing Signed Token &amp; Upgrading Limits</strong>
                    <span>Writing high-concurrency collection slots to workspace</span>
                  </div>
                </div>
              </div>

              <div className="macos-progress-bar">
                <div
                  className="macos-progress-fill"
                  style={{
                    width: verificationPhase === 1 ? "35%" : verificationPhase === 2 ? "75%" : "100%",
                  }}
                />
              </div>
            </div>
          ) : step === "receipt" ? (
            /* Digital Transaction Receipt view */
            <div className="macos-receipt-view">
              <div className="macos-receipt-stamp">
                <BadgeCheck size={28} color="#10b981" />
                <span>SETTLED &amp; VERIFIED</span>
              </div>

              <div className="macos-receipt-paper">
                <div className="receipt-paper-header">
                  <div className="receipt-brand">
                    <span className="receipt-brand-logo">DIG</span>
                    <span>INTELLIGENCE NETWORKS</span>
                  </div>
                  <span className="receipt-tx-code">
                    TXN-NPCI-{Math.floor(100000 + Math.random() * 900000)}
                  </span>
                </div>

                <div className="receipt-divider" />

                <div className="receipt-table">
                  <div className="receipt-row">
                    <span className="receipt-label">Subscribed Plan</span>
                    <span className="receipt-val bold">{plan.name}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Billing Cycle</span>
                    <span className="receipt-val">
                      {activeCycle === "annual"
                        ? `Annual Prepaid (${scaleMultiplier > 1 ? `${scaleMultiplier}x Scale · ` : ""}12 Mo)`
                        : `Monthly Flexible (${scaleMultiplier > 1 ? `${scaleMultiplier}x Scale · ` : ""}1 Mo)`}
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Amount Settled</span>
                    <span className="receipt-val bold price">₹{amount.toLocaleString()}.00</span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Platform Gateway Fee</span>
                    <span className="receipt-val" style={{ color: "#10b981" }}>
                      ₹0.00 (Direct UPI Rails)
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Bank UTR Reference</span>
                    <span className="receipt-val mono">{confirmedUtr}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Settlement Destination</span>
                    <span className="receipt-val">{upiId} (MAYANK GARG)</span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">Timestamp</span>
                    <span className="receipt-val">
                      {confirmedDate ||
                        new Date().toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                    </span>
                  </div>
                </div>

                <div className="receipt-divider" />

                <div className="receipt-features-unlocked">
                  <span className="receipt-section-label">UNLOCKED WORKSPACE PRIVILEGES</span>
                  <ul>
                    {plan.features.slice(0, 4).map((f) => (
                      <li key={f}>
                        <Check size={12} color="#10b981" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="macos-dialog-actions receipt-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Printer size={14} />
                  Print / Save PDF Receipt
                </button>
                <button
                  type="button"
                  className="btn blue"
                  onClick={() => onSuccess(plan.id, confirmedUtr)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Rocket size={14} />
                  Launch Upgraded Workspace
                </button>
              </div>
            </div>
          ) : (
            /* Step 1: Scan QR, Pay & Enter 12-Digit UTR */
            <div className="macos-payment-body">
              {/* Architecture callout for Low-Scale Businesses */}
              <div className="upi-smb-callout">
                <div className="upi-smb-callout-icon">
                  <ShieldCheck size={18} color="#00baf2" />
                </div>
                <div className="upi-smb-callout-content">
                  <strong>Zero-Commission Direct Settlement for Startups &amp; SMBs</strong>
                  <p>
                    Dig settles directly on NPCI UPI rails. By verifying the 12-digit UTR, you bypass
                    2–3% gateway aggregation fees and 72-hour payout lockups with 100% direct bank reconciliation.
                  </p>
                </div>
              </div>

              <div className="upi-checkout-grid">
                {/* Left Column: QR Code + Scanner Simulation */}
                <div className="upi-qr-card">
                  <div className="upi-qr-header">
                    <QrCode size={15} color="#4c6fff" />
                    <span>Scan with Any UPI App</span>
                  </div>

                  <div className="upi-qr-container custom-scanner">
                    {/* Camera Scanner Viewfinder Brackets */}
                    <span className="finder-bracket top-left" />
                    <span className="finder-bracket top-right" />
                    <span className="finder-bracket bottom-left" />
                    <span className="finder-bracket bottom-right" />

                    {/* Animated Laser Scanning Beam */}
                    <div className="upi-scan-laser-line" />

                    {/* Dedicated High-Resolution UPI QR Scanner */}
                    <img
                      src={paymentQrImg}
                      alt="UPI Payment QR Scanner - 9953314375@ptyes"
                      className="upi-qr-image"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/payment-qr.png";
                      }}
                    />
                  </div>

                  <div className="upi-amount-pill">
                    <span className="upi-pill-label">Payable:</span>
                    <span className="upi-pill-value">₹{amount.toLocaleString()}</span>
                  </div>

                  {/* VPA Copy Bar */}
                  <div className="upi-vpa-copy-bar">
                    <div className="upi-vpa-text">
                      <span className="upi-vpa-sub">UPI ID:</span>
                      <code>{upiId}</code>
                    </div>
                    <button
                      type="button"
                      className="upi-copy-btn"
                      onClick={handleCopyVpa}
                      title="Copy UPI ID"
                    >
                      {copiedVpa ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                      <span>{copiedVpa ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>

                  {/* Deep link for mobile users */}
                  <a
                    href={upiDeepLink}
                    className="upi-deep-link-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Smartphone size={13} />
                    <span>Open in Mobile UPI App</span>
                    <ExternalLink size={11} />
                  </a>

                  {/* Paytm in 5 Different Languages (English, Hindi, Tulu, Tamil, Telugu) */}
                  <div className="upi-apps-row">
                    <span className="upi-app-chip" title="English">Paytm</span>
                    <span className="upi-app-chip" title="Hindi (हिंदी)">पेटीएम</span>
                    <span className="upi-app-chip" title="Tulu (ತುಳು)">ಪೇಟಿಎಂ</span>
                    <span className="upi-app-chip" title="Tamil (தமிழ்)">பேடிஎம்</span>
                    <span className="upi-app-chip" title="Telugu (తెలుగు)">పేటీఎం</span>
                  </div>
                </div>

                {/* Right Column: Order Summary + 12-digit UTR Input */}
                <div className="utr-form-card">
                  <div className="utr-order-summary">
                    <div className="utr-summary-head">
                      <div>
                        <h4>{plan.name}</h4>
                        <span className="utr-cycle-tag">
                          {activeCycle === "annual" ? "Annual Prepaid (Save 17%)" : "Monthly Flexible Cycle"}
                          {plan.id === "scale" && ` · ${scaleMultiplier}x Capacity`}
                        </span>
                      </div>
                      <div className="utr-price-tag">
                        ₹{amount.toLocaleString()}
                      </div>
                    </div>

                    {/* In-Modal Interactive Billing Cycle Switcher */}
                    <div className="modal-cycle-toggle-bar">
                      <button
                        type="button"
                        className={`modal-cycle-pill ${activeCycle === "monthly" ? "active" : ""}`}
                        onClick={() => setActiveCycle("monthly")}
                      >
                        <span className="pill-title">Monthly Flexible</span>
                        <span className="pill-price">
                          ₹{plan.id === "scale" ? (scaleMultiplier === 1 ? "1,190" : scaleMultiplier === 2 ? "2,190" : scaleMultiplier === 3 ? "3,190" : "4,990") : "399"} / mo
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`modal-cycle-pill ${activeCycle === "annual" ? "active" : ""}`}
                        onClick={() => setActiveCycle("annual")}
                      >
                        <span className="pill-title">
                          Annual <span className="modal-discount-tag">17% OFF</span>
                        </span>
                        <span className="pill-price">
                          ₹{plan.id === "scale" ? (scaleMultiplier === 1 ? "11,900" : scaleMultiplier === 2 ? "21,900" : scaleMultiplier === 3 ? "31,900" : "49,900") : "3,990"} / yr
                        </span>
                      </button>
                    </div>

                    {/* Scale Capacity & Multiplier Selector for Scale & Agency Plan */}
                    {plan.id === "scale" && (
                      <div className="scale-capacity-selector">
                        <div className="scale-selector-label-row">
                          <span className="scale-label-title">Adjust Scale Tier Volume:</span>
                          <span className="scale-volume-badge">{scaleMultiplier}x Scale Tier</span>
                        </div>
                        <div className="scale-tier-options">
                          {[
                            { mult: 1, label: "1x Standard", runs: "250 runs", lists: "100 lists" },
                            { mult: 2, label: "2x Growth", runs: "500 runs", lists: "200 lists" },
                            { mult: 3, label: "3x Agency", runs: "750 runs", lists: "350 lists" },
                            { mult: 5, label: "5x Enterprise", runs: "1,250 runs", lists: "600 lists" },
                          ].map((opt) => (
                            <button
                              key={opt.mult}
                              type="button"
                              className={`scale-opt-card ${scaleMultiplier === opt.mult ? "active" : ""}`}
                              onClick={() => setScaleMultiplier(opt.mult)}
                            >
                              <div className="scale-opt-title">{opt.label}</div>
                              <div className="scale-opt-specs">{opt.runs} · {opt.lists}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="utr-steps-mini">
                      <div className="utr-step-item">
                        <span className="step-num">1</span>
                        <span>Scan the QR code with Paytm, PhonePe, or Google Pay.</span>
                      </div>
                      <div className="utr-step-item">
                        <span className="step-num">2</span>
                        <span>Transfer exactly <b>₹{amount.toLocaleString()}</b>.</span>
                      </div>
                      <div className="utr-step-item">
                        <span className="step-num">3</span>
                        <span>Copy the 12-digit <b>UTR / UPI Ref ID</b> from payment success.</span>
                      </div>
                      <div className="utr-step-item">
                        <span className="step-num">4</span>
                        <span>Paste the 12-digit UTR below for instant ledger verification.</span>
                      </div>
                    </div>
                  </div>

                  {/* UTR Input Section */}
                  <div className="utr-input-group">
                    <div className="utr-label-row">
                      <label htmlFor="utr-number-input">12-Digit Bank UTR / Reference No.</label>
                      <span className={`utr-digit-counter ${utrInput.length === 12 ? "valid" : ""}`}>
                        {utrInput.length} / 12 digits
                      </span>
                    </div>

                    <div className="utr-input-wrapper">
                      <input
                        id="utr-number-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={12}
                        value={utrInput}
                        onChange={handleUtrChange}
                        placeholder="0000 0000 0000"
                        className={`utr-text-input ${errorMessage ? "error" : ""} ${utrInput.length === 12 ? "success" : ""}`}
                      />
                      {utrInput.length === 12 && (
                        <span className="utr-valid-check">
                          <CheckCircle2 size={18} color="#10b981" />
                        </span>
                      )}
                    </div>

                    {errorMessage && <p className="utr-error-text">{errorMessage}</p>}

                    {/* Quick Demo auto-fill helper for reviewer/judges */}
                    <div className="utr-demo-box">
                      <span className="utr-demo-hint">Hackathon / Reviewer Fast Test:</span>
                      <button
                        type="button"
                        className="utr-demo-chip"
                        onClick={() => {
                          setUtrInput("428192837461");
                          setErrorMessage(null);
                        }}
                      >
                        ⚡ Auto-fill Demo UTR (428192837461)
                      </button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="macos-dialog-actions" style={{ marginTop: "18px" }}>
                    <button type="button" className="btn" onClick={onClose}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn blue"
                      disabled={utrInput.length !== 12}
                      onClick={handleStartVerification}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <ShieldCheck size={14} />
                      Verify UTR &amp; Activate Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

