import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

/** UI only — there is deliberately no real authentication. Submitting just opens the Dashboard. */
export function Auth({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate("/dashboard");
  };
  const signup = mode === "signup";
  return (
    <div
      className="landing"
      style={{
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(rgba(23,17,13,.78), rgba(23,17,13,.9)), url(/art/hero.jpg) center / cover",
      }}
    >
      <form className="auth-card" onSubmit={submit}>
        <Link to="/">
          <img src="/art/logo.png" alt="Dig" style={{ height: 38, display: "block", margin: "0 auto 18px" }} />
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>
          {signup ? "Start digging" : "Welcome back"}
        </h1>
        <p style={{ textAlign: "center", color: "var(--dust)", fontSize: 13, margin: "0 0 8px" }}>
          {signup ? "Create your team’s space for event research." : "Log in to your team’s events."}
        </p>
        {signup && (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" autoComplete="name" placeholder="Arnav Sawhney" />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" placeholder="you@geekroom.in" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} placeholder="••••••••" />
        <button type="submit" className="px-btn" style={{ width: "100%", justifyContent: "center", marginTop: 22 }}>
          {signup ? "Sign up free" : "Log in"}
        </button>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--dust)", margin: "18px 0 0" }}>
          {signup ? "Already digging? " : "New to Dig? "}
          <Link to={signup ? "/login" : "/signup"} style={{ color: "var(--amber)" }}>
            {signup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </form>
    </div>
  );
}
