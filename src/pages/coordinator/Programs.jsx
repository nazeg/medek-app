import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function Programs() {
  const { user: coordinatorUser } = useAuth();
  const { alert, confirm } = useAlertConfirm();
  const [programs, setPrograms] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', faculty: '', duration: '4', head: '' });

  const load = async () => {
    if (!coordinatorUser) return;
    try {
      const userFilter = `faculty = "${coordinatorUser.faculty}" && (role = "instructor" || role = "program_head" || role = "coordinator")`;
      const [p, f, u] = await Promise.all([
        pb.collection('programs').getFullList({ sort: 'name', expand: 'faculty,head' }),
        pb.collection('faculties').getFullList({ sort: 'name' }),
        pb.collection('users').getFullList({ sort: 'name', filter: userFilter }),
      ]);
      setPrograms(p);
      setFaculties(f);
      setUsers(u);
    } catch (err) {
      console.error('Error loading programs resources:', err);
    }
  };

  useEffect(() => {
    load();
  }, [coordinatorUser]);

  const handleSave = async () => {
    try {
      if (!form.name.trim() || !form.code.trim() || !form.faculty) {
        await alert('Lütfen gerekli alanları doldurunuz.', 'Uyarı', 'warning');
        return;
      }

      // Save program changes
      let savedProg;
      if (editItem) {
        savedProg = await pb.collection('programs').update(editItem.id, form);
      } else {
        savedProg = await pb.collection('programs').create(form);
      }

      // Automatic role updates for users
      // 1. Promote new head to program_head
      if (form.head) {
        const newHead = users.find(u => u.id === form.head);
        if (newHead && newHead.role === 'instructor') {
          await pb.collection('users').update(form.head, { role: 'program_head' });
        }
      }

      // 2. Demote old head if they no longer head any program
      const oldHeadId = editItem?.head;
      if (oldHeadId && oldHeadId !== form.head) {
        const otherProgs = await pb.collection('programs').getList(1, 1, {
          filter: `head = "${oldHeadId}" && id != "${savedProg.id}"`
        });
        if (otherProgs.totalItems === 0) {
          const oldUser = users.find(u => u.id === oldHeadId);
          if (oldUser && oldUser.role === 'program_head') {
            await pb.collection('users').update(oldHeadId, { role: 'instructor' });
          }
        }
      }

      setShowModal(false);
      setEditItem(null);
      setForm({ name: '', code: '', faculty: '', duration: '4', head: '' });
      load();
    } catch (err) {
      await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name, code: item.code, faculty: item.faculty || '', duration: item.duration, head: item.head || '' });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      const itemToDelete = programs.find(p => p.id === id);
      const oldHeadId = itemToDelete?.head;
      
      try {
        await pb.collection('programs').delete(id);
        
        // Clean up role of old head if they no longer head any program
        if (oldHeadId) {
          const otherProgs = await pb.collection('programs').getList(1, 1, {
            filter: `head = "${oldHeadId}"`
          });
          if (otherProgs.totalItems === 0) {
            const oldUser = users.find(u => u.id === oldHeadId);
            if (oldUser && oldUser.role === 'program_head') {
              await pb.collection('users').update(oldHeadId, { role: 'instructor' });
            }
          }
        }
        
        load();
      } catch (err) {
        await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
      }
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Program Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Program oluşturma ve düzenleme</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ name: '', code: '', faculty: '', duration: '4', head: '' }); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
          <span className="material-symbols-outlined text-lg">add</span> Program Ekle
        </button>
      </div>
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface text-on-surface-variant font-label-md border-b border-outline-variant">
              <th className="px-6 py-4 font-semibold uppercase tracking-wider">Program</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider">Kod</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider">Fakülte / MYO</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider">Süre</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider">Program Başkanı</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {programs.map(p => (
              <tr key={p.id} className="hover:bg-surface-container-low transition-colors group">
                <td className="px-6 py-4 font-medium">{p.name}</td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">{p.code}</td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">{p.expand?.faculty?.name || '—'}</td>
                <td className="px-6 py-4 text-sm">{p.duration} yıl</td>
                <td className="px-6 py-4 text-sm text-on-surface-variant font-medium">
                  {p.expand?.head ? (p.expand.head.title ? `${p.expand.head.title} ${p.expand.head.name}` : p.expand.head.name) : '—'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(p)} className="p-2 hover:bg-surface-container rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-surface-container rounded-lg text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                  </div>
                </td>
              </tr>
            ))}
            {programs.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">Henüz program eklenmemiş.</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md">{editItem ? 'Program Düzenle' : 'Yeni Program Ekle'}</h3>
              <button onClick={() => setShowModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Program Adı</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Kod</label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Fakülte / MYO</label>
                <select value={form.faculty} onChange={e => setForm({ ...form, faculty: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
                  <option value="">Seçiniz</option>
                  {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Süre (yıl)</label>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
                  <option value="2">2 yıl</option>
                  <option value="4">4 yıl</option>
                  <option value="5">5 yıl</option>
                  <option value="6">6 yıl</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Program Başkanı</label>
                <select value={form.head} onChange={e => setForm({ ...form, head: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
                  <option value="">Seçiniz (Atama yok)</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.title ? `${u.title} ${u.name}` : u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
