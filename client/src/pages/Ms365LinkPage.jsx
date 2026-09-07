import { Link, useSearchParams } from 'react-router-dom';
import CloudLogo from '../components/icons/CloudLogo';

export default function Ms365LinkPage() {
  const [params] = useSearchParams();
  const ok = params.get('ok') === '1';
  const error = params.get('error');

  return (
    <div className="min-h-screen auth-stage flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <CloudLogo className="w-8 h-8 mb-3" />
        <h1 className="text-sm font-bold text-gray-900">Microsoft 365</h1>
        {ok ? (
          <p className="text-xs text-emerald-700 mt-2">
            Account connected. Open an Office file and choose “Edit in Microsoft 365 Online”.
          </p>
        ) : (
          <p className="text-xs text-red-700 mt-2">
            {error || 'Could not connect Microsoft account.'}
          </p>
        )}
        <Link to="/files" className="inline-block mt-4 text-xs font-bold text-brand-maroon underline">
          Back to files
        </Link>
      </div>
    </div>
  );
}
