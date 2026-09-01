import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function ProgramOutcomes() {
  const { user: coordinatorUser } = useAuth();
  const { activeProgram } = useProgram();
  const { confirm, alert } = useAlertConfirm();
  const [outcomes, setOutcomes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    code: '',
    description: '',
    min_threshold: 50,
    target_goal: 70,
    evidence: '',
  });

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
    if (!form.code.trim()) {
      alert('Lütfen PÇ kodunu giriniz.', 'Eksik Bilgi', 'warning');
      return;
    }

    const data = { 
      code: form.code.trim(),
      description: form.description.trim(),
      min_threshold: form.min_threshold !== '' ? Number(form.min_threshold) : 50,
      target_goal: form.target_goal !== '' ? Number(form.target_goal) : 70,
      evidence: form.evidence.trim(),
      program: activeProgram.id 
    };

    try {
      if (editItem) {
        await pb.collection('program_outcomes').update(editItem.id, data);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${form.code}" program çıktısı güncellendi. Alt Sınır: %${data.min_threshold}, Hedef: %${data.target_goal}. Program: ${activeProgram?.name || '—'}`,
          metadata: { outcomeId: editItem.id, ...data }
        });
      } else {
        const res = await pb.collection('program_outcomes').create(data);
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${form.code}" adlı yeni program çıktısı eklendi. Alt Sınır: %${data.min_threshold}, Hedef: %${data.target_goal}. Program: ${activeProgram?.name || '—'}`,
          metadata: { outcomeId: res.id, ...data }
        });
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ code: '', description: '', min_threshold: 50, target_goal: 70, evidence: '' });
      load();
    } catch (err) {
      alert('PÇ kaydedilirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ 
      code: item.code || '', 
      description: item.description || '', 
      min_threshold: item.min_threshold ?? 50,
      target_goal: item.target_goal ?? 70,
      evidence: item.evidence || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const target = outcomes.find(o => o.id === id);
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('program_outcomes').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${target?.code || id}" program çıktısı silindi. Program: ${activeProgram?.name || '—'}`,
          metadata: { outcomeId: id, code: target?.code }
        });
        load();
      } catch (err) {
        alert('PÇ silinemedi. Lütfen önce bu çıktıya bağlı matris ve ders ilişkilerini kontrol edin.', 'Hata', 'error');
      }
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-headline-lg text-on-surface">Program Çıktıları (PÇ)</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">
            Program kazanımlarını, alt sınırlarını, başarı hedeflerini ve kanıt kararlarını tanımlayın
          </p>
        </div>
        {activeProgram && (
          <button 
            onClick={() => { 
              setEditItem(null); 
              setForm({ code: '', description: '', min_threshold: 50, target_goal: 70, evidence: '' }); 
              setShowModal(true); 
            }} 
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">add</span> PÇ Ekle
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        {!activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {activeProgram && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant">
                  <th className="px-4 py-3 font-semibold w-20">Kod</th>
                  <th className="px-4 py-3 font-semibold min-w-[280px]">Açıklama</th>
                  <th className="px-4 py-3 font-semibold text-center w-28">Alt Sınır</th>
                  <th className="px-4 py-3 font-semibold text-center w-28">Başarı Hedefi</th>
                  <th className="px-4 py-3 font-semibold w-48">Kanıt / Karar</th>
                  <th className="px-4 py-3 font-semibold text-right w-24">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {outcomes.map(o => (
                  <tr key={o.id} className="hover:bg-surface-container-low transition-colors group">
                    {/* Code */}
                    <td className="px-4 py-3 font-bold text-primary text-sm whitespace-nowrap">
                      {o.code}
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3 text-sm text-on-surface">
                      {o.description || '—'}
                    </td>

                    {/* Min Threshold */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        %{o.min_threshold ?? 50}
                      </span>
                    </td>

                    {/* Target Goal */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        %{o.target_goal ?? 70}
                      </span>
                    </td>

                    {/* Evidence / Decision Reference */}
                    <td className="px-4 py-3">
                      {o.evidence ? (
                        <div className="relative group/tooltip inline-block max-w-[200px]">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200/80 cursor-help transition-colors hover:bg-amber-100/70">
                            <span className="material-symbols-outlined text-[15px] text-amber-700 flex-shrink-0">gavel</span>
                            <span className="truncate">{o.evidence}</span>
                          </div>
                          {/* Hover Tooltip Popup */}
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl border border-slate-700 animate-fade-in pointer-events-none">
                            <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                              <span className="material-symbols-outlined text-sm">verified</span>
                              Kurul / Dayanak Kanıtı
                            </div>
                            <p className="leading-relaxed text-slate-200 break-words font-normal">
                              {o.evidence}
                            </p>
                            <div className="w-2.5 h-2.5 bg-slate-900 border-r border-b border-slate-700 transform rotate-45 absolute -bottom-1.5 left-4"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Girilmemiş</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleEdit(o)} 
                          className="p-1 hover:bg-surface-container rounded text-on-surface-variant transition-colors cursor-pointer" 
                          title="Düzenle"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(o.id)} 
                          className="p-1 hover:bg-surface-container rounded text-error transition-colors cursor-pointer" 
                          title="Sil"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {outcomes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant text-sm">
                      Henüz bu programa ait PÇ eklenmemiş.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PÇ Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl border border-outline-variant overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">target</span>
                <h3 className="text-headline-md font-bold text-on-surface">{editItem ? 'PÇ Düzenle' : 'Yeni PÇ Ekle'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">PÇ Kodu *</label>
                <input 
                  value={form.code} 
                  onChange={e => setForm({ ...form, code: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  placeholder="Örn: PÇ1, PÇ.01" 
                  required
                />
              </div>

              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Çıktı Açıklaması *</label>
                <textarea 
                  value={form.description} 
                  onChange={e => setForm({ ...form, description: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  rows={3} 
                  placeholder="Program çıktısının detaylı açıklaması..."
                  required
                />
              </div>

              {/* Thresholds Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">
                    Alt Sınır (%)
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={form.min_threshold} 
                      onChange={e => setForm({ ...form, min_threshold: e.target.value })} 
                      className="w-full border border-outline-variant rounded-lg pl-4 pr-8 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                      placeholder="50" 
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-sm">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Öğrencinin minimum geçme eşiği</span>
                </div>

                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">
                    Başarı Hedefi (%)
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={form.target_goal} 
                      onChange={e => setForm({ ...form, target_goal: e.target.value })} 
                      className="w-full border border-outline-variant rounded-lg pl-4 pr-8 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                      placeholder="70" 
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-sm">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Bölümün ulaşmayı hedeflediği oran</span>
                </div>
              </div>

              {/* Evidence / Decision Reference */}
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">
                  Kanıt / Karar Dayanağı
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">gavel</span>
                  <input 
                    type="text"
                    value={form.evidence} 
                    onChange={e => setForm({ ...form, evidence: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                    placeholder="Örn: Bölüm Kurulu 14.09.2025 tarih ve 2025/12 sayılı kararı" 
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">PÇ tablosunda üzerine gelindiğinde detay olarak gösterilir</span>
              </div>

              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Bağlı Program</label>
                <input
                  type="text"
                  value={activeProgram?.name || 'Seçili Program Yok'}
                  disabled
                  className="w-full border border-outline-variant bg-slate-50 text-slate-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed font-medium"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3 bg-surface-container-low">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-semibold hover:bg-surface bg-white cursor-pointer">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container cursor-pointer active:scale-95 transition-all">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
