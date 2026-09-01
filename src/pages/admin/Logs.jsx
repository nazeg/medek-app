import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import pb from '../../lib/pocketbase';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function AdminLogs() {
  const { alert, confirm } = useAlertConfirm();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // ALL, TODAY, WEEK, MONTH
  const [selectedLog, setSelectedLog] = useState(null); // For detail modal
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);

  const loadLogs = async () => {
    setLoading(true);
    try {
      // Check if logs collection exists
      const filterConditions = [];

      if (roleFilter !== 'ALL') {
        filterConditions.push(`user_role = "${roleFilter}"`);
      }
      if (categoryFilter !== 'ALL') {
        filterConditions.push(`category = "${categoryFilter}"`);
      }
      if (actionFilter !== 'ALL') {
        filterConditions.push(`action = "${actionFilter}"`);
      }
      if (timeFilter !== 'ALL') {
        const now = new Date();
        if (timeFilter === 'TODAY') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          filterConditions.push(`created >= "${startOfToday}"`);
        } else if (timeFilter === 'WEEK') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          filterConditions.push(`created >= "${sevenDaysAgo}"`);
        } else if (timeFilter === 'MONTH') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          filterConditions.push(`created >= "${thirtyDaysAgo}"`);
        }
      }

      if (search.trim()) {
        const s = search.trim();
        filterConditions.push(`(user_name ~ "${s}" || details ~ "${s}" || category ~ "${s}" || action ~ "${s}")`);
      }

      const queryOptions = {
        sort: '-created',
      };
      if (filterConditions.length > 0) {
        queryOptions.filter = filterConditions.join(' && ');
      }

      let res;
      try {
        res = await pb.collection('logs').getList(page, perPage, queryOptions);
      } catch (e1) {
        // Fallback without sort if created field is still migrating
        try {
          const fallbackOptions = { ...queryOptions };
          delete fallbackOptions.sort;
          res = await pb.collection('logs').getList(page, perPage, fallbackOptions);
        } catch (e2) {
          console.warn('Logs query error:', e2);
          res = { items: [], totalItems: 0 };
        }
      }

      setLogs(res.items || []);
      setTotalItems(res.totalItems || 0);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, perPage, roleFilter, categoryFilter, actionFilter, timeFilter]);

  // Handle search with debounce/trigger
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = totalItems;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let todayCount = 0;
    const userActivityMap = {};
    const categoryActivityMap = {};

    logs.forEach(l => {
      const createdTime = new Date(l.created).getTime();
      if (createdTime >= startOfToday) {
        todayCount++;
      }
      const uName = l.user_name || 'Bilinmeyen';
      userActivityMap[uName] = (userActivityMap[uName] || 0) + 1;
      const cat = l.category || 'Diğer';
      categoryActivityMap[cat] = (categoryActivityMap[cat] || 0) + 1;
    });

    let topUser = '—';
    let maxUserCount = 0;
    Object.entries(userActivityMap).forEach(([u, c]) => {
      if (c > maxUserCount) { maxUserCount = c; topUser = u; }
    });

    let topCategory = '—';
    let maxCatCount = 0;
    Object.entries(categoryActivityMap).forEach(([cat, c]) => {
      if (c > maxCatCount) { maxCatCount = c; topCategory = cat; }
    });

    return { total, todayCount, topUser, topCategory };
  }, [logs, totalItems]);

  const handleExportExcel = () => {
    if (logs.length === 0) {
      alert('Dışa aktarılacak log kaydı bulunamadı.', 'Bilgi', 'info');
      return;
    }

    const exportData = logs.map(l => ({
      'Tarih / Saat': new Date(l.created).toLocaleString('tr-TR'),
      'Kullanıcı': l.user_name || '—',
      'Rol': roleLabel(l.user_role),
      'İşlem Türü': l.action || '—',
      'Kategori': l.category || '—',
      'Detay': l.details || '',
      'Teknik Metadata': l.metadata ? JSON.stringify(l.metadata) : ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'İşlem Logları');
    XLSX.writeFile(wb, `MEDEK_Sistem_Loglari_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleClearLogs = async () => {
    if (!await confirm('Tüm sistem loglarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }
    try {
      setLoading(true);
      const allLogs = await pb.collection('logs').getFullList({ fields: 'id' });
      await Promise.all(allLogs.map(l => pb.collection('logs').delete(l.id)));
      alert('Tüm log kayıtları başarıyla temizlendi.', 'Başarılı', 'success');
      loadLogs();
    } catch (err) {
      alert('Loglar silinirken hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Sistem Yöneticisi';
      case 'coordinator': return 'Bölüm/Program Başkanı';
      case 'program_head': return 'Bölüm/Program Başkanı';
      case 'instructor': return 'Öğretim Elemanı';
      default: return role || 'Kullanıcı';
    }
  };

  const roleBadgeStyle = (role) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'coordinator':
      case 'program_head': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'instructor': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const actionBadge = (action) => {
    switch (action) {
      case 'CREATE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none"><span className="material-symbols-outlined text-[13px]">add_circle</span>EKLEME</span>;
      case 'UPDATE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 leading-none"><span className="material-symbols-outlined text-[13px]">edit</span>GÜNCELLEME</span>;
      case 'DELETE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 leading-none"><span className="material-symbols-outlined text-[13px]">delete</span>SİLME</span>;
      case 'IMPORT':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 leading-none"><span className="material-symbols-outlined text-[13px]">upload_file</span>İÇE AKTARMA</span>;
      case 'EXPORT':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 leading-none"><span className="material-symbols-outlined text-[13px]">download</span>DIŞA AKTARMA</span>;
      case 'LOGIN':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 leading-none"><span className="material-symbols-outlined text-[13px]">login</span>GİRİŞ</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 leading-none">{action}</span>;
    }
  };

  const categoryIcon = (cat) => {
    switch (cat) {
      case 'Kullanıcı': return 'person';
      case 'Fakülte/Bölüm': return 'domain';
      case 'Dönem': return 'calendar_month';
      case 'Ders': return 'menu_book';
      case 'PÇ/DÇ': return 'target';
      case 'Matris': return 'grid_on';
      case 'Sınav': return 'assignment';
      case 'Not': return 'grade';
      case 'Öğrenci': return 'group';
      default: return 'info';
    }
  };

  const parseDate = (dateVal) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatRelativeTime = (isoDate) => {
    const d = parseDate(isoDate);
    if (!d) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return 'Az önce';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`;
    return d.toLocaleDateString('tr-TR');
  };

  const totalPages = Math.ceil(totalItems / perPage) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">history</span>
            <h2 className="text-2xl font-black text-on-surface tracking-tight">İşlem Geçmişi (Denetim İzi)</h2>
          </div>
          <p className="text-on-surface-variant mt-1 text-sm">
            Sistem yöneticileri, bölüm başkanları ve öğretim elemanlarının yaptığı tüm kritik eylemlerin kayıtları
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadLogs}
            disabled={loading}
            className="px-3.5 py-2 bg-white border border-outline-variant hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Listeyi Yenile"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Yenile
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Excel Olarak İndir"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            Excel İndir
          </button>
          <button
            onClick={handleClearLogs}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Logları Temizle"
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            Temizle
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">database</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Toplam Kayıt</p>
            <h3 className="text-xl font-black text-slate-800 mt-0.5">{totalItems.toLocaleString('tr-TR')}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">today</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bugünkü İşlemler</p>
            <h3 className="text-xl font-black text-blue-700 mt-0.5">{stats.todayCount}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">person</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">En Aktif Kullanıcı</p>
            <h3 className="text-sm font-bold text-slate-800 truncate mt-0.5" title={stats.topUser}>{stats.topUser}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">category</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">En Çok İşlem</p>
            <h3 className="text-sm font-bold text-slate-800 mt-0.5">{stats.topCategory}</h3>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-2xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
          {/* Text Search */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Detaylarda, kullanıcıda veya işlemde ara..."
              className="w-full pl-9 pr-4 py-2 border border-outline-variant rounded-lg text-xs font-medium focus:ring-1 focus:ring-primary focus:border-primary bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2.5 items-center">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="ALL">Tüm Roller</option>
              <option value="admin">Sistem Yöneticisi</option>
              <option value="coordinator">Bölüm/Program Başkanı</option>
              <option value="instructor">Öğretim Elemanı</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="ALL">Tüm Kategoriler</option>
              <option value="Kullanıcı">Kullanıcı</option>
              <option value="Fakülte/Bölüm">Fakülte / Bölüm</option>
              <option value="Dönem">Dönem</option>
              <option value="Ders">Ders</option>
              <option value="PÇ/DÇ">PÇ / DÇ</option>
              <option value="Matris">Matris</option>
              <option value="Sınav">Sınav</option>
              <option value="Not">Not</option>
              <option value="Öğrenci">Öğrenci</option>
            </select>

            {/* Action Filter */}
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="ALL">Tüm Eylemler</option>
              <option value="CREATE">Ekleme (CREATE)</option>
              <option value="UPDATE">Güncelleme (UPDATE)</option>
              <option value="DELETE">Silme (DELETE)</option>
              <option value="IMPORT">İçe Aktarma (IMPORT)</option>
            </select>

            {/* Time Filter */}
            <select
              value={timeFilter}
              onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}
              className="border border-outline-variant rounded-lg px-3 py-2 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="ALL">Tüm Zamanlar</option>
              <option value="TODAY">Bugün</option>
              <option value="WEEK">Son 7 Gün</option>
              <option value="MONTH">Son 30 Gün</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-container transition-all cursor-pointer"
            >
              Filtrele
            </button>
          </div>
        </form>
      </div>

      {/* Logs Table Card */}
      <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-outline-variant">
                <th className="px-4 py-3 w-44">Tarih & Zaman</th>
                <th className="px-4 py-3 w-48">Kullanıcı & Rol</th>
                <th className="px-3 py-3 w-32 text-center">İşlem Türü</th>
                <th className="px-3 py-3 w-32">Kategori</th>
                <th className="px-4 py-3">İşlem Detayı</th>
                <th className="px-3 py-3 w-16 text-center">İncele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-semibold text-xs">Kayıtlar yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-4xl text-slate-300">event_busy</span>
                      <span className="font-bold text-sm text-slate-600">Henüz kayıtlı işlem bulunamadı</span>
                      <span className="text-xs text-slate-400">Filtre kriterlerinizi değiştirmeyi veya arama terimini temizlemeyi deneyin.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const dateObj = parseDate(log.created) || parseDate(log.updated);
                  const dateStr = dateObj ? dateObj.toLocaleDateString('tr-TR') : '—';
                  const timeStr = dateObj ? dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Date & Time */}
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{dateStr} {timeStr}</div>
                        {dateObj && <div className="text-[10px] text-slate-400 font-medium">{formatRelativeTime(log.created || log.updated)}</div>}
                      </td>

                      {/* User & Role */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 truncate max-w-[180px]" title={log.user_name}>
                          {log.user_name || 'Sistem'}
                        </div>
                        <div className="mt-0.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border leading-tight ${roleBadgeStyle(log.user_role)}`}>
                            {roleLabel(log.user_role)}
                          </span>
                        </div>
                      </td>

                      {/* Action Type */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {actionBadge(log.action)}
                      </td>

                      {/* Category */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <span className="material-symbols-outlined text-[13px] text-slate-500">{categoryIcon(log.category)}</span>
                          {log.category || 'Genel'}
                        </span>
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3 text-slate-700 leading-relaxed font-medium">
                        <p className="line-clamp-2" title={log.details}>
                          {log.details || '—'}
                        </p>
                      </td>

                      {/* Inspect / Modal Trigger */}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors cursor-pointer"
                          title="Detayları İncele"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-slate-50 border-t border-outline-variant flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Toplam <strong className="text-slate-800">{totalItems}</strong> kayıttan{' '}
            <strong>{totalItems > 0 ? (page - 1) * perPage + 1 : 0}</strong> -{' '}
            <strong>{Math.min(page * perPage, totalItems)}</strong> arası gösteriliyor
          </div>

          <div className="flex items-center gap-2">
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="border border-outline-variant rounded-md px-2 py-1 bg-white font-medium text-xs"
            >
              <option value={25}>25 / sayfa</option>
              <option value={50}>50 / sayfa</option>
              <option value={100}>100 / sayfa</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 bg-white border border-outline-variant rounded text-slate-600 disabled:opacity-40 hover:bg-slate-100 font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              <span className="px-2 font-bold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 bg-white border border-outline-variant rounded text-slate-600 disabled:opacity-40 hover:bg-slate-100 font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary">info</span>
                <h3 className="text-base font-bold">İşlem Detay Raporu</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
              <div className="grid grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İşlem Tarihi</span>
                  <span className="text-slate-800 font-bold mt-0.5 block">{new Date(selectedLog.created).toLocaleString('tr-TR')}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İşlem Türü</span>
                  <div className="mt-1">{actionBadge(selectedLog.action)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kullanıcı</span>
                  <span className="text-slate-800 font-bold mt-0.5 block">{selectedLog.user_name || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kullanıcı Rolü</span>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${roleBadgeStyle(selectedLog.user_role)}`}>
                    {roleLabel(selectedLog.user_role)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kategori</span>
                  <span className="text-slate-800 font-bold mt-0.5 block">{selectedLog.category}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-1.5">Açıklama</h4>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 font-medium text-slate-700 leading-relaxed">
                  {selectedLog.details}
                </div>
              </div>

              {selectedLog.metadata && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 mb-1.5">Teknik Parametreler & Metadata</h4>
                  <pre className="bg-[#0f172a] text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition-all cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
