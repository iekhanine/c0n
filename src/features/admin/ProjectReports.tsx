import { useEffect, useState } from "react";
import { projectApi } from "../../ProjectPages";
import { REPORT_REASONS } from "../../../shared/project-reports.js";
type Report = {
  id: string;
  project_id: string;
  project_title: string;
  reporter_name: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  review_note: string;
  homepage_hidden: boolean;
};
export default function ProjectReports() {
  const [reports, setReports] = useState<Report[]>([]),
    [state, setState] = useState("open"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState<Record<string, string>>({});
  async function load() {
    setLoading(true);
    try {
      const d = await projectApi("project_reports&state=" + state);
      setReports(d.reports);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [state]);
  async function review(r: Report, decision: string) {
    setBusy(r.id);
    try {
      await projectApi("review_report", "PUT", {
        report_id: r.id,
        decision,
        note: note[r.id] || "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review report.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="con-project-reports">
      <div className="con-report-toolbar">
        <label>
          Report status
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="open">Open</option>
            <option value="dismissed">Dismissed</option>
            <option value="removed">Removed from front page</option>
          </select>
        </label>
        <button disabled={loading || Boolean(busy)} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && (
        <p className="con-tool-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading project reports…</p>}
      {!loading && !reports.length && !error && <p>No {state} reports.</p>}
      {reports.map((r) => (
        <article className="con-project-report" key={r.id}>
          <header>
            <a
              href={"/projects/" + r.project_id}
              target="_blank"
              rel="noreferrer"
            >
              <h2>{r.project_title}</h2>
            </a>
            <span>{r.status}</span>
          </header>
          <p>
            <strong>
              {REPORT_REASONS.find(([v]) => v === r.reason)?.[1] || r.reason}
            </strong>
          </p>
          <p>
            Reported by {r.reporter_name} ·{" "}
            {new Date(r.created_at).toLocaleString()}
          </p>
          <p className="con-report-details">
            {r.details || "No additional details."}
          </p>
          {r.review_note && <p>Review note: {r.review_note}</p>}
          {r.status === "open" && (
            <>
              <label>
                Review note (optional)
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={note[r.id] || ""}
                  onChange={(e) =>
                    setNote((n) => ({ ...n, [r.id]: e.target.value }))
                  }
                />
              </label>
              <div className="con-button-row">
                <button
                  disabled={Boolean(busy)}
                  onClick={() => void review(r, "dismiss")}
                >
                  Dismiss report
                </button>
                <button
                  className="con-danger"
                  disabled={Boolean(busy)}
                  onClick={() => void review(r, "remove")}
                >
                  {busy === r.id ? "Saving…" : "Remove from front page"}
                </button>
              </div>
            </>
          )}
          {r.status === "removed" && r.homepage_hidden && (
            <button
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy(r.id);
                try {
                  await projectApi("moderate", "PUT", {
                    id: r.project_id,
                    operation: "restore",
                  });
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Restore failed.");
                } finally {
                  setBusy("");
                }
              }}
            >
              Restore to front page
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
