import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import pb from '../../lib/pocketbase';

const adminNav = [
  { to: '/admin', icon: 'dashboard', label: 'Genel Bakış' },
  { to: '/admin/faculties', icon: 'school', label: 'Fakülte / MYO' },
  { to: '/admin/departments', icon: 'schema', label: 'Bölüm / Program' },
  { to: '/admin/users', icon: 'manage_accounts', label: 'Kullanıcılar' },
  { to: '/admin/terms', icon: 'calendar_month', label: 'Dönem Yönetimi' },
  { to: '/admin/reports', icon: 'analytics', label: 'Raporlar' },
  { to: '/admin/logs', icon: 'history', label: 'İşlem Geçmişi' },
];

const coordinatorNav = [
  { to: '/coordinator', icon: 'dashboard', label: 'Genel Bakış' },
  { to: '/coordinator/courses', icon: 'auto_stories', label: 'Eğitim Müfredatı' },
  { to: '/coordinator/program-outcomes', icon: 'target', label: 'Program Çıktıları (PÇ)' },
  { to: '/coordinator/course-outcomes', icon: 'description', label: 'Ders Çıktıları (DÇ)' },
  { to: '/coordinator/matrix', icon: 'grid_on', label: 'PÇ-DÇ Matrisi' },
  { to: '/coordinator/reports', icon: 'analytics', label: 'Analizler' },
];

const instructorNav = [
  { to: '/instructor', icon: 'dashboard', label: 'Genel Bakış' },
  { to: '/instructor/course-outcomes', icon: 'description', label: 'Ders Çıktıları (DÇ)' },
  { to: '/instructor/matrix', icon: 'grid_on', label: 'PÇ-DÇ Matrisi' },
  { to: '/instructor/exams', icon: 'assignment_turned_in', label: 'Sınavlar' },
  { to: '/instructor/grades', icon: 'group', label: 'Not Girişi' },
  { to: '/instructor/reports', icon: 'analytics', label: 'Analizler' },
];

const TITLES = ['', 'Prof. Dr.', 'Doç. Dr.', 'Dr. Öğr. Üyesi', 'Öğr. Gör. Dr.', 'Öğr. Gör.', 'Arş. Gör. Dr.', 'Arş. Gör.', 'Öğr. Elemanı'];

function ProfileModal({ user, onClose, onSaved }) {
  const [tab, setTab] = useState('info'); // 'info' | 'password'
  const [form, setForm] = useState({ name: user?.name || '', title: user?.title || '' });
  const [pwForm, setPwForm] = useState({ oldPassword: '', password: '', passwordConfirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInfoSave = async () => {
    if (!form.name.trim()) { setError('Ad Soyad boş bırakılamaz.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      await pb.collection('users').update(user.id, { name: form.name.trim(), title: form.title });
      setSuccess('Bilgiler başarıyla güncellendi.');
      onSaved({ ...user, name: form.name.trim(), title: form.title });
    } catch (e) {
      setError('Güncelleme başarısız: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    setError(''); setSuccess('');
    if (!pwForm.oldPassword) { setError('Mevcut şifrenizi giriniz.'); return; }
    if (pwForm.password.length < 8) { setError('Yeni şifre en az 8 karakter olmalıdır.'); return; }
    if (pwForm.password !== pwForm.passwordConfirm) { setError('Yeni şifreler eşleşmiyor.'); return; }
    setSaving(true);
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: pwForm.oldPassword,
        password: pwForm.password,
        passwordConfirm: pwForm.passwordConfirm,
      });
      setSuccess('Şifre başarıyla değiştirildi.');
      setPwForm({ oldPassword: '', password: '', passwordConfirm: '' });
    } catch (e) {
      setError('Şifre değiştirilemedi: ' + (e?.response?.message || e.message || 'Mevcut şifre hatalı olabilir.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onMouseDown={(e) => { e.currentTarget.dataset.outside = e.target === e.currentTarget ? '1' : '0'; }}
      onClick={(e) => { if (e.currentTarget.dataset.outside === '1') onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F172A] px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {user?.title ? `${user.title} ${user.name}` : user?.name}
            </p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant bg-surface-container-lowest">
          <button
            onClick={() => { setTab('info'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'info'
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-sm">person</span>
            Bilgilerim
          </button>
          <button
            onClick={() => { setTab('password'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'password'
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-sm">lock</span>
            Şifre Değiştir
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-error-container/10 border border-error/20 text-error text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-secondary/10 border border-secondary/20 text-secondary text-xs rounded-lg px-3 py-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              {success}
            </div>
          )}

          {tab === 'info' && (
            <>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">Ünvan</label>
                <select
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                  {TITLES.map(t => (
                    <option key={t} value={t}>{t || 'Seçiniz'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">Ad Soyad</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">E-posta</label>
                <input
                  value={user?.email || ''}
                  disabled
                  className="w-full border border-outline-variant bg-slate-50 text-slate-400 rounded-lg px-3 py-2.5 text-sm cursor-not-allowed"
                />
              </div>
              <button
                onClick={handleInfoSave}
                disabled={saving}
                className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-bold hover:bg-primary-container transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </>
          )}

          {tab === 'password' && (
            <>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">Mevcut Şifre</label>
                <input
                  type="password"
                  value={pwForm.oldPassword}
                  onChange={e => setPwForm({ ...pwForm, oldPassword: e.target.value })}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">Yeni Şifre</label>
                <input
                  type="password"
                  value={pwForm.password}
                  onChange={e => setPwForm({ ...pwForm, password: e.target.value })}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="En az 8 karakter"
                />
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5 text-xs">Yeni Şifre Tekrar</label>
                <input
                  type="password"
                  value={pwForm.passwordConfirm}
                  onChange={e => setPwForm({ ...pwForm, passwordConfirm: e.target.value })}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="••••••••"
                />
              </div>
              <button
                onClick={handlePasswordSave}
                disabled={saving}
                className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-bold hover:bg-primary-container transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {saving ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, logout, hasRole, setUser } = useAuth();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);

  let navItems = [];
  const isCoordinator = hasRole('coordinator') || hasRole('program_head');
  const isInstructorView = isCoordinator && location.pathname.startsWith('/instructor');

  if (hasRole('admin')) navItems = adminNav;
  else if (isCoordinator) {
    if (isInstructorView) {
      navItems = instructorNav;
    } else {
      if (hasRole('program_head')) {
        navItems = coordinatorNav.filter(item => item.to !== '/coordinator/users');
      } else {
        navItems = coordinatorNav;
      }
    }
  }
  else if (hasRole('instructor')) navItems = instructorNav;

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

  return (
    <>
      <aside className="w-[260px] h-screen fixed left-0 top-0 bg-[#0F172A] flex flex-col py-margin-desktop shadow-md z-50">
        <div className="px-6 mb-10">
          <h1 className="text-headline-lg font-bold text-white tracking-tight">MEDEK PRO</h1>
          <p className="text-slate-400 text-[10px] uppercase tracking-widest font-semibold mt-1">Akreditasyon & Değerlendirme</p>
          {isCoordinator && (
            <div className="mt-4 p-0.5 bg-slate-900/80 rounded-lg border border-slate-800 flex gap-0.5">
              <NavLink
                to="/coordinator"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-all ${
                  !isInstructorView
                    ? 'bg-primary text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
                Bölüm/Prog. Başkanı
              </NavLink>
              <NavLink
                to="/instructor"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-all ${
                  isInstructorView
                    ? 'bg-primary text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">school</span>
                Öğretim Elemanı
              </NavLink>
            </div>
          )}
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/coordinator' || item.to === '/instructor'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 font-body-md text-body-md ${isActive
                  ? 'text-white bg-primary/10 border-l-4 border-primary font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border-l-4 border-transparent'
                }`
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 mt-auto">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl group">
            {/* Clickable profile area */}
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
              title="Profil ayarları"
            >
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-white font-bold text-sm flex-shrink-0 group-hover:ring-2 group-hover:ring-primary/40 transition-all">
                {initials}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-white text-sm font-semibold truncate">{user?.name || 'Kullanıcı'}</p>
                <p className="text-slate-500 text-[10px] truncate flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[10px]">settings</span>
                  Profili düzenle
                </p>
              </div>
            </button>
            <button onClick={logout} className="text-slate-500 hover:text-white transition-colors p-1 flex-shrink-0" title="Çıkış">
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {showProfile && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onSaved={(updatedUser) => {
            if (setUser) setUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}
    </>
  );
}
