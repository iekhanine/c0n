import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { adminApi } from "./adminApi";
type Report = {
  summary: {
    website_posts: number;
    active_channels: number;
    delivered: number;
    attention: number;
  };
  deliveries: {
    id: string;
    state: string;
    updated_at: string;
    last_error: string | null;
    title: string;
    kind: string;
    channel_name: string;
  }[];
};
export default function Reports() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi<Report>("reports")
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <div className="con-reports-view">
      <div className="con-report-toolbar">
        <p>Publishing totals and the latest 100 Discord deliveries.</p>
        <button disabled={loading} onClick={() => setAttempt((a) => a + 1)}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && (
        <div role="alert" className="con-tool-error">
          {error}
        </div>
      )}
      {loading && !report ? (
        <p className="con-tool-empty" role="status">
          Loading reports…
        </p>
      ) : (
        report && (
          <>
            <div className="con-stat-grid">
              <article>
                <span>Website posts</span>
                <strong>{report.summary.website_posts}</strong>
              </article>
              <article>
                <span>Active channels</span>
                <strong>{report.summary.active_channels}</strong>
              </article>
              <article>
                <span>Discord deliveries</span>
                <strong>{report.summary.delivered}</strong>
              </article>
              <article>
                <span>Need attention</span>
                <strong>{report.summary.attention}</strong>
              </article>
            </div>
            <section className="con-surface">
              <div className="con-list-heading">
                <h2>Delivery history</h2>
                <span>Read only</span>
              </div>
              {!report.deliveries.length ? (
                <p className="con-tool-empty">
                  No Discord deliveries yet. Your first published post will
                  appear here.
                </p>
              ) : (
                <div className="con-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Post</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Last updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.deliveries.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>
                              {d.title ||
                                (d.kind === "project"
                                  ? "Project"
                                  : "Untitled update")}
                            </strong>
                            {d.last_error && <small>{d.last_error}</small>}
                          </td>
                          <td>{d.channel_name}</td>
                          <td>
                            <span className={`con-delivery-badge ${d.state}`}>
                              {d.state}
                            </span>
                          </td>
                          <td>{new Date(d.updated_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
