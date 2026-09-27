import { useNavigate } from "react-router-dom";
import { MarketingFooter, MarketingNav, PixelHeading } from "../components/Marketing";

export function ComingSoon({ kicker, blurb }: { kicker: string; blurb: string }) {
  const navigate = useNavigate();
  return (
    <div className="landing mk-page soon-page">
      <MarketingNav />
      <main className="soon">
        <PixelHeading as="div" className="why-kicker">{kicker}</PixelHeading>
        <h1 className="soon-title">
          Coming soon<span className="caret blink" />
        </h1>
        <p className="why-lede">{blurb}</p>
        <button className="px-btn" onClick={() => navigate("/")}>
          Back to home
        </button>
      </main>
      <MarketingFooter />
    </div>
  );
}
