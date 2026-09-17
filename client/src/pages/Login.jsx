import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 340 }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="mark">U</div>
          <div className="name">Ultimate CRM</div>
        </div>
        <h2 style={{ marginTop: 0 }}>Sign in</h2>
        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" autoCorrect="off" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="sub" style={{ color: 'var(--red)', margin: 0 }}>{error}</div>}
          <button className="btn primary" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
