import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import CloudLogo from '../components/icons/CloudLogo';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function InvitePage() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await axios.get(`${API}/folders/invites/${token}`);
        if (!cancelled) setInvite(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Invite not found or already used.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError('');
    try {
      await api.post(`/folders/invites/${token}/accept`);
      navigate('/files');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not accept invite.');
    } finally {
      setAccepting(false);
    }
  }

  const registerHref = invite
    ? `/register?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(token)}`
    : '/register';
  const loginHref = invite
    ? `/login?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(token)}`
    : '/login';

  return (
    <div className="min-h-screen auth-stage flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="text-center mb-7">
          <CloudLogo className="w-12 h-12 mx-auto mb-3" variant="light" />
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Alamait</h1>
          <p className="text-sm text-white/55 mt-2">Folder invitation</p>
        </div>

        <div className="rounded-2xl bg-white p-6 sm:p-7 shadow-lift border border-white/10">
          {loading || authLoading ? (
            <p className="text-xs text-gray-500">Loading invite…</p>
          ) : error && !invite ? (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 p-2.5 rounded-xl">{error}</p>
          ) : invite ? (
            <>
              <h2 className="text-base font-bold text-brand-ink">You’re invited</h2>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                <strong>{invite.inviterName}</strong> invited you to
                {' '}<strong>{invite.folderName}</strong> as <strong>{invite.role}</strong>.
              </p>
              <p className="text-[11px] text-gray-500 mt-2 mb-5">
                Invited email: {invite.email}
              </p>

              {error && (
                <p className="text-xs text-red-700 mb-3 bg-red-50 border border-red-100 p-2 rounded-lg">{error}</p>
              )}

              {user ? (
                <button
                  type="button"
                  onClick={accept}
                  disabled={accepting}
                  className="btn-primary w-full py-2.5"
                >
                  {accepting ? 'Accepting…' : 'Accept invite'}
                </button>
              ) : (
                <div className="space-y-2.5">
                  <Link to={registerHref} className="btn-primary w-full py-2.5">
                    Create account to accept
                  </Link>
                  <Link to={loginHref} className="btn-secondary w-full py-2.5">
                    Sign in to accept
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
