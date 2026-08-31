import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function ProgramOutcomes() {
  const { user: coordinatorUser } = useAuth();
  const { activeProgram } = useProgram();
  const { confirm } = useAlertConfirm();
  const [outcomes, setOutcomes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ code: '', description: '', program: '' });

  const load = async () => {
    if (!coordinatorUser || !activeProgram) return;
    try {
      const o = await pb.collection('program_outcomes').getFullList({ 
        sort: 'code', 
        filter: `program = "${activeProgram.id}"`,
        expand: 'program' 
      });
      o.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      setOutcomes(o);
    } catch (err) {
      console.error('Error loading program outcomes:', err);
    }
  };

  useEffect(() => { load(); }, [coordinatorUser, activeProgram]);

  const handleSave = async () => {
    if (!activeProgram) return;
    const data = { ...form, program: activeProgram.id };
    if (editItem) {
      await pb.collection('program_outcomes').update(editItem.id, data);
      logAction({
        action: LOG_ACTIONS.UPDATE,
        category: LOG_CATEGORIES.OUTCOMES,
        details: `"${form.code}" program çıktısı güncellendi. Program: ${activeProgram?.name || '—'}`,
        metadata: { outcomeId: editItem.id, code: form.code, description: form.description }
      });
    } else {
      const res = await pb.collection('program_outcomes').create(data);
      logAction({
        action: LOG_ACTIONS.CREATE,
        category: LOG_CATEGORIES.OUTCOMES,
        details: `"${form.code}" adlı yeni program çıktısı eklendi. Program: ${activeProgram?.name || '—'}`,
        metadata: { outcomeId: res.id, code: form.code, description: form.description }
      });
    }
    setShowModal(false);
    setEditItem(null);
    setForm({ code: '', description: '', program: '' });
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ code: item.code, description: item.description, program: item.program });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const target = outcomes.find(o => o.id === id);
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      await pb.collection('program_outcomes').delete(id);
      logAction({
        action: LOG_ACTIONS.DELETE,
        category: LOG_CATEGORIES.OUTCOMES,
        details: `"${target?.code || id}" program çıktısı silindi. Program: ${activeProgram?.name || '—'}`,
        metadata: { outcomeId: id, code: target?.code }
      });
      load();
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Program Çıktıları (PÇ)</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Program kazanımlarını tanımlayın</p>
        </div>
        {activeProgram && (
          <button onClick={() => { setEditItem(null); setForm({ code: '', description: '', program: '' }); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
            <span className="material-symbols-outlined text-lg">add</span> PÇ Ekle
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        {!activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {activeProgram && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant">
                <th className="px-4 py-2.5 font-semibold">Kod</th>
                <th className="px-4 py-2.5 font-semibold">Açıklama</th>
                <th className="px-4 py-2.5 font-semibold">Program</th>
                <th className="px-4 py-2.5 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {outcomes.map(o => (
                <tr key={o.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-4 py-2 font-bold text-primary text-sm">{o.code}</td>
                  <td className="px-4 py-2 text-sm text-on-surface">{o.description}</td>
                  <td className="px-4 py-2 text-sm text-on-surface-variant">{o.expand?.program?.name || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1 transition-opacity">
                      <button onClick={() => handleEdit(o)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Düzenle"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => handleDelete(o.id)} className="p-1 hover:bg-surface-container rounded text-error" title="Sil"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {outcomes.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant text-sm">Henüz PÇ eklenmemiş.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md">{editItem ? 'PÇ Düzenle' : 'Yeni PÇ'}</h3>
              <button onClick={() => setShowModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Kod</label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm" placeholder="Örn: PÇ1" />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Açıklama</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm" rows={3} />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Program</label>
                <input
                  type="text"
                  value={activeProgram?.name || 'Seçili Program Yok'}
                  disabled
                  className="w-full border border-outline-variant bg-slate-50 text-slate-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
