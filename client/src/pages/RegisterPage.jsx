import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import CloudLogo from '../components/icons/CloudLogo';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const prefilledEmail = searchParams.get('email') || '';

  const [form, setForm] = useState({
    name: '',
    email: prefilledEmail,
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginLink = useMemo(() => {
    const params = new URLSearchParams();
    if (form.email) params.set('email', form.email);
    if (inviteToken) params.set('invite', inviteToken);
    const q = params.toString();
    return q ? `/login?${q}` : '/login';
  }, [form.email, inviteToken]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
      if (inviteToken) {
        try {
          await api.post(`/folders/invites/${inviteToken}/accept`);
        } catch {
          // claim-on-register already covers most cases
        }
      }
      navigate(inviteToken ? '/files' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
            {inviteToken ? 'Create an account to accept your invite' : 'Create your workspace'}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 sm:p-7 shadow-lift border border-white/10">
          <h2 className="text-base font-bold text-brand-ink">Create account</h2>
          <p className="text-xs text-gray-500 mt-1 mb-5">Takes less than a minute</p>

          {error && (
            <p className="text-xs text-red-700 mb-3 bg-red-50 border border-red-100 p-2.5 rounded-xl">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-field"
              placeholder="Full name"
            />
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
              minLength={8}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="input-field"
              placeholder="Password (min 8 chars)"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="text-xs text-center text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to={loginLink} className="text-brand-maroon font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
