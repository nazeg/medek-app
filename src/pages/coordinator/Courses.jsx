import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useTerm } from '../../contexts/TermContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function CoordinatorCourses() {
  const { user: coordinatorUser } = useAuth();
  const { activeTerm } = useTerm();
  const { activeProgram } = useProgram();
  const { alert, confirm } = useAlertConfirm();
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [terms, setTerms] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ 
    code: '', name: '', sube: '', credits: '', akts: '', program: '', instructor: [], term: '', sinif: '', 
    pct_vize: '', pct_odev: '', pct_proje: '', pct_sunum: '', pct_uygulama: '', pct_final: '', pct_but: '',
    custom_weights: [] 
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [instructorSearch, setInstructorSearch] = useState('');
  const fileInputRef = useRef(null);

  // Instructor Edit States
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [editInstructorItem, setEditInstructorItem] = useState(null);
  const [instructorForm, setInstructorForm] = useState({ name: '', title: '', email: '', role: 'instructor', faculty: '' });

  // Add Custom Assessment Section Modal States
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const handleOpenAddSection = () => {
    setNewSectionName('');
    setShowAddSectionModal(true);
  };

  const handleConfirmAddSection = (e) => {
    if (e) e.preventDefault();
    const trimmed = (newSectionName || '').trim();
    if (!trimmed) return;

    const standardNames = ['Vize', 'Ödev', 'Proje', 'Sunum', 'Uygulama', 'Final', 'Bütünleme'];
    const exists = standardNames.some(s => s.toLowerCase() === trimmed.toLowerCase()) ||
                   (form.custom_weights || []).some(cw => cw.name?.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      alert(`"${trimmed}" adında bir değerlendirme bölümü zaten mevcut.`, 'Uyarı', 'warning');
      return;
    }

    setForm(prev => ({
      ...prev,
      custom_weights: [...(prev.custom_weights || []), { id: Date.now(), name: trimmed, percentage: '' }]
    }));
    setShowAddSectionModal(false);
    setNewSectionName('');
  };

  const updateCustomWeight = (index, field, value) => {
    setForm(prev => {
      const list = [...(prev.custom_weights || [])];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, custom_weights: list };
    });
  };

  const removeCustomWeight = (index) => {
    setForm(prev => {
      const list = [...(prev.custom_weights || [])];
      list.splice(index, 1);
      return { ...prev, custom_weights: list };
    });
  };

  const load = async () => {
    if (!coordinatorUser || !activeTerm || !activeProgram) return;
    try {
      const userFilter = `(role = "instructor" || role = "coordinator" || role = "program_head") ${coordinatorUser.faculty ? `&& faculty = "${coordinatorUser.faculty}"` : ''}`;
      const [c, i, t, f] = await Promise.all([
        pb.collection('courses').getFullList({ 
          sort: 'code', 
          filter: `program = "${activeProgram.id}" && term = "${activeTerm.id}"`,
          expand: 'program,instructor.faculty,term' 
        }),
        pb.collection('users').getFullList({ sort: 'name', filter: userFilter }),
        pb.collection('terms').getFullList({ sort: '-name' }),
        pb.collection('faculties').getFullList({ sort: 'name' }),
      ]);
      setCourses(c);
      setInstructors(i);
      setTerms(t);
      setFaculties(f);
    } catch (err) {
      console.error('Error loading courses resources:', err);
    }
  };

  useEffect(() => {
    load();
  }, [coordinatorUser, activeTerm, activeProgram]);

  const handleSave = async () => {
    if (!activeProgram) {
      await alert('Lütfen işlem yapmadan önce sağ üst menüden bir program seçiniz.', 'Hata', 'warning');
      return;
    }
    if (!activeTerm) {
      await alert('Lütfen işlem yapmadan önce sağ üst menüden bir dönem seçiniz.', 'Hata', 'warning');
      return;
    }

    if (!form.code || !form.code.trim()) {
      await alert('Ders Kodu alanı zorunludur.', 'Hata', 'warning');
      return;
    }
    if (!form.name || !form.name.trim()) {
      await alert('Ders Adı alanı zorunludur.', 'Hata', 'warning');
      return;
    }
    if (form.credits === undefined || form.credits === null || form.credits.toString().trim() === '') {
      await alert('Kredi alanı zorunludur.', 'Hata', 'warning');
      return;
    }
    if (form.akts === undefined || form.akts === null || form.akts.toString().trim() === '') {
      await alert('AKTS alanı zorunludur.', 'Hata', 'warning');
      return;
    }
    if (!form.sinif) {
      await alert('Sınıf alanı zorunludur. Lütfen bir sınıf seçiniz.', 'Hata', 'warning');
      return;
    }

    const vize = form.pct_vize !== '' && form.pct_vize !== null ? (parseInt(form.pct_vize) || 0) : 0;
    const odev = form.pct_odev !== '' && form.pct_odev !== null ? (parseInt(form.pct_odev) || 0) : 0;
    const proje = form.pct_proje !== '' && form.pct_proje !== null ? (parseInt(form.pct_proje) || 0) : 0;
    const sunum = form.pct_sunum !== '' && form.pct_sunum !== null ? (parseInt(form.pct_sunum) || 0) : 0;
    const uyg = form.pct_uygulama !== '' && form.pct_uygulama !== null ? (parseInt(form.pct_uygulama) || 0) : 0;
    const final = form.pct_final !== '' && form.pct_final !== null ? (parseInt(form.pct_final) || 0) : 0;
    const but = form.pct_but !== '' && form.pct_but !== null ? (parseInt(form.pct_but) || 0) : 0;

    const validCustomWeights = (form.custom_weights || []).filter(cw => cw.name?.trim() || cw.percentage !== '');
    for (const cw of validCustomWeights) {
      if (!cw.name?.trim()) {
        await alert('Eklenen değerlendirme alanının başlığı/adı boş bırakılamaz.', 'Hata', 'warning');
        return;
      }
      if (cw.percentage === '' || isNaN(parseInt(cw.percentage))) {
        await alert(`"${cw.name}" alanı için geçerli bir yüzde ağırlığı giriniz.`, 'Hata', 'warning');
        return;
      }
    }

    const customTotal = validCustomWeights.reduce((sum, cw) => sum + (parseInt(cw.percentage) || 0), 0);
    const totalWeights = vize + odev + proje + sunum + uyg + final + customTotal;

    if (totalWeights !== 100) {
      await alert(`Sınav değerlendirme ağırlıkları toplamı 100 olmalıdır. Şu anki toplam: ${totalWeights}`, 'Hata', 'warning');
      return;
    }

    try {
      const trimmedCode = form.code.trim();
      const trimmedSube = (form.sube || '').trim();
      const filter = editItem 
        ? `code = "${trimmedCode}" && sube = "${trimmedSube}" && program = "${activeProgram.id}" && term = "${activeTerm.id}" && id != "${editItem.id}"`
        : `code = "${trimmedCode}" && sube = "${trimmedSube}" && program = "${activeProgram.id}" && term = "${activeTerm.id}"`;
      const existing = await pb.collection('courses').getList(1, 1, { filter });
      if (existing.items.length > 0) {
        await alert(`Bu ders kodu ve şube kombinasyonu (${trimmedCode} - ${trimmedSube || 'Varsayılan'}) bu dönemde zaten kullanımda.`, 'Hata', 'error');
        return;
      }
    } catch (err) {
      console.error('Error checking duplicate course code/sube:', err);
    }

    try {
      const saveData = {
        code: form.code.trim(),
        name: form.name.trim(),
        sube: (form.sube || '').trim(),
        credits: form.credits.toString().trim(),
        akts: form.akts.toString().trim(),
        sinif: form.sinif,
        program: activeProgram.id,
        term: activeTerm.id,
        instructor: Array.isArray(form.instructor) ? form.instructor : [],
        pct_vize: vize,
        pct_odev: odev,
        pct_proje: proje,
        pct_sunum: sunum,
        pct_uygulama: uyg,
        pct_final: final,
        pct_but: but,
        custom_weights: validCustomWeights.map(cw => ({
          name: cw.name.trim(),
          percentage: parseInt(cw.percentage) || 0
        }))
      };

      if (editItem) {
        await pb.collection('courses').update(editItem.id, saveData);
      } else {
        await pb.collection('courses').create(saveData);
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ code: '', name: '', sube: '', credits: '', akts: '', program: '', instructor: [], term: activeTerm.id, sinif: '', pct_vize: '', pct_odev: '', pct_proje: '', pct_sunum: '', pct_uygulama: '', pct_final: '', pct_but: '', custom_weights: [] });
      setInstructorSearch('');
      load();
    } catch (err) {
      console.error('Error saving course:', err);
      let errorMsg = err.message || 'Bilinmeyen bir hata oluştu.';
      if (err?.data?.data) {
        const details = Object.entries(err.data.data)
          .map(([field, errObj]) => `${field}: ${errObj?.message || JSON.stringify(errObj)}`)
          .join(', ');
        if (details) errorMsg = `${errorMsg} (${details})`;
      }
      await alert('Ders kaydedilirken hata oluştu: ' + errorMsg, 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setInstructorSearch('');
    setForm({ 
      code: item.code || '', 
      name: item.name || '', 
      sube: item.sube || '',
      credits: item.credits ?? '', 
      akts: item.akts ?? '', 
      program: item.program || '', 
      instructor: Array.isArray(item.instructor) ? item.instructor : (item.instructor ? [item.instructor] : []), 
      term: item.term || activeTerm?.id || '', 
      sinif: item.sinif || '',
      pct_vize: item.pct_vize !== undefined && item.pct_vize !== null ? item.pct_vize : '',
      pct_odev: item.pct_odev !== undefined && item.pct_odev !== null ? item.pct_odev : '',
      pct_proje: item.pct_proje !== undefined && item.pct_proje !== null ? item.pct_proje : '',
      pct_sunum: item.pct_sunum !== undefined && item.pct_sunum !== null ? item.pct_sunum : '',
      pct_uygulama: item.pct_uygulama !== undefined && item.pct_uygulama !== null ? item.pct_uygulama : '',
      pct_final: item.pct_final !== undefined && item.pct_final !== null ? item.pct_final : '',
      pct_but: item.pct_but !== undefined && item.pct_but !== null ? item.pct_but : '',
      custom_weights: Array.isArray(item.custom_weights) ? item.custom_weights.map((cw, idx) => ({ id: idx, name: cw.name || '', percentage: cw.percentage ?? '' })) : []
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      await pb.collection('courses').delete(id);
      load();
    }
  };

  const handleEditInstructor = (item) => {
    setEditInstructorItem(item);
    setInstructorForm({
      name: item.name,
      title: item.title || '',
      email: item.email || '',
      role: item.role,
      faculty: item.faculty || '',
    });
    setShowInstructorModal(true);
  };

  const handleSaveInstructor = async () => {
    try {
      if (!instructorForm.name.trim()) {
        await alert('Ad Soyad alanı boş bırakılamaz.', 'Hata', 'error');
        return;
      }
      if (!instructorForm.email.trim()) {
        await alert('E-posta alanı boş bırakılamaz.', 'Hata', 'error');
        return;
      }
      await pb.collection('users').update(editInstructorItem.id, {
        name: instructorForm.name,
        title: instructorForm.title,
        email: instructorForm.email,
        faculty: instructorForm.faculty || '',
      });
      setShowInstructorModal(false);
      setEditInstructorItem(null);
      load();
    } catch (err) {
      await alert('Hata: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const downloadTemplate = async () => {
    const headers = ["Ders Kodu", "Şube", "Ders Adı", "Kredi", "AKTS", "Sınıf", "Sorumlu Ünvan", "Sorumlu Email"];

    // ExcelJS ile workbook oluşturalım
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dersler');

    // Sayfa görünümü ayarı: Kılavuz çizgileri görünür olsun
    worksheet.views = [
      { showGridLines: true }
    ];

    // Kolon tanımları ve genişlikleri
    worksheet.columns = headers.map(h => {
      let width = 15;
      if (h === "Ders Adı") width = 35;
      else if (h === "Şube") width = 10;
      else if (h === "Sorumlu Ünvan") width = 18;
      else if (h === "Sorumlu Email") width = 25;
      return { header: h, key: h, width: width };
    });

    // Örnek verileri ekle
    worksheet.addRow(["BIL101", "A", "Programlamaya Giriş", 3, 5, 1, "Dr. Öğr. Üyesi", "hoca@universite.edu.tr"]);

    // Stil ve Koruma İşlemleri
    // 1. Satır: Başlık Satırı
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    for (let c = 1; c <= headers.length; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A2A3A' } // Koyu lacivert/gri tema rengi
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF333333' } },
        bottom: { style: 'medium', color: { argb: 'FF111111' } },
        left: { style: 'thin', color: { argb: 'FF333333' } },
        right: { style: 'thin', color: { argb: 'FF333333' } }
      };
      cell.protection = { locked: true }; // KİLİTLİ
    }

    // 2. Satır ve Sonrası (Veri satırları)
    // Kullanıcıların veri girişi yapabilmesi için kilidi kaldırıyoruz.
    for (let r = 2; r <= 2000; r++) {
      const row = worksheet.getRow(r);
      row.height = 20;
      const isZebra = (r % 2 === 0);
      const bgArgb = isZebra ? 'FFF8F9FA' : 'FFFFFFFF';

      for (let c = 1; c <= headers.length; c++) {
        const cell = row.getCell(c);
        cell.protection = { locked: false }; // KİLİTSİZ (DÜZENLENEBİLİR)
        cell.font = {
          name: 'Segoe UI',
          size: 10
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: (c === 2) ? 'left' : 'center'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgArgb }
        };
      }
    }

    // Sayfa korumasını aktif et
    await worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertColumns: false,
      insertRows: true,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: true,
      sort: true,
      autoFilter: true,
      pivotTables: false
    });

    // Blob olarak yazıp indir
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "ders_template.xlsx";
    link.click();
  };

  const normalizeTitle = (rawTitle) => {
    if (!rawTitle) return '';
    const clean = rawTitle.trim().toLocaleLowerCase('tr-TR')
      .replace(/\s+/g, ' ')
      .replace(/[.,]/g, '');

    if (clean.includes('prof') || clean.includes('profesör') || clean.includes('profesor')) {
      return 'Prof. Dr.';
    }
    if (clean.includes('doç') || clean.includes('doc') || clean.includes('doçent') || clean.includes('docent')) {
      return 'Doç. Dr.';
    }
    if (
      clean.includes('dr öğretim üyesi') || 
      clean.includes('dr ogretim uyesi') || 
      clean.includes('dr öğr üyesi') || 
      clean.includes('yrd') || 
      clean.includes('yardımcı') || 
      clean.includes('yardimci')
    ) {
      return 'Dr. Öğr. Üyesi';
    }
    if (
      (clean.includes('öğr gör') || clean.includes('ogr gor') || clean.includes('öğretim görevlisi') || clean.includes('ogretim gorevlisi')) &&
      (clean.includes('dr') || clean.includes('doktor'))
    ) {
      return 'Öğr. Gör. Dr.';
    }
    if (clean.includes('öğr gör') || clean.includes('ogr gor') || clean.includes('öğretim görevlisi') || clean.includes('ogretim gorevlisi')) {
      return 'Öğr. Gör.';
    }
    if (
      (clean.includes('arş gör') || clean.includes('ars gor') || clean.includes('araştırma görevlisi') || clean.includes('arastirma gorevlisi')) &&
      (clean.includes('dr') || clean.includes('doktor'))
    ) {
      return 'Arş. Gör. Dr.';
    }
    if (clean.includes('arş gör') || clean.includes('ars gor') || clean.includes('araştırma görevlisi') || clean.includes('arastirma gorevlisi')) {
      return 'Arş. Gör.';
    }
    if (clean.includes('eleman') || clean.includes('okutman')) {
      return 'Öğr. Elemanı';
    }
    return rawTitle;
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeProgram || !activeTerm) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const allUsers = await pb.collection('users').getFullList();
      const allCourses = await pb.collection('courses').getFullList();
      let created = 0, errors = 0, skipped = 0;
      for (const row of rows) {
        const code = String(row['Ders Kodu'] || row['code'] || '').trim();
        const sube = String(row['Şube'] || row['sube'] || row['Section'] || '').trim();
        const name = String(row['Ders Adı'] || row['name'] || '').trim();
        const credits = String(row['Kredi'] || row['credits'] || '').trim();
        const akts = String(row['AKTS'] || row['akts'] || '').trim();
        const sinif = String(row['Sınıf'] || row['sinif'] || '1').trim();
        const emailsStr = String(row['Sorumlu Email'] || row['email'] || '').trim();
        const titlesStr = String(row['Sorumlu Ünvan'] || row['Sorumlu Unvan'] || row['title'] || '').trim();
        
        // Skip entirely blank rows silently
        if (!code && !name) { continue; }
        // If it has a code or a name but not both, count it as a validation error
        if (!code || !name) { errors++; continue; }

        // Skip if the course code and sube combination already exists
        if (allCourses.some(c => c.code.trim().toLowerCase() === code.toLowerCase() && (c.sube || '').trim().toLowerCase() === sube.toLowerCase())) {
          skipped++;
          continue;
        }

        const emails = emailsStr.split(/[,;]/).map(e => e.trim()).filter(Boolean);
        const rawTitles = titlesStr.split(/[,;]/).map(t => t.trim()).filter(Boolean);
        const instructorIds = [];

        for (let idx = 0; idx < emails.length; idx++) {
          const email = emails[idx];
          const rawTitle = rawTitles[idx] || rawTitles[0] || '';
          const title = normalizeTitle(rawTitle);

          if (email) {
            const matchedUser = allUsers.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
            if (matchedUser) {
              instructorIds.push(matchedUser.id);
            } else {
              // Create a new instructor user
              try {
                const localPart = email.split('@')[0];
                const parts = localPart.split(/[._-]/).filter(Boolean);
                const capitalizedParts = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
                const displayName = capitalizedParts.join(' ');
                
                const newUser = await pb.collection('users').create({
                  email: email,
                  password: 'password123',
                  passwordConfirm: 'password123',
                  name: displayName || email,
                  title: title,
                  role: 'instructor',
                  active: true,
                  emailVisibility: true,
                  faculty: coordinatorUser?.faculty || '',
                  program: activeProgram?.id || ''
                });
                
                allUsers.push(newUser);
                instructorIds.push(newUser.id);
              } catch (err) {
                console.error('Error creating user from excel row:', err);
                errors++;
              }
            }
          }
        }

        try {
          await pb.collection('courses').create({
            code, name, sube, credits: credits || '3', akts: akts || '5',
            sinif: sinif || '1', program: activeProgram.id,
            term: activeTerm.id, instructor: instructorIds,
            pct_vize: 40, pct_odev: 0, pct_uygulama: 0, pct_final: 60, pct_but: 60
          });
          created++;
        } catch (err) {
          console.error("Course creation failed for row:", row, err);
          errors++;
        }
      }
      setImportResult({ created, errors, skipped });
      load();
    } catch (err) {
      console.error("Excel import failed:", err);
      setImportResult({ created: 0, errors: 1 });
    }
    setImporting(false);
    e.target.value = '';
  };

  return (
    <>
      <div className="flex justify-between items-end gap-4">
        <div>
          <h2 className="text-headline-lg text-on-surface">Eğitim Müfredatı</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Ders ekleme, AKTS belirleme ve sorumlu atama</p>
        </div>
        {activeProgram && (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileImport} className="hidden" />
            <button onClick={downloadTemplate} className="px-3 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface flex items-center gap-2 active:scale-95">
              <span className="material-symbols-outlined text-lg">download</span> Şablon İndir
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="px-3 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface flex items-center gap-2 active:scale-95 disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">upload</span> {importing ? 'Yükleniyor...' : "Excel'den Aktar"}
            </button>
            <button onClick={() => { setEditItem(null); setInstructorSearch(''); setForm({ code: '', name: '', sube: '', credits: '', akts: '', program: '', instructor: [], term: activeTerm?.id || '', sinif: '', pct_vize: '', pct_odev: '', pct_proje: '', pct_sunum: '', pct_uygulama: '', pct_final: '', pct_but: '', custom_weights: [] }); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
              <span className="material-symbols-outlined text-lg">add</span> Ders Ekle
            </button>
          </div>
        )}
      </div>
      {importResult && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${importResult.errors > 0 && importResult.created === 0 ? 'bg-error-container text-error' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <span className="material-symbols-outlined text-lg">{importResult.errors > 0 && importResult.created === 0 ? 'error' : 'check_circle'}</span>
          {importResult.created} ders eklendi, {importResult.skipped || 0} ders atlandı{importResult.errors > 0 ? `, ${importResult.errors} hata oluştu.` : '.'}
          <button onClick={() => setImportResult(null)} className="ml-auto"><span className="material-symbols-outlined text-lg">close</span></button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        {!activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {activeProgram && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant">
                <th className="px-4 py-2.5 font-semibold">Kod</th>
                <th className="px-4 py-2.5 font-semibold">Ders Adı</th>
                <th className="px-4 py-2.5 font-semibold">Kredi/AKTS</th>
                <th className="px-4 py-2.5 font-semibold">Sorumlu</th>
                <th className="px-4 py-2.5 font-semibold">Sınıf</th>
                <th className="px-4 py-2.5 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {courses.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-4 py-2 font-mono text-sm font-semibold">
                    {c.code}
                    {c.sube && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] bg-secondary-container text-on-secondary-container font-sans font-bold">Şube: {c.sube}</span>}
                  </td>
                  <td className="px-4 py-2 font-medium text-sm text-on-surface">{c.name}</td>
                  <td className="px-4 py-2 text-sm">{c.credits}/{c.akts} AKTS</td>
                  <td className="px-4 py-2 text-sm text-on-surface-variant">
                    {(() => {
                      const instList = c.expand?.instructor;
                      if (!instList) return '—';
                      const list = Array.isArray(instList) ? instList : [instList];
                      if (list.length === 0) return '—';
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((ins) => (
                            <button
                              key={ins.id}
                              onClick={() => handleEditInstructor(ins)}
                              className="inline-flex items-center text-primary hover:bg-primary/10 font-medium text-xs bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10 transition-colors"
                              title={ins.role === 'instructor' ? "Öğretim Elemanını Düzenle" : "Kullanıcı Bilgilerini Görüntüle"}
                            >
                              {ins.title ? `${ins.title} ${ins.name}` : ins.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-sm">{c.sinif ? `${c.sinif}. Sınıf` : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1 transition-opacity">
                      <button onClick={() => handleEdit(c)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Düzenle"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-surface-container rounded text-error" title="Sil"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant text-sm">Henüz ders eklenmemiş.</td></tr>}
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
          <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md">{editItem ? 'Ders Düzenle' : 'Yeni Ders'}</h3>
              <button onClick={() => setShowModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Course details */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">
                      Ders Kodu <span className="text-error">*</span>
                    </label>
                    <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Örn: BIL101" className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" required />
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Şube</label>
                    <input value={form.sube} onChange={e => setForm({ ...form, sube: e.target.value })} placeholder="Örn: A" className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" />
                  </div>
                </div>

                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">
                    Ders Adı <span className="text-error">*</span>
                  </label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn: Programlamaya Giriş" className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" required />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">
                      Kredi <span className="text-error">*</span>
                    </label>
                    <input type="number" min="0" value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })} placeholder="Örn: 3" className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" required />
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">
                      AKTS <span className="text-error">*</span>
                    </label>
                    <input type="number" min="0" value={form.akts} onChange={e => setForm({ ...form, akts: e.target.value })} placeholder="Örn: 5" className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" required />
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">
                      Sınıf <span className="text-error">*</span>
                    </label>
                    <select value={form.sinif || ''} onChange={e => setForm({ ...form, sinif: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary" required>
                      <option value="">Seçiniz</option>
                      {[1, 2, 3, 4, 5, 6].map(s => <option key={s} value={s}>{s}. Sınıf</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Program</label>
                    <input
                      type="text"
                      value={activeProgram?.name || 'Seçili Program Yok'}
                      disabled
                      className="w-full border border-outline-variant bg-slate-50 text-slate-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Dönem</label>
                    <input
                      type="text"
                      value={activeTerm?.name || 'Seçili Dönem Yok'}
                      disabled
                      className="w-full border border-outline-variant bg-slate-50 text-slate-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="border border-outline-variant rounded-lg p-3.5 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface">
                        Sınav Ağırlıkları (%) <span className="text-error">*</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenAddSection}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-container bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded transition-colors active:scale-95"
                        title="Yeni bir değerlendirme bölümü ekle"
                      >
                        <span className="material-symbols-outlined text-[13px]">add</span>
                        Bölüm Ekle
                      </button>
                    </div>
                    {(() => {
                      const customTotal = (form.custom_weights || []).reduce((sum, cw) => sum + (cw.percentage !== '' ? parseInt(cw.percentage) || 0 : 0), 0);
                      const total = (form.pct_vize !== '' ? parseInt(form.pct_vize) || 0 : 0) + 
                                    (form.pct_odev !== '' ? parseInt(form.pct_odev) || 0 : 0) + 
                                    (form.pct_proje !== '' ? parseInt(form.pct_proje) || 0 : 0) + 
                                    (form.pct_sunum !== '' ? parseInt(form.pct_sunum) || 0 : 0) + 
                                    (form.pct_uygulama !== '' ? parseInt(form.pct_uygulama) || 0 : 0) + 
                                    (form.pct_final !== '' ? parseInt(form.pct_final) || 0 : 0) +
                                    customTotal;
                      const isCorrect = total === 100;
                      return (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                          Toplam: {total} / 100
                        </span>
                      );
                    })()}
                  </div>

                  {/* All exam weights rendered side by side */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Vize</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_vize ?? ''} onChange={e => setForm({ ...form, pct_vize: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Ödev</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_odev ?? ''} onChange={e => setForm({ ...form, pct_odev: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Proje</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_proje ?? ''} onChange={e => setForm({ ...form, pct_proje: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Sunum</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_sunum ?? ''} onChange={e => setForm({ ...form, pct_sunum: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Uyg.</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_uygulama ?? ''} onChange={e => setForm({ ...form, pct_uygulama: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>

                    {/* Custom dynamically added sections */}
                    {(form.custom_weights || []).map((cw, idx) => (
                      <div key={cw.id || idx} className="relative group bg-primary/[0.04] p-1 rounded-lg border border-primary/25">
                        <div className="flex items-center justify-between gap-0.5 mb-1 px-0.5">
                          <label className="text-[10px] uppercase tracking-wider text-primary font-bold truncate block" title={cw.name}>
                            {cw.name}
                          </label>
                          <button
                            type="button"
                            onClick={() => removeCustomWeight(idx)}
                            className="text-on-surface-variant/70 hover:text-error transition-colors p-0.5 rounded-full hover:bg-error/10 flex items-center justify-center shrink-0"
                            title={`${cw.name} bölümünü sil`}
                          >
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="—"
                          value={cw.percentage ?? ''}
                          onChange={e => updateCustomWeight(idx, 'percentage', e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                          className="w-full border border-primary/30 focus:border-primary rounded px-1 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary text-center font-medium"
                        />
                      </div>
                    ))}

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Final</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_final ?? ''} onChange={e => setForm({ ...form, pct_final: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1 font-semibold text-center truncate">Büt</label>
                      <input type="number" min="0" max="100" placeholder="—" value={form.pct_but ?? ''} onChange={e => setForm({ ...form, pct_but: e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-full border border-outline-variant rounded px-1.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-primary focus:border-primary text-center" />
                    </div>
                  </div>

                  <span className="text-[10px] text-on-surface-variant block">Not: Tüm değerlendirme ağırlıklarının toplamı 100 olmalıdır. (Bütünleme, Final yerine geçer.)</span>
                </div>
              </div>

              {/* Right Column: Instructor Selection */}
              <div className="flex flex-col h-full">
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-semibold">Sorumlu Öğretim Elemanı / Elemanları</label>
                
                <div className="relative mb-2">
                  <input
                    type="text"
                    placeholder="Eğitmen ara (Ad veya E-posta)..."
                    value={instructorSearch}
                    onChange={e => setInstructorSearch(e.target.value)}
                    className="w-full border border-outline-variant rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  />
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
                    search
                  </span>
                </div>

                <div className="border border-outline-variant rounded-lg p-3 flex-1 min-h-[160px] md:min-h-[220px] max-h-[240px] overflow-y-auto space-y-1 bg-white">
                  {(() => {
                    const filtered = instructors.filter(i => {
                      const fullName = (i.title ? `${i.title} ${i.name}` : i.name).toLocaleLowerCase('tr-TR');
                      return fullName.includes(instructorSearch.toLocaleLowerCase('tr-TR')) || 
                             (i.email || '').toLowerCase().includes(instructorSearch.toLowerCase());
                    });

                    return (
                      <>
                        {filtered.map(i => {
                          const isChecked = form.instructor?.includes(i.id);
                          return (
                            <label key={i.id} className="flex items-center gap-2.5 text-sm font-medium text-on-surface cursor-pointer select-none hover:bg-slate-50 p-1.5 rounded transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked || false}
                                onChange={(e) => {
                                  const nextIds = e.target.checked
                                    ? [...(form.instructor || []), i.id]
                                    : (form.instructor || []).filter(id => id !== i.id);
                                  setForm({ ...form, instructor: nextIds });
                                }}
                                className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                              />
                              <span>{i.title ? `${i.title} ${i.name}` : i.name}</span>
                            </label>
                          );
                        })}
                        {filtered.length === 0 && (
                          <p className="text-xs text-on-surface-variant text-center py-2">Eşleşen öğretim elemanı bulunamadı.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface">İptal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">Kaydet</button>
            </div>
          </div>
        </div>
      )}
      {showInstructorModal && (() => {
        const isInstructorEditable = instructorForm.role === 'instructor';
        const roleLabels = {
          admin: 'Sistem Yöneticisi',
          coordinator: 'Bölüm Başkanı',
          program_head: 'Program Başkanı',
          instructor: 'Öğretim Elemanı'
        };
        return (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
            onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
            onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowInstructorModal(false); }}
          >
            <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                <h3 className="text-headline-md text-on-surface">
                  {isInstructorEditable ? 'Kullanıcı Düzenle' : 'Kullanıcı Detayları'}
                </h3>
                <button onClick={() => setShowInstructorModal(false)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ünvan</label>
                    <select 
                      value={instructorForm.title} 
                      onChange={e => setInstructorForm({ ...instructorForm, title: e.target.value })} 
                      disabled={!isInstructorEditable}
                      className={`w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm ${!isInstructorEditable ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary/20 focus:border-primary'}`}
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
                    <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Ad Soyad</label>
                    <input 
                      value={instructorForm.name} 
                      onChange={e => setInstructorForm({ ...instructorForm, name: e.target.value })} 
                      disabled={!isInstructorEditable}
                      className={`w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm ${!isInstructorEditable ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary/20 focus:border-primary'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">E-posta</label>
                  <input 
                    value={instructorForm.email} 
                    onChange={e => setInstructorForm({ ...instructorForm, email: e.target.value })} 
                    disabled={!isInstructorEditable}
                    className={`w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm ${!isInstructorEditable ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary/20 focus:border-primary'}`}
                  />
                </div>
                <div>
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Rol</label>
                  <input 
                    value={roleLabels[instructorForm.role] || instructorForm.role} 
                    disabled 
                    className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm bg-slate-50 text-slate-500 cursor-not-allowed" 
                  />
                </div>
                <div>
                  <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider block mb-1.5">Fakülte / MYO</label>
                  <select 
                    value={instructorForm.faculty} 
                    onChange={e => setInstructorForm({ ...instructorForm, faculty: e.target.value })} 
                    disabled={!isInstructorEditable}
                    className={`w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm ${!isInstructorEditable ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary/20 focus:border-primary'}`}
                  >
                    <option value="">Seçiniz</option>
                    {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
                <button onClick={() => setShowInstructorModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface">
                  {isInstructorEditable ? 'İptal' : 'Kapat'}
                </button>
                {isInstructorEditable && (
                  <button onClick={handleSaveInstructor} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-container">Kaydet</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Custom Assessment Section Modal */}
      {showAddSectionModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddSectionModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-outline-variant">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant">
              <h4 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-lg">add_circle</span>
                Yeni Değerlendirme Bölümü
              </h4>
              <button onClick={() => setShowAddSectionModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            
            <form onSubmit={handleConfirmAddSection} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                  Bölüm / Sınav Adı <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Örn: Laboratuvar, Quiz, Portfolyo..."
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSectionModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary-container rounded-lg transition-all shadow-sm active:scale-95"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
