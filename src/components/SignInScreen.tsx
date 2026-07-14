import { useState } from 'react';
import { backend, USE_MOCK_GOOGLE } from '../google';

type Props = { onSignedIn: (email: string) => void };

export function SignInScreen({ onSignedIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { email } = await backend.signIn();
      onSignedIn(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-panel">
      <div className="game-icon" style={{ margin: '0 auto 20px' }}>
        🎮
      </div>
      <h1>DX-GST</h1>
      <div className="sub">
        Game Speed Test — sign in with your S5Tech Google account to upload recordings
        and log the heatmap.
      </div>
      <button type="button" className="btn primary" disabled={busy} onClick={signIn}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {USE_MOCK_GOOGLE && (
        <p className="auto-note" style={{ marginTop: 16 }}>
          Mock mode — Google APIs are simulated until real IDs are set in src/config.ts.
        </p>
      )}
      {error && <div className="invalid-msg" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
