import { useQuery } from "@tanstack/react-query";
import { LogOut, Pencil, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ago, api, type JobSummary } from "../api";
import { AppWindow } from "../components/Shell";
import { ORG_NAME, useEvents } from "../events";
import { initials, saveProfile, useProfile, type Profile as ProfileData } from "../profile";

export function Profile() {
  const profile = useProfile();
  const events = useEvents();
  const [editing, setEditing] = useState(false);
  const jobsQ = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: JobSummary[] }>("/api/jobs") });

  // Live sponsor searches are the ones that hold real data; demo fixtures don't count toward your work.
  const searches = (jobsQ.data?.jobs ?? [])
    .filter((job) => !job.demo && job.versionNumber !== null)
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  const records = searches.reduce((sum, job) => sum + job.rowCount, 0);
  const pending = searches.reduce((sum, job) => sum + job.pendingConflicts, 0);
  const active = events.filter((event) => !event.archived);
  const eventFor = (jobId: string) => events.find((event) => Object.values(event.jobs).includes(jobId));
  const badge = initials(profile.name);

  const stats: Array<[string, string | number]> = [
    ["Active events", active.length],
    ["Favourites", active.filter((event) => event.favourite).length],
    ["Archived", events.length - active.length],
    ["Live searches", jobsQ.isLoading ? "…" : searches.length],
    ["Records collected", jobsQ.isLoading ? "…" : records.toLocaleString()],
    ["Conflicts to review", jobsQ.isLoading ? "…" : pending],
  ];

  return (
    <AppWindow crumbs={[{ label: ORG_NAME, to: "/dashboard" }, { label: "Profile" }]} sidebar="profile">
      <div className="content profile">
        <section className="card profile-card">
          <div className="profile-avatar">{badge || <User size={30} />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{profile.name || "Add your name"}</h1>
            <div className="sub">{profile.email || "No email yet"}</div>
            <div className="sub">
              {profile.role ? `${profile.role} · ` : ""}
              {ORG_NAME}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit profile
            </button>
            <Link to="/" className="btn">
              <LogOut size={13} /> Log out
            </Link>
          </div>
        </section>
        <p className="profile-note">Accounts aren’t connected to a server yet — your profile is saved in this browser only.</p>

        <h5>Workspace</h5>
        <div className="profile-stats">
          {stats.map(([label, value]) => (
            <div key={label} className="card">
              <div className="cap">{label}</div>
              <div className="stat">{value}</div>
            </div>
          ))}
        </div>

        <h5>Recent searches</h5>
        {jobsQ.isError ? (
          <p className="err">Couldn’t reach the Dig API: {String(jobsQ.error)}</p>
        ) : searches.length === 0 ? (
          <p className="profile-note">{jobsQ.isLoading ? "Loading…" : "No searches yet — start one from an event’s New Query button."}</p>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {searches.slice(0, 6).map((job) => {
              const event = eventFor(job.id);
              return (
                <Link key={job.id} to={`/jobs/${job.id}`} className="side-item profile-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{job.name}</b>
                    <span className="sub">
                      “{job.query}” · {job.rowCount} records · v{job.versionNumber}
                      {event ? ` · filed under ${event.name}` : ""}
                    </span>
                  </span>
                  <span className="count">{ago(job.lastRunAt ?? job.updatedAt)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {editing && <ProfileSheet initial={profile} onClose={() => setEditing(false)} />}
    </AppWindow>
  );
}

function ProfileSheet({ initial, onClose }: { initial: ProfileData; onClose: () => void }) {
  const [values, setValues] = useState(initial);
  const set = (key: keyof ProfileData) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveProfile({ name: values.name.trim(), email: values.email.trim(), role: values.role.trim() });
    onClose();
  };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="sheet" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <h3>Edit profile</h3>
        <label>Name</label>
        <input autoFocus value={values.name} onChange={set("name")} placeholder="Your name" />
        <label>Email</label>
        <input type="email" value={values.email} onChange={set("email")} placeholder="you@geekroom.in" />
        <label>Role</label>
        <input value={values.role} onChange={set("role")} placeholder="Sponsorship lead" />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn blue">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
