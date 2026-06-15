import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function Faculties() {
  const { alert, confirm } = useAlertConfirm();
  const [faculties, setFaculties] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('fakulte');

  const load = async () => {
    try {
      const f = await pb.collection('faculties').getFullList({ sort: 'sort_order,name' }).catch(() =>
        pb.collection('faculties').getFullList({ sort: 'name' })
      );
      setFaculties(f);
    } catch {
      const f = await pb.collection('faculties').getFullList({ sort: 'name' });
      setFaculties(f);
    }
  };

  useEffect(() => { load(); }, []);

  const getType = (item) => {
    if (item.type) return item.type;
    return item.name.includes('MYO') || item.name.includes('Meslek Yüksekokulu') ? 'myo' : 'fakulte';
  };

  const fakulteler = faculties.filter(f => getType(f) === 'fakulte');
  const myolar = faculties.filter(f => getType(f) === 'myo');

  const moveItem = async (id, direction, list) => {
    const idx = list.findIndex(f => f.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === list.length - 1) return;
    const newList = [...list];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    for (let i = 0; i < newList.length; i++) {
      await pb.collection('faculties').update(newList[i].id, { sort_order: i });
    }
    await load();
  };

  const handleSave = async () => {
    const data = { name, type, sort_order: faculties.length };
    if (editItem) {
      await pb.collection('faculties').update(editItem.id, data);
    } else {
      await pb.collection('faculties').create(data);
    }
    setShowModal(false);
    setEditItem(null);
    setName('');
    setType('fakulte');
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setName(item.name);
    setType(getType(item));
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('faculties').delete(id);
        load();
      } catch (err) {
        await alert('Bu birim silinemez. Lütfen önce bağlı kullanıcıları ve bölümleri silin veya güncelleyin.', 'Hata', 'error');
      }
    }
  };

  const renderColumn = (title, items, icon, color, emptyMsg) => (
    <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b border-outline-variant bg-${color}/5 flex items-center gap-2`}>
        <span className={`material-symbols-outlined text-${color}`}>{icon}</span>
        <h3 className="font-bold text-sm text-on-surface">{title} <span className="text-on-surface-variant font-normal">({items.length})</span></h3>
      </div>
      <div className="divide-y divide-outline-variant">
        {items.map((f) => (
          <div key={f.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-container-low transition-colors group">
            <span className="text-sm font-medium text-on-surface">{f.name}</span>
            <div className="flex gap-1">
              <button onClick={() => moveItem(f.id, 'up', items)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Yukarı"><span className="material-symbols-outlined text-lg">arrow_upward</span></button>
              <button onClick={() => moveItem(f.id, 'down', items)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Aşağı"><span className="material-symbols-outlined text-lg">arrow_downward</span></button>
              <button onClick={() => handleEdit(f)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Düzenle"><span className="material-symbols-outlined text-lg">edit</span></button>
              <button onClick={() => handleDelete(f.id)} className="p-1 hover:bg-surface-container rounded text-error" title="Sil"><span className="material-symbols-outlined text-lg">delete</span></button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-on-surface-variant text-sm">{emptyMsg}</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Fakülte / MYO Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Kütahya Sağlık Bilimleri Üniversitesi bünyesindeki birimler</p>
        </div>
        <button onClick={() => { setEditItem(null); setName(''); setType('fakulte'); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
          <span className="material-symbols-outlined text-lg">add</span> Birim Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {renderColumn('Fakülteler', fakulteler, 'school', 'primary', 'Henüz fakülte eklenmemiş.')}
        {renderColumn('Meslek Yüksekokulları (MYO)', myolar, 'account_balance', 'primary', 'Henüz MYO eklenmemiş.')}
      </div>

      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md text-on-surface">{editItem ? 'Birim Düzenle' : 'Yeni Birim Ekle'}</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Tür</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
                  <option value="fakulte">Fakülte</option>
                  <option value="myo">Meslek Yüksekokulu (MYO)</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Birim Adı</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Örn: Sağlık Bilimleri Fakültesi" required />
              </div>
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
