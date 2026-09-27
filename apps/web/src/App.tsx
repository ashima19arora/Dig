import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ORG_NAME } from "./events";
import { Auth } from "./pages/Auth";
import { ComingSoon } from "./pages/ComingSoon";
import { Dashboard } from "./pages/Dashboard";
import { EventFolder } from "./pages/EventFolder";
import { FolderBoard } from "./pages/FolderBoard";
import { JobBoard } from "./pages/JobBoard";
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
      <Route
        path="/dev-log"
        element={<ComingSoon kicker="DEV_LOG" blurb="Notes from building Dig — what we tried, what broke, and what we shipped. The first entries are on their way." />}
      />
      <Route
        path="/stack"
        element={<ComingSoon kicker="THE_STACK" blurb="A look at the tools and pieces that power Dig, from collection to the final sourced sheet. Details are on their way." />}
      />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/events/:eventId" element={<EventFolder />} />
      <Route path="/events/:eventId/:folder" element={<FolderBoard />} />
      <Route path="/jobs/:jobId" element={<StandaloneJobBoard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
