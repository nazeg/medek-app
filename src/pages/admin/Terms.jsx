import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { useTerm } from '../../contexts/TermContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function Terms() {
  const { alert, confirm } = useAlertConfirm();
  const { refreshTerms } = useTerm();
  const [termsList, setTermsList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  const [name, setName] = useState('');

  const load = async () => {
    try {
      const list = await pb.collection('terms').getFullList({ sort: '-name' });
      setTermsList(list);
    } catch (err) {
      console.error('Error loading terms:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    try {
      const data = { name };
      if (editItem) {
        await pb.collection('terms').update(editItem.id, data);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.TERM,
          details: `"${name}" dönemi güncellendi.`,
          metadata: { termId: editItem.id, name }
        });
      } else {
        const res = await pb.collection('terms').create(data);
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.TERM,
          details: `"${name}" adlı yeni dönem eklendi.`,
          metadata: { termId: res.id, name }
        });
      }
      
      if (refreshTerms) refreshTerms();
      
      setShowModal(false);
      setEditItem(null);
      setName('');
      load();
    } catch (err) {
      await alert('Dönem kaydedilirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setName(item.name);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const target = termsList.find(t => t.id === id);
    if (await confirm('Dönemi silmek istediğinize emin misiniz? Bu işlem bağlı dersleri etkileyebilir.')) {
      try {
        await pb.collection('terms').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.TERM,
          details: `"${target?.name || id}" dönemi silindi.`,
          metadata: { termId: id, name: target?.name }
        });
        if (refreshTerms) refreshTerms();
        load();
      } catch (err) {
        await alert('Dönem silinemedi. Lütfen önce bu döneme bağlı dersleri silin veya güncelleyin.', 'Hata', 'error');
      }
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Dönem Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Sistem genelindeki akademik dönemlerin yönetimi</p>
        </div>
        <button 
          onClick={() => { 
            setEditItem(null); 
            setName(''); 
            setShowModal(true); 
          }} 
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95"
        >
          <span className="material-symbols-outlined text-lg">calendar_month</span> Dönem Ekle
        </button>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-on-surface-variant font-label-md border-b border-outline-variant">
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Dönem Adı</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right text-xs">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {termsList.map((t) => (
                <tr key={t.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-lg">calendar_today</span>
                      </div>
                      <span className="font-semibold text-on-surface text-sm">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-1 transition-opacity">
                      <button onClick={() => handleEdit(t)} className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-surface-container rounded-lg text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {termsList.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-on-surface-variant text-sm">
                    Henüz dönem tanımlanmamış.
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
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-outline-variant">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md text-on-surface">{editItem ? 'Dönem Düzenle' : 'Yeni Dönem Ekle'}</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Dönem Adı</label>
                <input 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  placeholder="Örn: 2025-2026 Güz" 
                  required 
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface bg-white">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
