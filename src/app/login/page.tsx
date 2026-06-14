'use client';

import { useState, type FormEvent } from 'react';
import s from '@/components/editor.module.css';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get('next') || '/';
        // Only allow same-origin paths (avoid open redirects).
        window.location.assign(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      } else {
        setErr('Wrong password.');
      }
    } catch {
      setErr('Could not sign in — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.app}>
          <h1>Social Approvals</h1>
        </header>
        <form className={s.bar} onSubmit={submit} style={{ maxWidth: 420 }}>
          <div className={s.field}>
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              className={s.input}
              type="password"
              value={password}
              autoFocus
              placeholder="Enter the editor password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className={s.barfoot}>
            <button className={`${s.btn} ${s.btnGold}`} type="submit" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
          {err && (
            <div className={s.errorMsg} style={{ marginTop: 10 }}>
              {err}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
