import { AppWindow, FolderIcon } from "../components/Shell";
import { ROOT_CRUMB } from "../events";
import { Link } from "react-router-dom";

const FOLDERS = [
  { to: "/agents/kickoff", name: "Kickoff" },
  { to: "/agents/lens", name: "Lens" },
  { to: "/agents/merger", name: "Merger" },
  { to: "/agents/flow", name: "Flow" },
];

export function AgentsHome() {
  return (
    <AppWindow crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }, { label: "Toolkit" }]} sidebar="agents" status="4 folders">
      <div className="content">
        <div className="label-muted">Toolkit</div>
        <div className="folders">
          {FOLDERS.map((folder) => (
            <Link key={folder.to} to={folder.to} className="folder">
              <FolderIcon />
              <span className="name">{folder.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}
