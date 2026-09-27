import { MarketingFooter, MarketingNav, PixelHeading, Reveal, TypedLines } from "../components/Marketing";

export function WhyDig() {
  return (
    <div className="landing mk-page">
      <MarketingNav />

      <header className="why-hero">
        <PixelHeading as="div" className="why-kicker">WHY_DIG</PixelHeading>
        <TypedLines
          className="why-title"
          label="Stop searching. Start digging."
          lines={[[["Stop searching."]], [["Start digging.", true]]]}
        />
        <p className="why-lede">
          Finding the right sponsor, mentor, judge, or lead still means hours of manual digging — tab after tab, list after
          list, hoping the sheet you’re copying into isn’t already out of date. <b>Dig does the digging. You just ask.</b>
        </p>
      </header>

      <div className="why-body">
        <Reveal className="why-card">
          <div className="why-split">
            <div>
              <PixelHeading>the_problem</PixelHeading>
              <p className="why-sub">Everyone starts the same way, and it never gets faster.</p>
            </div>
            <p className="why-text">
              Search Google for the obvious names, then go site by site — Unstop, HackerEarth, Devfolio — checking who’s
              actually sponsoring right now. Hours later, you have a spreadsheet. Often it’s just last year’s list, copied
              forward — sponsors who’ve since dropped out, contacts who’ve since left. Nobody rechecks it, because rechecking
              means doing the whole search again.
            </p>
          </div>
          <div className="why-ways">
            <img src="/art/why-manual.jpg" alt="The manual way: hours of tab-switching. A sheet that was already stale the day it was reused." />
            <img src="/art/why-chatbot.jpg" alt="The chatbot way: fast, confident answers — with no source, no date, and no way to check if that email still works." />
          </div>
        </Reveal>

        <Reveal className="why-card center">
          <PixelHeading>let_us_dig</PixelHeading>
          <p className="why-sub">Dig runs the same research process a person would — just without the hours.</p>
          <img
            className="why-tiles"
            src="/art/why-tiles.jpg"
            alt="Grounded, not generated. Sourced. Stays current. Knows what it doesn’t know. Built the way research actually works."
          />
        </Reveal>

        <Reveal className="why-card">
          <PixelHeading>always_something_to_dig_for</PixelHeading>
          <p className="why-sub">One engine, built for whatever you’re digging for.</p>
          <div className="why-split orbit">
            <div className="why-text">
              <p>
                The hunt for information shouldn’t cost you the time you need for the actual decision. Dig handles the hunt,
                so sponsors get closed, jobs get landed, and courses get picked, faster.
              </p>
              <p>Sponsors, mentors, judges — that’s where Dig starts. The same engine scales to any question worth digging for.</p>
            </div>
            <img
              src="/art/why-orbit.jpg"
              alt="Five uses around one engine: Event teams, Students, Job seekers, Sales teams, Researchers."
            />
          </div>
        </Reveal>

        <Reveal className="why-card center">
          <img
            className="why-panel"
            src="/art/why-panel.jpg"
            alt="Less time hunting, more time deciding. From scattered search to one sourced sheet, always kept in order — Dig does the digging so you’re never rebuilding the same list twice."
          />
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
