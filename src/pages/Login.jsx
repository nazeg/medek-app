import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAlertConfirm } from '../contexts/AlertConfirmContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { alert } = useAlertConfirm();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      const role = user.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'coordinator') navigate('/coordinator');
      else if (role === 'instructor') navigate('/instructor');
      else navigate('/');
    } catch (err) {
      if (err.message && err.message.includes('Sisteme giriş yapabilmeniz için')) {
        alert(err.message, 'Giriş Engellendi', 'error');
      } else {
        setError('E-posta veya şifre hatalı.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md my-auto">
        <div className="text-center mb-8">
          <h1 className="text-display-lg text-on-surface font-bold">MEDEK PRO</h1>
          <p className="text-on-surface-variant font-body-lg mt-2">Akreditasyon & Değerlendirme Sistemi</p>
        </div>
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-8">
          <h2 className="text-headline-md text-on-surface mb-6">Giriş Yap</h2>
          {error && (
            <div className="bg-error-container/10 border border-error/20 text-error text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="ornek@universite.edu.tr"
                required
              />
            </div>
            <div>
              <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-lg py-2.5 font-bold text-sm hover:bg-primary-container transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
          <div className="mt-6 pt-6 border-t border-outline-variant">
            <p className="text-xs text-on-surface-variant text-center">Test hesapları:</p>
            <div className="mt-2 text-xs text-on-surface-variant space-y-1 text-center">
              <p><span className="font-semibold">admin@medek.com</span> / admin12345</p>
              <p><span className="font-semibold">koordinator@medek.com</span> / 12345678</p>
              <p><span className="font-semibold">ogretim@medek.com</span> / 12345678</p>
            </div>
          </div>
        </div>
      </div>
      <footer className="w-full max-w-md py-6 text-center text-xs text-on-surface-variant/70 border-t border-outline-variant/60 mt-auto">
        <p className="font-semibold">Geliştiriciler: Öğr. Gör. Osman ÖZEN - Şube Müdürü Nazmi EĞRET</p>
        <p className="mt-1">Kütahya Sağlık Bilimleri Üniversitesi</p>
      </footer>
    </div>
  );
}
