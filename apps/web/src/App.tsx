import { Route, Routes } from "react-router-dom";

// Placeholder pages — we build these one by one, matching the Claude Design
// screens: Landing, Dashboard, EventFolder, JobBoard, Compose.
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-ink">
      <div className="text-center">
        <div className="kicker mb-2">Dig</div>
        <div className="display text-2xl">{name}</div>
        <div className="mt-1 text-sm text-mute">Not built yet — this route boots so the app runs.</div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Landing" />} />
      <Route path="/dashboard" element={<Placeholder name="Dashboard" />} />
      <Route path="/events/:eventId" element={<Placeholder name="Event Folder" />} />
      <Route path="/jobs/:jobId" element={<Placeholder name="Job Board" />} />
      <Route path="/compose" element={<Placeholder name="Compose" />} />
    </Routes>
  );
}
