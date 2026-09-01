import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function Departments() {
  const { alert, confirm } = useAlertConfirm();
  
  // Lists
  const [programs, setPrograms] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  // Form state
  const [form, setForm] = useState({ name: '', faculty: '', duration: '4', head: '', active: true });

  // Accordion state
  const [expandedFaculties, setExpandedFaculties] = useState({});

  const toggleFaculty = (id) => {
    setExpandedFaculties(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const load = async () => {
    try {
      const [p, f, u] = await Promise.all([
        pb.collection('programs').getFullList({ 
          sort: 'name', 
          expand: 'faculty,head' 
        }),
        pb.collection('faculties').getFullList({ sort: 'name' }),
        pb.collection('users').getFullList({ 
          sort: 'name', 
          filter: 'role = "coordinator" || role = "program_head" || role = "instructor"' 
        }),
      ]);
      setPrograms(p);
      setFaculties(f);
      setUsers(u);
    } catch (err) {
      console.error('Error loading admin programs:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getType = (item) => {
    if (item.type) return item.type;
    return item.name.includes('MYO') || item.name.includes('Meslek Yüksekokulu') ? 'myo' : 'fakulte';
  };

  const fakulteler = faculties.filter(f => getType(f) === 'fakulte');
  const myolar = faculties.filter(f => getType(f) === 'myo');

  const handleSave = async () => {
    try {
      const data = { 
        name: form.name, 
        faculty: form.faculty, 
        duration: form.duration, 
        head: form.head || '',
        active: form.active !== false
      };
      
      const targetFaculty = faculties.find(f => f.id === form.faculty);
      const headUser = users.find(u => u.id === form.head);

      if (editItem) {
        await pb.collection('programs').update(editItem.id, data);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.FACULTY_DEPT,
          details: `"${form.name}" programı güncellendi. Durum: ${form.active !== false ? 'Aktif' : 'Pasif'}, Fakülte: ${targetFaculty?.name || '—'}, Bölüm Başkanı: ${headUser?.name || 'Atanmadı'}`,
          metadata: { programId: editItem.id, name: form.name, faculty: targetFaculty?.name, head: headUser?.name, active: form.active !== false }
        });
      } else {
        const res = await pb.collection('programs').create(data);
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.FACULTY_DEPT,
          details: `"${form.name}" adlı yeni program eklendi. Durum: ${form.active !== false ? 'Aktif' : 'Pasif'}, Fakülte: ${targetFaculty?.name || '—'}, Bölüm Başkanı: ${headUser?.name || 'Atanmadı'}`,
          metadata: { programId: res.id, name: form.name, faculty: targetFaculty?.name, head: headUser?.name, active: form.active !== false }
        });
      }
      
      setShowModal(false);
      setEditItem(null);
      setForm({ name: '', faculty: '', duration: '4', head: '', active: true });
      load();
    } catch (err) {
      await alert('Bölüm/Program kaydedilirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const toggleActive = async (prog) => {
    const nextState = prog.active === false ? true : false;
    try {
      await pb.collection('programs').update(prog.id, { active: nextState });
      logAction({
        action: LOG_ACTIONS.UPDATE,
        category: LOG_CATEGORIES.FACULTY_DEPT,
        details: `"${prog.name}" bölüm/program durumu ${nextState ? 'Aktif' : 'Pasif'} yapıldı.`,
        metadata: { programId: prog.id, name: prog.name, active: nextState }
      });
      load();
    } catch (err) {
      await alert('Durum güncellenirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleDelete = async (id) => {
    const target = programs.find(p => p.id === id);
    if (await confirm('Bölüm/Programı silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('programs').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.FACULTY_DEPT,
          details: `"${target?.name || id}" programı silindi.`,
          metadata: { programId: id, name: target?.name }
        });
        load();
      } catch (err) {
        await alert('Silme işlemi başarısız. Lütfen önce ilişkili dersleri, çıktıları ve notları temizleyin.', 'Hata', 'error');
      }
    }
  };

  const renderProgramCard = (p) => {
    const isPassive = p.active === false;
    return (
      <div 
        key={p.id} 
        className={`border rounded-lg p-3 flex items-center justify-between text-xs transition-all ${
          isPassive 
            ? 'bg-slate-50 border-dashed border-slate-300 opacity-75' 
            : 'bg-white border-outline-variant hover:border-primary/30'
        }`}
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <p className={`font-bold text-sm truncate ${isPassive ? 'text-slate-500 line-through' : 'text-on-surface'}`}>
              {p.name}
            </p>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border leading-none ${
              isPassive 
                ? 'bg-slate-200 text-slate-600 border-slate-300' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {isPassive ? 'Pasif (Kapalı)' : 'Aktif'}
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Süre: {p.duration} Yıl • Sorumlu: <span className={p.expand?.head ? "font-medium text-slate-700" : "font-semibold text-red-600"}>{p.expand?.head ? (p.expand.head.title ? `${p.expand.head.title} ${p.expand.head.name}` : p.expand.head.name) : 'Atanmamış'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Active / Passive Toggle Switch */}
          <button
            type="button"
            onClick={() => toggleActive(p)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              !isPassive ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            title={isPassive ? 'Aktif Yap (Kullanıma Aç)' : 'Pasif Yap (Kapat/Arşivle)'}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                !isPassive ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>

          {/* Edit Button */}
          <button 
            onClick={() => {
              setEditItem(p);
              setForm({ 
                name: p.name, 
                faculty: p.faculty, 
                duration: p.duration, 
                head: p.head || '',
                active: p.active !== false
              });
              setShowModal(true);
            }}
            className="p-1 hover:bg-slate-100 rounded text-on-surface-variant transition-colors cursor-pointer"
            title="Düzenle"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>

          {/* Delete Button */}
          <button 
            onClick={() => handleDelete(p.id)}
            className="p-1 hover:bg-red-50 rounded text-error transition-colors cursor-pointer"
            title="Sil"
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-headline-lg text-on-surface">Bölüm / Program Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">
            Fakülte ve MYO bünyesindeki bölüm/programların aktif/pasif durumları ve yönetimi
          </p>
        </div>
        <button 
          onClick={() => { 
            setEditItem(null); 
            setForm({ name: '', faculty: '', duration: '4', head: '', active: true }); 
            setShowModal(true); 
          }} 
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">add</span> Bölüm / Program Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {/* Left Column: Fakulteler */}
        <div className="space-y-4">
          <div className="bg-primary/5 px-4 py-3 rounded-lg border border-primary/10 flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">school</span>
            <h3 className="font-bold text-sm text-primary uppercase tracking-wider">Fakülteler</h3>
          </div>
          {fakulteler.map((faculty) => {
            const facultyProgs = programs.filter((p) => p.faculty === faculty.id);
            const isExpanded = !!expandedFaculties[faculty.id];
            
            return (
              <div key={faculty.id} className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
                <button 
                  onClick={() => toggleFaculty(faculty.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors text-left cursor-pointer"
                >
                  <span className="font-bold text-on-surface text-sm sm:text-base pr-2">{faculty.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2.5 py-0.5 rounded-full font-semibold">
                      {facultyProgs.length} Program
                    </span>
                    <span 
                      className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      keyboard_arrow_down
                    </span>
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="p-4 border-t border-outline-variant bg-surface-container-lowest/30 space-y-2">
                    {facultyProgs.map(renderProgramCard)}
                    {facultyProgs.length === 0 && (
                      <p className="text-xs text-on-surface-variant italic py-1">Henüz bölüm/program bulunmamaktadır.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: MYOlar */}
        <div className="space-y-4">
          <div className="bg-primary/5 px-4 py-3 rounded-lg border border-primary/10 flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">account_balance</span>
            <h3 className="font-bold text-sm text-primary uppercase tracking-wider">Meslek Yüksekokulları (MYO)</h3>
          </div>
          {myolar.map((faculty) => {
            const facultyProgs = programs.filter((p) => p.faculty === faculty.id);
            const isExpanded = !!expandedFaculties[faculty.id];

            return (
              <div key={faculty.id} className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
                <button 
                  onClick={() => toggleFaculty(faculty.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors text-left cursor-pointer"
                >
                  <span className="font-bold text-on-surface text-sm sm:text-base pr-2">{faculty.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2.5 py-0.5 rounded-full font-semibold">
                      {facultyProgs.length} Program
                    </span>
                    <span 
                      className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      keyboard_arrow_down
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-outline-variant bg-surface-container-lowest/30 space-y-2">
                    {facultyProgs.map(renderProgramCard)}
                    {facultyProgs.length === 0 && (
                      <p className="text-xs text-on-surface-variant italic py-1">Henüz bölüm/program bulunmamaktadır.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-outline-variant">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md text-on-surface">{editItem ? 'Bölüm / Program Düzenle' : 'Yeni Bölüm / Program Ekle'}</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Bağlı Fakülte / MYO</label>
                <select 
                  value={form.faculty} 
                  onChange={e => setForm({ ...form, faculty: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white cursor-pointer"
                  required
                >
                  <option value="">Seçiniz</option>
                  {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Bölüm / Program Adı</label>
                <input 
                  value={form.name} 
                  onChange={e => setForm({ ...form, name: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  placeholder="Örn: Bilgisayar Mühendisliği" 
                  required 
                />
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Eğitim Süresi (Yıl)</label>
                <select 
                  value={form.duration} 
                  onChange={e => setForm({ ...form, duration: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white cursor-pointer"
                >
                  <option value="2">2 Yıl</option>
                  <option value="4">4 Yıl</option>
                  <option value="5">5 Yıl</option>
                  <option value="6">6 Yıl</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Bölüm / Program Başkanı (Sorumlusu)</label>
                <select 
                  value={form.head} 
                  onChange={e => setForm({ ...form, head: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white cursor-pointer"
                >
                  <option value="">Seçiniz (Atama yok)</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.title ? `${u.title} ${u.name}` : u.name} ({u.role === 'coordinator' || u.role === 'program_head' ? 'Bölüm/Program Başkanı' : 'Öğretim Elemanı'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Birim Durumu</label>
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, active: !form.active })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      form.active ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        form.active ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-bold ${form.active ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {form.active ? 'Aktif (Kullanımda)' : 'Pasif (Kapatıldı / Arşivlendi)'}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3 bg-surface-container-low">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface bg-white cursor-pointer">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container cursor-pointer">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
