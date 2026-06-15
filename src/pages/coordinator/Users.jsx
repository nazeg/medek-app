import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useTerm } from '../../contexts/TermContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function CoordinatorUsers() {
  const { user: coordinatorUser } = useAuth();
  const { activeTerm } = useTerm();
  const { alert, confirm } = useAlertConfirm();
  const [users, setUsers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  // Existing user search states
  const [isExistingMode, setIsExistingMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedExistingUser, setSelectedExistingUser] = useState(null);

  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', title: '', programIds: [] });

  const load = async () => {
    if (!coordinatorUser) return;
    try {
      const filterQuery = `(role = "instructor" || role = "program_head") ${coordinatorUser.faculty ? `&& faculty = "${coordinatorUser.faculty}"` : ''}`;
      
      const [u, p] = await Promise.all([
        pb.collection('users').getFullList({ sort: 'name', filter: filterQuery }),
        pb.collection('programs').getFullList({ 
          sort: 'name', 
          filter: `head = "${coordinatorUser.id}"`
        }),
      ]);
      setUsers(u);
      setPrograms(p);
    } catch (err) {
      console.error('Error loading coordinator users:', err);
    }
  };

  useEffect(() => {
    load();
  }, [coordinatorUser]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    try {
      const filter = `(name ~ "${query}" || email ~ "${query}") && id != "${coordinatorUser.id}" && role != "admin"`;
      const results = await pb.collection('users').getList(1, 15, { filter });
      const filtered = results.items.filter(u => !users.some(ex => ex.id === u.id));
      setSearchResults(filtered);
    } catch (err) {
      console.error('Error searching users:', err);
    }
  };

  const handleSave = async () => {
    try {
      let savedUser;
      if (editItem) {
        const updateData = { name: form.name, role: form.role, title: form.title };
        savedUser = await pb.collection('users').update(editItem.id, updateData);
      } else if (selectedExistingUser) {
        // Promote / Assign existing user from database
        const updateData = { role: form.role, faculty: coordinatorUser.faculty || '', title: form.title };
        savedUser = await pb.collection('users').update(selectedExistingUser.id, updateData);
      } else {
        // Create new user
        savedUser = await pb.collection('users').create({
          name: form.name, 
          email: form.email, 
          password: form.password,
          passwordConfirm: form.passwordConfirm, 
          role: form.role, 
          faculty: coordinatorUser.faculty || '', 
          title: form.title,
          emailVisibility: true,
          active: true,
        });
      }

      // Program assignment logic (only if coordinator manages the program)
      if (form.role === 'program_head') {
        const selectedProgIds = form.programIds || [];
        const myProgIds = programs.map(p => p.id);
        
        const toRemoveProgs = programs.filter(p => p.head === savedUser.id && !selectedProgIds.includes(p.id));
        for (const pp of toRemoveProgs) {
          await pb.collection('programs').update(pp.id, { head: '' });
        }
        
        for (const progId of selectedProgIds) {
          if (myProgIds.includes(progId)) {
            const prog = programs.find(p => p.id === progId);
            if (prog && prog.head !== savedUser.id) {
              await pb.collection('programs').update(progId, { head: savedUser.id });
            }
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
      setIsExistingMode(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedExistingUser(null);
      setForm({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', title: '', programIds: [] });
      load();
    } catch (err) {
      await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    const assignedProgs = programs.filter(p => p.head === item.id).map(p => p.id);
    setEditItem(item);
    setIsExistingMode(false);
    setSelectedExistingUser(null);
    setForm({ 
      name: item.name, 
      email: item.email, 
      password: '', 
      passwordConfirm: '', 
      role: item.role, 
      title: item.title || '', 
      programIds: assignedProgs
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Kullanıcıyı silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('users').delete(id);
        load();
      } catch (err) {
        await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
      }
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

  const roleLabels = { program_head: 'Program Başkanı', instructor: 'Öğretim Elemanı' };
  const roleColors = { program_head: 'bg-secondary-fixed text-on-secondary-fixed-variant', instructor: 'bg-tertiary-fixed text-on-tertiary-fixed-variant' };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Kullanıcı Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Bölümünüze bağlı Program Başkanları ve Öğretim Elemanları</p>
        </div>
        <button 
          onClick={() => { 
            setEditItem(null); 
            setIsExistingMode(false);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedExistingUser(null);
            setForm({ name: '', email: '', password: '', passwordConfirm: '', role: 'instructor', title: '', programIds: [] }); 
            setShowModal(true); 
          }} 
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95"
        >
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
                <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs">Atandığı Programlar</th>
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
                    {u.role === 'program_head' ? (
                      <div className="flex flex-col gap-1">
                        {programs.filter(p => p.head === u.id).map(p => (
                          <div key={p.id} className="text-xs text-secondary font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">account_tree</span>
                            {p.name}
                          </div>
                        ))}
                        {programs.filter(p => p.head === u.id).length === 0 && (
                          <div className="text-xs text-error font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">account_tree</span>
                            Program Atanmamış
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">— (Ders atamaları program sayfasından yapılır)</span>
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
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(u)} className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 hover:bg-surface-container rounded-lg text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant text-sm">
                    Henüz ekibinizde kayıtlı kullanıcı bulunmuyor.
                  </td>
                </tr>
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
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto animate-scale-up border border-outline-variant">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md text-on-surface">{editItem ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'}</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!editItem && (
                <div className="flex p-0.5 bg-slate-100 rounded-lg border border-outline-variant mb-4">
                  <button
                    type="button"
                    onClick={() => { setIsExistingMode(false); setSelectedExistingUser(null); }}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      !isExistingMode ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/50'
                    }`}
                  >
                    Yeni Kullanıcı Oluştur
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsExistingMode(true); }}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      isExistingMode ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/50'
                    }`}
                  >
                    Sistemden Kullanıcı Ekle
                  </button>
                </div>
              )}

              {isExistingMode && !editItem && !selectedExistingUser && (
                <div className="space-y-3">
                  <div>
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">
                      Kullanıcı Ara (Ad Soyad veya E-posta)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Aramak için en az 3 karakter girin..."
                        className="w-full border border-outline-variant rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">
                        search
                      </span>
                    </div>
                  </div>
                  
                  <div className="border border-outline-variant rounded-lg divide-y divide-outline-variant max-h-48 overflow-y-auto bg-surface-container-lowest">
                    {searchResults.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedExistingUser(u);
                          setForm({
                            ...form,
                            name: u.name,
                            email: u.email,
                            role: u.role === 'admin' ? 'instructor' : u.role,
                            title: u.title || ''
                          });
                        }}
                        className="w-full text-left p-3 hover:bg-surface-container-low transition-colors flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="font-semibold text-on-surface">{u.title ? `${u.title} ${u.name}` : u.name}</p>
                          <p className="text-xs text-on-surface-variant">{u.email}</p>
                        </div>
                        <span className="material-symbols-outlined text-primary text-lg">
                          add_circle
                        </span>
                      </button>
                    ))}
                    {searchQuery.trim().length >= 3 && searchResults.length === 0 && (
                      <p className="text-xs text-on-surface-variant text-center py-4">Eşleşen kullanıcı bulunamadı.</p>
                    )}
                    {searchQuery.trim().length < 3 && (
                      <p className="text-xs text-on-surface-variant text-center py-4">Arama yapmak için yazmaya başlayın.</p>
                    )}
                  </div>
                </div>
              )}

              {(selectedExistingUser || editItem || !isExistingMode) && (
                <div className="space-y-4">
                  {selectedExistingUser && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                      <div className="text-sm">
                        <p className="font-semibold text-primary text-xs uppercase tracking-wider">Seçilen Mevcut Kullanıcı</p>
                        <p className="text-on-surface font-semibold mt-1">{form.title ? `${form.title} ${form.name}` : form.name}</p>
                        <p className="text-xs text-on-surface-variant">{form.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedExistingUser(null)}
                        className="text-xs font-bold text-error hover:underline"
                      >
                        Kullanıcıyı Değiştir
                      </button>
                    </div>
                  )}

                  {!selectedExistingUser && !editItem && !isExistingMode && (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ünvan</label>
                          <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
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
                          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                        </div>
                      </div>
                      <div>
                        <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">E-posta</label>
                        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Şifre</label>
                          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                        </div>
                        <div>
                          <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Şifre Tekrar</label>
                          <input type="password" value={form.passwordConfirm} onChange={e => setForm({ ...form, passwordConfirm: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                        </div>
                      </div>
                    </>
                  )}

                  {editItem && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ünvan</label>
                        <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
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
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Rol</label>
                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
                      <option value="instructor">Öğretim Elemanı</option>
                      <option value="program_head">Program Başkanı</option>
                    </select>
                  </div>

                  {form.role === 'program_head' && (
                    <div>
                      <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Atanacağı Programlar</label>
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
                          <p className="text-xs text-on-surface-variant text-center py-2">Bölümünüze bağlı henüz program bulunmuyor.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3 bg-surface-container-low">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface bg-white">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
