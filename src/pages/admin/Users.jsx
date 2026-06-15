import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function Users() {
  const { alert, confirm } = useAlertConfirm();
  const [users, setUsers] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', faculty: '', title: '', programIds: [] });
  const [programs, setPrograms] = useState([]);

  const load = async () => {
    const [u, f, p] = await Promise.all([
      pb.collection('users').getFullList({ sort: 'name', expand: 'faculty' }),
      pb.collection('faculties').getFullList({ sort: 'name' }),
      pb.collection('programs').getFullList({ sort: 'name' }),
    ]);
    setUsers(u);
    setFaculties(f);
    setPrograms(p);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      let savedUser;
      if (editItem) {
        const updateData = { name: form.name, role: form.role, faculty: form.faculty, title: form.title };
        savedUser = await pb.collection('users').update(editItem.id, updateData);
      } else {
        savedUser = await pb.collection('users').create({
          name: form.name, email: form.email, password: form.password,
          passwordConfirm: form.passwordConfirm, role: form.role, faculty: form.faculty, title: form.title,
          emailVisibility: true,
          active: true,
        });
      }

      // Program assignment logic
      if (form.role === 'coordinator' || form.role === 'program_head') {
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
      setForm({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', faculty: '', title: '', programIds: [] });
      load();
    } catch (err) {
      await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    const assignedProgs = programs.filter(p => p.head === item.id).map(p => p.id);
    setEditItem(item);
    setForm({ 
      name: item.name, 
      email: item.email, 
      password: '', 
      passwordConfirm: '', 
      role: item.role, 
      faculty: item.faculty || '', 
      title: item.title || '', 
      programIds: assignedProgs
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      await pb.collection('users').delete(id);
      load();
    }
  };

  const toggleActive = async (user) => {
    const nextState = user.active === false ? true : false;
    try {
      await pb.collection('users').update(user.id, { active: nextState });
      load();
    } catch (err) {
      await alert('Durum güncellenirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const roleLabels = { admin: 'Sistem Yöneticisi', coordinator: 'Bölüm/Program Başkanı', program_head: 'Bölüm/Program Başkanı', instructor: 'Öğretim Elemanı' };
  const roleColors = { admin: 'bg-primary-fixed text-on-primary-fixed-variant', coordinator: 'bg-surface-container-highest text-on-surface', program_head: 'bg-surface-container-highest text-on-surface', instructor: 'bg-tertiary-fixed text-on-tertiary-fixed-variant' };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Kullanıcı Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Kullanıcı rolleri ve yetkilendirme</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', faculty: '', title: '', programIds: [] }); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
          <span className="material-symbols-outlined text-lg">person_add</span> Kullanıcı Ekle
        </button>
      </div>
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-on-surface-variant font-label-md border-b border-outline-variant">
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs">Kullanıcı Bilgisi</th>
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs">Rol</th>
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs">Fakülte / MYO</th>
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs">Durum</th>
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-right text-xs">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {u.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-on-surface text-sm">{u.title ? `${u.title} ${u.name}` : u.name}</p>
                        <p className="text-xs text-on-surface-variant">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleColors[u.role] || ''}`}>
                      {roleLabels[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-on-surface-variant font-medium">
                    <div>{u.expand?.faculty?.name || '—'}</div>
                    {(u.role === 'coordinator' || u.role === 'program_head') && (
                      <div className="mt-1 flex flex-col gap-1">
                        {programs.filter(p => p.head === u.id).map(p => (
                          <div key={p.id} className="text-xs text-primary font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">schema</span>
                            {p.name}
                          </div>
                        ))}
                        {programs.filter(p => p.head === u.id).length === 0 && (
                          <div className="text-xs text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">schema</span>
                            Bölüm/Program Atanmamış
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        u.active !== false ? 'bg-secondary' : 'bg-outline-variant'
                      }`}
                      title={u.active !== false ? 'Pasif Yap' : 'Aktif Yap'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          u.active !== false ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1 transition-opacity">
                      <button onClick={() => handleEdit(u)} className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 hover:bg-surface-container rounded-lg text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant text-sm">Henüz kullanıcı eklenmemiş.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md text-on-surface">{editItem ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ünvan</label>
                  <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
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
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ad Soyad</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">E-posta</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" disabled={!!editItem} />
              </div>
              {!editItem && (
                <>
                  <div>
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Şifre</label>
                    <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Şifre Tekrar</label>
                    <input type="password" value={form.passwordConfirm} onChange={e => setForm({ ...form, passwordConfirm: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                </>
              )}
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Rol</label>
                <select 
                  value={form.role === 'program_head' ? 'coordinator' : form.role} 
                  onChange={e => setForm({ ...form, role: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                  <option value="admin">Sistem Yöneticisi</option>
                  <option value="coordinator">Bölüm/Program Başkanı</option>
                  <option value="instructor">Öğretim Elemanı</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Fakülte / MYO</label>
                <select value={form.faculty} onChange={e => setForm({ ...form, faculty: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
                  <option value="">Seçiniz</option>
                  {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {(form.role === 'coordinator' || form.role === 'program_head') && (
                <div>
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Atanacağı Bölümler / Programlar</label>
                  <div className="border border-outline-variant rounded-lg p-3 max-h-40 overflow-y-auto space-y-1 bg-surface-container-lowest">
                    {programs.map(p => {
                      const isChecked = form.programIds?.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2.5 text-sm font-medium text-on-surface cursor-pointer select-none hover:bg-surface-container-low p-1.5 rounded transition-colors">
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
                      <p className="text-xs text-on-surface-variant text-center py-2">Henüz bölüm/program eklenmemiş.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
