import StorageCleanup from "./StorageCleanup";
import VODSourceLibrary from "./VODSourceLibrary";

// Platform → Storage: housekeeping for the private video buckets. Nothing here
// adds content; that lives under Content → Add VOD.
export default function StorageToolsPanel({ videosList, showsList, showToast, logAudit }) {
  return (
    <div style={{ maxWidth: 1240 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Storage</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Clear out unused video files, and browse or swap the files behind a title.</p>
      </div>
      <StorageCleanup showToast={showToast} logAudit={logAudit} />
      <div style={{ marginTop: 18 }}>
        <VODSourceLibrary movies={videosList} shows={showsList} showToast={showToast} logAudit={logAudit} />
      </div>
    </div>
  );
}
