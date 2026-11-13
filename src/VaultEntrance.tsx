import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
type Props = {
  code: string;
  setCode: (code: string) => void;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  authenticated: boolean;
  error?: string;
};
const format = (value: string) => {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18);
  return clean.match(/.{1,6}/g)?.join("-") || "";
};
export default function VaultEntrance({ code, setCode, onContinue, busy = false, authenticated, error = "" }: Props) {
  const [visible, setVisible] = useState(true);
  const entered = code.replace(/-/g, "").slice(0, 18);
  const displayed = [..."XXXXXX-XXXXXX-XXXXXX"].map((character, index) => {
    if (character === "-") return "-";
    const inputIndex = index - (index > 6 ? 1 : 0) - (index > 13 ? 1 : 0);
    if (inputIndex < entered.length)
      return visible ? entered[inputIndex] : "•";
    // The underscore replaces the NEXT X, then advances with each keystroke.
    if (inputIndex === entered.length && entered.length < 18)
      return null;
    return "X";
  });

  return (
    <main className="vault-screen">
      <div className="vault-shade" aria-hidden="true" />
      <div className="vault-ui">
        <img className="vault-logo" src="/con-logo.png" alt="C0N" />
        <h1>ACCESS CODE REQUIRED</h1>
        <form className="vault-form" onSubmit={onContinue}>
          <div className="vault-terminal">
            <span className="vault-prompt" aria-hidden="true">&gt;</span>
            <div className="vault-editor">
              <span className="vault-display" aria-hidden="true">
                {displayed.map((char, index) => {
                  return char === null
                    ? <span className="vault-cursor" key={index}>_</span>
                    : <span key={index}>{char}</span>;
                })}
                {entered.length === 18 && <span className="vault-cursor">_</span>}
              </span>
              <input
                aria-label="Invitation access code"
                name="access_code"
                value={code}
                onChange={event => setCode(format(event.target.value))}
                maxLength={20}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                type="text"
                required
                pattern="[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}"
              />
            </div>
            <button className="vault-visibility" type="button"
              onClick={() => setVisible(value => !value)}
              aria-label={visible ? "Hide access code" : "Show access code"}
              aria-pressed={!visible} title={visible ? "Hide code" : "Show code"}>
              {visible ? <Eye size={26} /> : <EyeOff size={26} />}
            </button>
          </div>
          <button className="vault-continue" type="submit" disabled={busy || code.replace(/-/g, "").length !== 18}>
            <span className="vault-discord-mark" aria-hidden="true">◈</span>
            <span>{busy ? "VERIFYING" : "CONTINUE"}</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        {error ? <p role="alert" className="vault-error">{error}</p> : null}
        {!authenticated && (
          <a className="vault-returning" href="/api/auth/discord/login" aria-label="Existing member Discord sign in" title="Existing member sign in with Discord">◈</a>
        )}
      </div>
    </main>
  );
}
