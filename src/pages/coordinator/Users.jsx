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
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'instructor' | 'coordinator' | 'admin'

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
    faculty: '',
    programIds: []
  });

  const load = async () => {
    setLoading(true);
    try {
      // Fetch all users across the system so coordinator can see everyone
      const [u, p, f] = await Promise.all([
        pb.collection('users').getFullList({ sort: 'name', expand: 'faculty' }),
        pb.collection('programs').getFullList({ sort: 'name' }),
        pb.collection('faculties').getFullList({ sort: 'name' }),
      ]);
      setUsers(u);
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
      faculty: coordinatorUser?.faculty || '',
      programIds: []
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleEdit = (item) => {
    if (item.role === 'admin') {
      alert('Sistem yöneticisi (admin) hesapları üzerinde düzenleme yetkiniz bulunmamaktadır.', 'Yetki Sınırı', 'warning');
      return;
    }

    const assignedProgs = programs.filter(p => p.head === item.id).map(p => p.id);
    setEditItem(item);
    setForm({
      name: item.name || '',
      email: item.email || '',
      password: '',
      passwordConfirm: '',
      role: item.role === 'program_head' ? 'program_head' : 'instructor',
      title: item.title || '',
      faculty: item.faculty || coordinatorUser?.faculty || '',
      programIds: assignedProgs
    });
    setShowModal(true);
  };

  // Delete User
  const handleDelete = async (id) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    if (targetUser.role === 'admin') {
      alert('Sistem yöneticisi (admin) hesapları silinemez.', 'Yetki Sınırı', 'warning');
      return;
    }

    const confirmed = await confirm(
      `"${targetUser.title ? targetUser.title + ' ' : ''}${targetUser.name}" (${targetUser.email}) kullanıcısını sistemden silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
    );

    if (confirmed) {
      try {
        await pb.collection('users').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.USER,
          details: `"${targetUser.title ? targetUser.title + ' ' : ''}${targetUser.name}" (${targetUser.email}) kullanıcısı Bölüm Başkanı tarafından sistemden silindi.`,
          metadata: { userId: id, name: targetUser.name, email: targetUser.email }
        });
        await alert('Kullanıcı başarıyla silindi.', 'Başarılı', 'success');
        load();
      } catch (err) {
        await alert('Silme işlemi başarısız: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
      }
    }
  };

  // Toggle Active/Inactive
  const toggleActive = async (targetUser) => {
    if (targetUser.role === 'admin') {
      alert('Sistem yöneticisi (admin) hesaplarının durumu değiştirilemez.', 'Yetki Sınırı', 'warning');
      return;
    }

    const nextState = targetUser.active === false ? true : false;
    try {
      await pb.collection('users').update(targetUser.id, { active: nextState });
      logAction({
        action: LOG_ACTIONS.UPDATE,
        category: LOG_CATEGORIES.USER,
        details: `"${targetUser.name}" (${targetUser.email}) kullanıcısının hesap durumu ${nextState ? 'Aktif' : 'Pasif'} yapıldı.`,
        metadata: { userId: targetUser.id, active: nextState }
      });
      load();
    } catch (err) {
      await alert('Durum güncellenirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  // Save (Create or Update)
  const handleSave = async (e) => {
    if (e) e.preventDefault();

    if (!form.name.trim()) {
      alert('Lütfen kullanıcı adını ve soyadını giriniz.', 'Eksik Bilgi', 'warning');
      return;
    }

    if (!editItem) {
      if (!form.email.trim()) {
        alert('Lütfen geçerli bir e-posta adresi giriniz.', 'Eksik Bilgi', 'warning');
        return;
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

    // Role safety: coordinator can never assign 'admin'
    const safeRole = form.role === 'admin' ? 'instructor' : form.role;

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
          details: `"${form.title ? form.title + ' ' : ''}${form.name}" kullanıcısının bilgileri güncellendi. Rol: ${roleLabels[safeRole] || safeRole}`,
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
          details: `"${form.title ? form.title + ' ' : ''}${form.name}" (${form.email}) adlı yeni kullanıcı Bölüm Başkanı tarafından oluşturuldu.`,
          metadata: { userId: savedUser.id, role: safeRole, email: form.email }
        });
      }

      // Program assignment logic if program_head
      if (safeRole === 'program_head') {
        const selectedProgIds = form.programIds || [];
        const toRemoveProgs = programs.filter(p => p.head === savedUser.id && !selectedProgIds.includes(p.id));
        for (const pp of toRemoveProgs) {
          await pb.collection('programs').update(pp.id, { head: '' });
        }
        for (const progId of selectedProgIds) {
          const prog = programs.find(p => p.id === progId);
          if (prog && prog.head !== savedUser.id) {
            await pb.collection('programs').update(progId, { head: savedUser.id });
          }
        }
      } else {
        const previousProgs = programs.filter(p => p.head === savedUser.id);
        for (const pp of previousProgs) {
          await pb.collection('programs').update(pp.id, { head: '' });
        }
      }

      setShowModal(false);
      setEditItem(null);
      await alert(editItem ? 'Kullanıcı bilgileri güncellendi.' : 'Yeni öğretim elemanı başarıyla eklendi.', 'Başarılı', 'success');
      load();
    } catch (err) {
      await alert('Kayıt işlemi başarısız: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const roleLabels = {
    admin: 'Sistem Yöneticisi',
    coordinator: 'Bölüm/Program Başkanı',
    program_head: 'Bölüm/Program Başkanı',
    instructor: 'Öğretim Elemanı'
  };

  const roleBadgeStyles = {
    admin: 'bg-purple-100 text-purple-800 border border-purple-200',
    coordinator: 'bg-blue-100 text-blue-800 border border-blue-200',
    program_head: 'bg-blue-100 text-blue-800 border border-blue-200',
    instructor: 'bg-emerald-100 text-emerald-800 border border-emerald-200'
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Role filter
      if (roleFilter === 'instructor' && u.role !== 'instructor') return false;
      if (roleFilter === 'coordinator' && u.role !== 'coordinator' && u.role !== 'program_head') return false;
      if (roleFilter === 'admin' && u.role !== 'admin') return false;

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
    let admins = 0;
    users.forEach(u => {
      if (u.role === 'admin') admins++;
      else if (u.role === 'coordinator' || u.role === 'program_head') coordinators++;
      else if (u.role === 'instructor') instructors++;
    });
    return { all: users.length, instructors, coordinators, admins };
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-display-md text-on-surface font-bold">Kullanıcı Yönetimi</h2>
          <p className="text-on-surface-variant font-body-md mt-1">
            Bölümünüze bağlı öğretim elemanlarını ekleyebilir, tüm sistem kullanıcılarını görüntüleyebilirsiniz.
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
            <button
              type="button"
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                roleFilter === 'admin'
                  ? 'bg-white text-purple-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sistem Yöneticileri ({counts.admins})
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
          <span className="material-symbols-outlined text-sm text-amber-600">info</span>
          <span>
            <b>Bilgi:</b> Tüm kullanıcılar listelenmektedir. Sistem Yöneticisi (Admin) hesapları korumalıdır ve üzerinde işlem yapılamaz.
          </span>
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
                  const isAdmin = u.role === 'admin';
                  const initials = u.name
                    ? u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    : '??';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        isAdmin ? 'bg-purple-50/20' : ''
                      }`}
                    >
                      {/* User Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              isAdmin
                                ? 'bg-purple-100 text-purple-800'
                                : u.role === 'coordinator' || u.role === 'program_head'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                              <span>{u.title ? `${u.title} ${u.name}` : u.name}</span>
                              {isAdmin && (
                                <span className="material-symbols-outlined text-purple-600 text-xs" title="Sistem Yöneticisi">
                                  shield_person
                                </span>
                              )}
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
                        {u.role === 'program_head' || u.role === 'coordinator' ? (
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

                      {/* Active Status */}
                      <td className="px-4 py-3 text-center">
                        {isAdmin ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full cursor-not-allowed select-none"
                            title="Admin hesap durumu değiştirilemez"
                          >
                            <span className="material-symbols-outlined text-[13px]">lock</span>
                            Aktif
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              u.active !== false ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                            title={u.active !== false ? 'Pasife Al' : 'Aktif Yap'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                u.active !== false ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isAdmin ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md cursor-not-allowed select-none"
                            title="Sistem yöneticisi hesapları üzerinde işlem yapma yetkisi bulunmamaktadır."
                          >
                            <span className="material-symbols-outlined text-xs">lock</span>
                            İşlem Yetkisi Yok
                          </span>
                        ) : (
                          <div className="flex justify-end gap-1 items-center">
                            <button
                              type="button"
                              onClick={() => handleEdit(u)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-primary rounded-lg transition-colors cursor-pointer"
                              title="Düzenle"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(u.id)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Sil"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
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
                  {editItem ? 'Kullanıcı Düzenle' : 'Yeni Öğretim Elemanı Ekle'}
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

              {/* Role Selection (Admin is deliberately omitted) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Rol <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="instructor">Öğretim Elemanı</option>
                    <option value="program_head">Bölüm/Program Başkanı</option>
                  </select>
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

              {/* Program assignment (Only when role is program_head) */}
              {form.role === 'program_head' && (
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Atanacağı Bölümler / Programlar
                  </label>
                  <div className="border border-outline-variant rounded-lg p-3 max-h-36 overflow-y-auto space-y-1.5 bg-slate-50">
                    {programs.map(p => {
                      const isChecked = form.programIds?.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 text-xs font-medium text-slate-800 cursor-pointer select-none hover:bg-white p-1 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked || false}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...(form.programIds || []), p.id]
                                : (form.programIds || []).filter(id => id !== p.id);
                              setForm({ ...form, programIds: nextIds });
                            }}
                            className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                          />
                          <span>{p.name}</span>
                        </label>
                      );
                    })}
                    {programs.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Sistemde kayıtlı program bulunmuyor.</p>
                    )}
                  </div>
                </div>
              )}

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
