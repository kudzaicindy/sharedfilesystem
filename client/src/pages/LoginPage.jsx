import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import CloudLogo from '../components/icons/CloudLogo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const prefilledEmail = searchParams.get('email') || '';

  const [form, setForm] = useState({ email: prefilledEmail, password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const registerLink = useMemo(() => {
    const params = new URLSearchParams();
    if (form.email) params.set('email', form.email);
    if (inviteToken) params.set('invite', inviteToken);
    const q = params.toString();
    return q ? `/register?${q}` : '/register';
  }, [form.email, inviteToken]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form.email, form.password);
      if (inviteToken) {
        try {
          await api.post(`/folders/invites/${inviteToken}/accept`);
        } catch {
          // claim-on-login already covers most cases
        }
      }
      navigate(inviteToken ? '/files' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen auth-stage flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="text-center mb-7">
          <CloudLogo className="w-12 h-12 mx-auto mb-3" variant="light" />
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Alamait</h1>
          <p className="text-sm text-white/55 mt-2">
            {inviteToken ? 'Sign in to accept your invite' : 'Shared documents for your team'}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 sm:p-7 shadow-lift border border-white/10">
          <h2 className="text-base font-bold text-brand-ink">Sign in</h2>
          <p className="text-xs text-gray-500 mt-1 mb-5">Continue to your workspace</p>

          {error && (
            <p className="text-xs text-red-700 mb-3 bg-red-50 border border-red-100 p-2.5 rounded-xl">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-field"
              placeholder="Email"
            />
            <input
              type="password"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="input-field"
              placeholder="Password"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-center text-gray-500 mt-5">
            No account?{' '}
            <Link to={registerLink} className="text-brand-maroon font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
