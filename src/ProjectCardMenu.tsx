import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pin, Flag, EyeOff, RotateCcw } from "lucide-react";
import { projectApi } from "./ProjectPages";
import { REPORT_REASONS } from "../shared/project-reports.js";
type Card = {
  id: string;
  title: string;
  homepage_pinned?: boolean;
  homepage_hidden?: boolean;
};
export default function ProjectCardMenu({
  project,
  canManage,
  onChange,
}: {
  project: Card;
  canManage: boolean;
  onChange: () => void;
}) {
  const [reporting, setReporting] = useState(false),
    [reason, setReason] = useState(""),
    [details, setDetails] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (reporting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [reporting]);
  async function moderate(operation: string) {
    menu.current?.removeAttribute("open");
    setBusy(true);
    setError("");
    try {
      await projectApi("moderate", "PUT", { id: project.id, operation });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update project.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details ref={menu} name="project-actions" className="project-card-menu">
        <summary aria-label={"Options for " + project.title}>
          <MoreHorizontal size={21} />
        </summary>
        <div className="project-card-dropdown">
          {canManage && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void moderate(project.homepage_pinned ? "unpin" : "pin")
                }
              >
                <Pin size={15} />
                {project.homepage_pinned
                  ? "Use normal card"
                  : "Pin as wide card"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void moderate(project.homepage_hidden ? "restore" : "hide")
                }
              >
                {project.homepage_hidden ? (
                  <RotateCcw size={15} />
                ) : (
                  <EyeOff size={15} />
                )}{" "}
                {project.homepage_hidden
                  ? "Restore to front page"
                  : "Remove from front page"}
              </button>
            </>
          )}
          <button
            disabled={busy}
            onClick={() => {
              menu.current?.removeAttribute("open");
              setError("");
              setSent(false);
              setReporting(true);
            }}
          >
            <Flag size={15} />
            Report
          </button>
        </div>
      </details>
      {error && !reporting && (
        <p className="project-card-action-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="project-report-dialog"
        aria-labelledby={`report-title-${project.id}`}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setReporting(false);
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await projectApi("report", "POST", {
                id: project.id,
                reason,
                details,
              });
              setSent(true);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not submit report.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id={`report-title-${project.id}`}>Report project</h2>
          <p>{project.title}</p>
          {sent ? (
            <>
              <p role="status">
                Report received. The moderation team can now review it.
              </p>
              <button type="button" onClick={() => setReporting(false)}>
                Done
              </button>
            </>
          ) : (
            <fieldset disabled={busy}>
              <label>
                Reason
                <select
                  autoFocus
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Choose a reason</option>
                  {REPORT_REASONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Additional details {reason === "other" ? "" : "(optional)"}
                <textarea
                  maxLength={2000}
                  rows={4}
                  required={reason === "other"}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Tell moderators what they should review."
                />
              </label>
              <small>
                Reports are private and visible only to the moderation team.
                Sign in with Discord to submit.
              </small>
              {error && (
                <p role="alert">
                  {error} <a href="/api/auth/discord/login">Sign in</a>
                </p>
              )}
              <div>
                <button type="button" onClick={() => setReporting(false)}>
                  Cancel
                </button>
                <button disabled={!reason || busy}>
                  {busy ? "Submitting…" : "Submit report"}
                </button>
              </div>
            </fieldset>
          )}
        </form>
      </dialog>
    </>
  );
}
