import type { ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ROOT_CRUMB } from "./events";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { DevLog } from "./pages/DevLog";
import { EventFolder } from "./pages/EventFolder";
import { FolderBoard } from "./pages/FolderBoard";
import { JobBoard } from "./pages/JobBoard";
import { Landing } from "./pages/Landing";
import { Profile } from "./pages/Profile";
import { Stack } from "./pages/Stack";
import { WhyDig } from "./pages/WhyDig";
import { RequireAuth } from "./session";

function StandaloneJobBoard() {
  const { jobId = "" } = useParams();
  return <JobBoard jobId={jobId} crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }, { label: "Job Board" }]} />;
}

const app = (screen: ReactNode) => <RequireAuth>{screen}</RequireAuth>;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/why" element={<WhyDig />} />
      <Route path="/dev-log" element={<DevLog />} />
      <Route path="/stack" element={<Stack />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/dashboard" element={app(<Dashboard />)} />
      <Route path="/profile" element={app(<Profile />)} />
      <Route path="/events/:eventId" element={app(<EventFolder />)} />
      <Route path="/events/:eventId/:folder" element={app(<FolderBoard />)} />
      <Route path="/jobs/:jobId" element={app(<StandaloneJobBoard />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
