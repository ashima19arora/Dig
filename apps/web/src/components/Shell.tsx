import { Archive, ChevronLeft, ChevronRight, Clock, LogOut, Search, Star, User } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useEvents } from "../events";

export type SideView = "favourites" | "recent" | "archived" | null;

export interface Crumb {
  label: string;
  to?: string;
  icon?: ReactNode;
}

export function AppWindow(props: {
  crumbs: Crumb[];
  actions?: ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  sidebar?: SideView | false;
  status?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const showSidebar = props.sidebar !== false;
  return (
    <div className="desk">
      <div className="window">
        <div className="titlebar">
          <div className="lights" style={showSidebar ? undefined : { width: "auto", marginRight: 10 }}>
            <span />
            <span />
            <span />
          </div>
          <div className="nav-arrows">
            <button onClick={() => navigate(-1)} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => navigate(1)} aria-label="Forward">
              <ChevronRight size={18} />
            </button>
          </div>
          <nav className="crumbs">
            {props.crumbs.map((crumb, index) => {
              const last = index === props.crumbs.length - 1;
              return (
                <span key={`${crumb.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {index > 0 && <ChevronRight size={14} color="#aeaeb2" />}
                  {crumb.icon}
                  {last || !crumb.to ? <b>{crumb.label}</b> : <Link to={crumb.to}>{crumb.label}</Link>}
                </span>
              );
            })}
          </nav>
          <div className="spacer" />
          {props.actions}
          {props.search && (
            <label className="search">
              <Search size={14} />
              <input
                value={props.search.value}
                onChange={(event) => props.search?.onChange(event.target.value)}
                placeholder={props.search.placeholder ?? "Search"}
              />
            </label>
          )}
          {showSidebar && <div className="avatar">AS</div>}
        </div>
        <div className="window-body">
          {props.sidebar !== false && <Sidebar active={props.sidebar ?? null} />}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{props.children}</div>
        </div>
        {props.status !== undefined && <div className="statusbar">{props.status}</div>}
        <AskDiglett />
      </div>
    </div>
  );
}

function Sidebar({ active }: { active: SideView }) {
  const events = useEvents();
  const live = events.filter((event) => !event.archived);
  const items: Array<{ key: Exclude<SideView, null>; label: string; icon: ReactNode; count: number }> = [
    { key: "favourites", label: "Favourites", icon: <Star size={16} />, count: live.filter((event) => event.favourite).length },
    { key: "recent", label: "Recent", icon: <Clock size={16} />, count: live.length },
    { key: "archived", label: "Archived", icon: <Archive size={16} />, count: events.length - live.length },
  ];
  return (
    <aside className="sidebar">
      <h6>Events</h6>
      <div className="side-group">
        {items.map((item) => (
          <Link key={item.key} to={`/dashboard?view=${item.key}`} className={`side-item${active === item.key ? " active" : ""}`}>
            {item.icon}
            {item.label}
            <span className="count">{item.count}</span>
          </Link>
        ))}
      </div>
      <h6>Account</h6>
      <div className="side-group">
        <button className="side-item">
          <User size={16} />
          Profile
        </button>
        <Link to="/" className="side-item">
          <LogOut size={16} />
          Log Out
        </Link>
      </div>
    </aside>
  );
}

/** Visual-only for now: pulsing status dot, grows slightly on hover. */
export function AskDiglett() {
  return (
    <button className="diglett" aria-label="Ask Diglett">
      <img src="/art/mole-avatar.png" alt="" />
      <span className="dot" />
      <span className="diglett-tip">Ask Diglett</span>
    </button>
  );
}

export function FolderIcon({ starred, size = 94 }: { starred?: boolean; size?: number }) {
  const h = Math.round(size * 0.76);
  return (
    <svg width={size} height={h} viewBox="0 0 94 72" aria-hidden>
      <defs>
        <linearGradient id="fb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc4f7" />
          <stop offset="1" stopColor="#5cb0f1" />
        </linearGradient>
      </defs>
      <path d="M4 10a6 6 0 0 1 6-6h22l7 7h45a6 6 0 0 1 6 6v6H4z" fill="#62b5f2" />
      <rect x="2" y="15" width="90" height="55" rx="6" fill="url(#fb)" />
      <rect x="2" y="15" width="90" height="2" rx="1" fill="#9fd4fa" opacity="0.8" />
      {starred && (
        <path
          d="M81 53l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z"
          fill="#fff"
        />
      )}
    </svg>
  );
}

export function NewFolderIcon({ size = 94 }: { size?: number }) {
  const h = Math.round(size * 0.76);
  return (
    <svg width={size} height={h} viewBox="0 0 94 72" aria-hidden>
      <path d="M4 10a6 6 0 0 1 6-6h22l7 7h45a6 6 0 0 1 6 6v53H4z" fill="#f4f8fd" />
      <path
        d="M10 4.5h21.8l7 7h45.2a5.5 5.5 0 0 1 5.5 5.5v47.5a5.5 5.5 0 0 1-5.5 5.5H10a5.5 5.5 0 0 1-5.5-5.5V10A5.5 5.5 0 0 1 10 4.5z"
        fill="none"
        stroke="#a9cdf1"
        strokeWidth="1.3"
        strokeDasharray="4 3"
      />
      <path d="M47 30v20M37 40h20" stroke="#4a90d9" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
