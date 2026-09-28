import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ORG_NAME } from "./events";
import { Auth } from "./pages/Auth";
import { ComingSoon } from "./pages/ComingSoon";
import { Dashboard } from "./pages/Dashboard";
import { EventFolder } from "./pages/EventFolder";
import { FolderBoard } from "./pages/FolderBoard";
import { JobBoard } from "./pages/JobBoard";
import { DevLog } from "./pages/DevLog";
import { Profile } from "./pages/Profile";
import { Stack } from "./pages/Stack";
import { Landing } from "./pages/Landing";
import { WhyDig } from "./pages/WhyDig";

function StandaloneJobBoard() {
  const { jobId = "" } = useParams();
  return <JobBoard jobId={jobId} crumbs={[{ label: ORG_NAME, to: "/dashboard" }, { label: "Job Board" }]} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/why" element={<WhyDig />} />
      <Route path="/dev-log" element={<DevLog />} />
      <Route path="/stack" element={<Stack />} />
      <Route
        path="/guide"
        element={<ComingSoon kicker="GUIDE" blurb="A walkthrough of how to use Dig — asking a question, reading the results, and resolving conflicts. It’s on its way." />}
      />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/events/:eventId" element={<EventFolder />} />
      <Route path="/events/:eventId/:folder" element={<FolderBoard />} />
      <Route path="/jobs/:jobId" element={<StandaloneJobBoard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
