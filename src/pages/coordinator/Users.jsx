import { useState, useEffect, useMemo } from 'react';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function CoordinatorUsers() {
  const { user: coordinatorUser } = useAuth();
  const { alert, confirm } = useAlertConfirm();

  const [users, setUsers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and filter states
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'instructor' | 'coordinator'

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Form states
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    role: 'instructor',
    title: '',
    faculty: ''
  });

  const load = async () => {
    setLoading(true);
    try {
      // Sistem yöneticileri hariç tüm kullanıcıları getir
      const [u, p, f] = await Promise.all([
        pb.collection('users').getFullList({ sort: 'name', expand: 'faculty', filter: 'role != "admin"' }),
        pb.collection('programs').getFullList({ sort: 'name' }),
        pb.collection('faculties').getFullList({ sort: 'name' }),
      ]);
      const nonAdminUsers = u.filter(user => user.role !== 'admin');
      setUsers(nonAdminUsers);
      setPrograms(p);
      setFaculties(f);
    } catch (err) {
      console.error('Error loading users:', err);
      alert('Kullanıcı listesi yüklenirken bir hata oluştu: ' + (err.message || err), 'Hata', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [coordinatorUser]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditItem(null);
    setForm({
      name: '',
      email: '',
      password: '',
      passwordConfirm: '',
      role: 'instructor',
      title: '',
      faculty: coordinatorUser?.faculty || ''
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleEdit = (item) => {
    if (item.role !== 'instructor') {
      alert('Bölüm Başkanı yalnızca öğretim elemanları üzerinde düzenleme yapabilir.', 'Yetki Sınırı', 'warning');
      return;
    }

    setEditItem(item);
    setForm({
      name: item.name || '',
      email: item.email || '',
      password: '',
      passwordConfirm: '',
      role: 'instructor', // Rol kesinlikle ve sadece instructor kalır
      title: item.title || '',
      faculty: item.faculty || coordinatorUser?.faculty || ''
    });
    setShowModal(true);
  };



  // Save (Create or Update)
  const handleSave = async (e) => {
    if (e) e.preventDefault();

    if (!form.name.trim()) {
      alert('Lütfen öğretim elemanının adını ve soyadını giriniz.', 'Eksik Bilgi', 'warning');
      return;
    }

    if (!editItem) {
      if (!form.email.trim()) {
        alert('Lütfen geçerli bir e-posta adresi giriniz.', 'Eksik Bilgi', 'warning');
        return;
      }

      // Sistemde bu e-posta adresiyle kayıtlı kullanıcı var mı kontrol et
      try {
        const checkRes = await pb.collection('users').getList(1, 1, {
          filter: `email = "${form.email.trim()}"`
        });
        if (checkRes.items.length > 0) {
          alert(`"${form.email.trim()}" e-posta adresine sahip bir kullanıcı sistemde zaten kayıtlıdır. Bölüm başkanı yalnızca sistemde bulunmayan yeni öğretim elemanlarını ekleyebilir.`, 'Kullanıcı Zaten Mevcut', 'warning');
          return;
        }
      } catch (checkErr) {
        console.warn('Email check warning:', checkErr);
      }

      if (!form.password || form.password.length < 8) {
        alert('Şifre en az 8 karakter olmalıdır.', 'Eksik Bilgi', 'warning');
        return;
      }
      if (form.password !== form.passwordConfirm) {
        alert('Girilen şifreler birbiriyle eşleşmiyor.', 'Hata', 'error');
        return;
      }
    }

    // Rol daima ve kesinlikle 'instructor'
    const safeRole = 'instructor';

    try {
      let savedUser;
      if (editItem) {
        const updateData = {
          name: form.name.trim(),
          role: safeRole,
          faculty: form.faculty || null,
          title: form.title || ''
        };
        savedUser = await pb.collection('users').update(editItem.id, updateData);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.USER,
          details: `"${form.title ? form.title + ' ' : ''}${form.name}" öğretim elemanının bilgileri güncellendi.`,
          metadata: { userId: savedUser.id, role: safeRole }
        });
      } else {
        savedUser = await pb.collection('users').create({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          passwordConfirm: form.passwordConfirm,
          role: safeRole,
          faculty: form.faculty || null,
          title: form.title || '',
          emailVisibility: true,
          active: true,
        });
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.USER,
          details: `"${form.title ? form.title + ' ' : ''}${form.name}" (${form.email}) adlı yeni öğretim elemanı oluşturuldu.`,
          metadata: { userId: savedUser.id, role: safeRole, email: form.email }
        });
      }

      setShowModal(false);
      setEditItem(null);
      await alert(editItem ? 'Öğretim elemanı bilgileri güncellendi.' : 'Yeni öğretim elemanı başarıyla eklendi.', 'Başarılı', 'success');
      load();
    } catch (err) {
      await alert('Kayıt işlemi başarısız: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const roleLabels = {
    coordinator: 'Bölüm/Program Başkanı',
    program_head: 'Bölüm/Program Başkanı',
    instructor: 'Öğretim Elemanı'
  };

  const roleBadgeStyles = {
    coordinator: 'bg-blue-100 text-blue-800 border border-blue-200',
    program_head: 'bg-blue-100 text-blue-800 border border-blue-200',
    instructor: 'bg-emerald-100 text-emerald-800 border border-emerald-200'
  };

  // Filtered users list (Admins are completely excluded)
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (u.role === 'admin') return false;

      // Role filter
      if (roleFilter === 'instructor' && u.role !== 'instructor') return false;
      if (roleFilter === 'coordinator' && u.role !== 'coordinator' && u.role !== 'program_head') return false;

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const fullName = (u.title ? `${u.title} ${u.name}` : u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const faculty = (u.expand?.faculty?.name || '').toLowerCase();
        return fullName.includes(q) || email.includes(q) || faculty.includes(q);
      }
      return true;
    });
  }, [users, roleFilter, search]);

  const counts = useMemo(() => {
    let instructors = 0;
    let coordinators = 0;
    users.forEach(u => {
      if (u.role === 'instructor') instructors++;
      else if (u.role === 'coordinator' || u.role === 'program_head') coordinators++;
    });
    return { all: instructors + coordinators, instructors, coordinators };
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-display-md text-on-surface font-bold">Kullanıcı Yönetimi</h2>
          <p className="text-on-surface-variant font-body-md mt-1">
            Bölümünüze bağlı öğretim elemanlarını ekleyebilir, mevcut kullanıcıları listeleyip yönetebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          Öğretim Elemanı Ekle
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Role Filter Pills */}
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                roleFilter === 'ALL'
                  ? 'bg-white text-primary shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tümü ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('instructor')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                roleFilter === 'instructor'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Öğretim Elemanları ({counts.instructors})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('coordinator')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                roleFilter === 'coordinator'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bölüm / Program Başkanları ({counts.coordinators})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ad, unvan, e-posta veya fakülte ara..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-outline-variant rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-outline-variant text-[11px] font-bold uppercase tracking-wider">
                <th className="px-4 py-3">Kullanıcı Bilgisi</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Fakülte / MYO</th>
                <th className="px-4 py-3">Atandığı Programlar</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></span>
                      <span>Kullanıcılar yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 font-medium">
                    <span className="material-symbols-outlined text-4xl block mb-2 opacity-30">person_off</span>
                    Arama kriterlerine uygun kullanıcı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCoord = u.role === 'coordinator' || u.role === 'program_head';
                  const initials = u.name
                    ? u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    : '??';

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* User Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              isCoord ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">
                              {u.title ? `${u.title} ${u.name}` : u.name}
                            </div>
                            <div className="text-slate-400 text-xs font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${roleBadgeStyles[u.role] || 'bg-slate-100 text-slate-700'}`}>
                          <span>{roleLabels[u.role] || u.role}</span>
                        </span>
                      </td>

                      {/* Faculty */}
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {u.expand?.faculty?.name || <span className="text-slate-300 italic">—</span>}
                      </td>

                      {/* Assigned Programs */}
                      <td className="px-4 py-3">
                        {isCoord ? (
                          <div className="flex flex-col gap-1 max-w-xs">
                            {programs.filter(p => p.head === u.id).map(p => (
                              <div key={p.id} className="text-xs text-primary font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">schema</span>
                                <span className="truncate">{p.name}</span>
                              </div>
                            ))}
                            {programs.filter(p => p.head === u.id).length === 0 && (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold inline-block w-fit">
                                Program Atanmamış
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Active Status (Read-only for Coordinator) */}
                      <td className="px-4 py-3 text-center">
                        {u.active !== false ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 select-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Pasif
                          </span>
                        )}
                      </td>

                      {/* Actions (Only Edit for Instructors, No Delete) */}
                      <td className="px-4 py-3 text-right">
                        {isCoord ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md cursor-not-allowed select-none"
                            title="Bölüm Başkanı hesapları üzerinde işlem yapılamaz."
                          >
                            <span className="material-symbols-outlined text-xs">lock</span>
                            Düzenlenemez
                          </span>
                        ) : (
                          <div className="flex justify-end items-center">
                            <button
                              type="button"
                              onClick={() => handleEdit(u)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-primary rounded-lg transition-colors cursor-pointer"
                              title="Bilgileri Düzenle"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto border border-outline-variant">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">
                  {editItem ? 'manage_accounts' : 'person_add'}
                </span>
                <h3 className="text-base font-bold text-slate-800">
                  {editItem ? 'Öğretim Elemanı Düzenle' : 'Yeni Öğretim Elemanı Ekle'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Title & Name */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Ünvan
                  </label>
                  <select
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="">Seçiniz</option>
                    <option value="Prof. Dr.">Prof. Dr.</option>
                    <option value="Doç. Dr.">Doç. Dr.</option>
                    <option value="Dr. Öğr. Üyesi">Dr. Öğr. Üyesi</option>
                    <option value="Öğr. Gör. Dr.">Öğr. Gör. Dr.</option>
                    <option value="Öğr. Gör.">Öğr. Gör.</option>
                    <option value="Arş. Gör. Dr.">Arş. Gör. Dr.</option>
                    <option value="Arş. Gör.">Arş. Gör.</option>
                    <option value="Öğr. Elemanı">Öğr. Elemanı</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Ad Soyad <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  E-posta Adresi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  disabled={Boolean(editItem)}
                  placeholder="ornek@ksbu.edu.tr"
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-slate-100 disabled:text-slate-400"
                />
                {editItem && (
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Kayıtlı e-posta adresi güvenlik nedeniyle değiştirilemez.
                  </span>
                )}
              </div>

              {/* Passwords (Only for New User) */}
              {!editItem && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Şifre (Min. 8 Karakter) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Şifre Tekrar <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={form.passwordConfirm}
                      onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
                      placeholder="••••••••"
                      className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* Fixed Role & Faculty Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Rol
                  </label>
                  <div className="w-full border border-slate-200 bg-slate-100 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between cursor-not-allowed select-none">
                    <span>Öğretim Elemanı</span>
                    <span className="material-symbols-outlined text-xs text-slate-400" title="Bölüm Başkanı yalnızca Öğretim Elemanı rolünde ekleme yapabilir">lock</span>
                  </div>
                </div>

                {/* Faculty Selection */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Fakülte / Yüksekokul
                  </label>
                  <select
                    value={form.faculty}
                    onChange={e => setForm({ ...form, faculty: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="">Seçiniz</option>
                    {faculties.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-container shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
