import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { useActiveCourse } from '../../contexts/CourseContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function Exams() {
  const { confirm, alert } = useAlertConfirm();
  const { user } = useAuth();
  const { activeCourse, selectCourse, courses } = useActiveCourse();
  
  const [exams, setExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [courseOutcomes, setCourseOutcomes] = useState([]);
  const [programOutcomes, setProgramOutcomes] = useState([]);
  const [pcDcMatrix, setPcDcMatrix] = useState([]);

  const [activeFilter, setActiveFilter] = useState('Tümü'); // Tümü, Vize, Final, Bütünleme, Ödev, Uygulama
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [importing, setImporting] = useState(false);
  
  const fileInputRef = useRef(null);

  const [questionForm, setQuestionForm] = useState({
    id: null,
    code: '',
    number: '',
    text: '',
    max_score: '',
    course_outcome: [], // Array for multi-select
    exam: 'Vize', // Will store type (Vize, Final, etc.)
    type: 'Klasik',
    answer: ''
  });

  const loadAllData = async () => {
    if (!activeCourse?.id) {
      setExams([]);
      setQuestions([]);
      setCourseOutcomes([]);
      setProgramOutcomes([]);
      setPcDcMatrix([]);
      return;
    }

    try {
      const examList = await pb.collection('exams').getFullList({
        filter: `course = "${activeCourse.id}"`,
        sort: 'type'
      });
      setExams(examList);

      const coList = await pb.collection('course_outcomes').getFullList({
        filter: `course = "${activeCourse.id}"`,
        sort: 'code'
      });
      coList.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      setCourseOutcomes(coList);

      if (activeCourse.program) {
        const poList = await pb.collection('program_outcomes').getFullList({
          filter: `program = "${activeCourse.program}"`,
          sort: 'code'
        });
        poList.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        setProgramOutcomes(poList);

        const matrixList = await pb.collection('pc_dc_matrix').getFullList({
          filter: `program = "${activeCourse.program}"`
        });
        setPcDcMatrix(matrixList);
      } else {
        setProgramOutcomes([]);
        setPcDcMatrix([]);
      }

      const questionList = await pb.collection('questions').getFullList({
        filter: `exam.course = "${activeCourse.id}"`,
        sort: 'number',
        expand: 'exam,course_outcome'
      });
      setQuestions(questionList);
    } catch (err) {
      console.error('Error loading data in Exams:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeCourse]);

  // Set default exam and question numbers when activeCourse changes
  useEffect(() => {
    if (activeCourse?.id) {
      resetQuestionForm('Vize');
    }
  }, [activeCourse]);

  const getNextQuestionInfo = (examId, currentQuestions = questions) => {
    const examQuestions = currentQuestions.filter(q => q.exam === examId);
    const maxNum = examQuestions.reduce((max, q) => Math.max(max, q.number || 0), 0);
    const nextNum = maxNum + 1;
    return {
      number: nextNum,
      code: `S${nextNum}`
    };
  };

  const resetQuestionForm = (defaultExamType = 'Vize', currentQuestions = questions) => {
    const examObj = exams.find(e => e.type.toLowerCase() === defaultExamType.toLowerCase());
    let nextNum = 1;
    let nextCode = 'S1';
    if (examObj) {
      const nextInfo = getNextQuestionInfo(examObj.id, currentQuestions);
      nextNum = nextInfo.number;
      nextCode = nextInfo.code;
    }
    setQuestionForm({
      id: null,
      code: nextCode,
      number: nextNum,
      text: '',
      max_score: '',
      course_outcome: [],
      exam: defaultExamType,
      type: 'Klasik',
      answer: ''
    });
  };

  const handleExamChange = (type) => {
    const examObj = exams.find(e => e.type.toLowerCase() === type.toLowerCase());
    const examQuestions = examObj ? questions.filter(q => q.exam === examObj.id) : [];
    const maxNum = examQuestions.reduce((max, q) => Math.max(max, q.number || 0), 0);
    const nextNum = maxNum + 1;

    setQuestionForm(prev => ({
      ...prev,
      exam: type,
      number: prev.id ? prev.number : nextNum,
      code: prev.id ? prev.code : `S${nextNum}`
    }));
  };

  const handleDcCheckboxChange = (dcId, checked) => {
    setQuestionForm(prev => {
      const current = Array.isArray(prev.course_outcome) 
        ? prev.course_outcome 
        : (prev.course_outcome ? [prev.course_outcome] : []);
      const updated = checked
        ? [...current, dcId]
        : current.filter(id => id !== dcId);
      return { ...prev, course_outcome: updated };
    });
  };

  const getRelatedPcsForDcs = (dcIds) => {
    if (!dcIds || (Array.isArray(dcIds) && dcIds.length === 0)) return [];
    const ids = Array.isArray(dcIds) ? dcIds : [dcIds];
    const pcMap = new Map();
    
    ids.forEach(dcId => {
      pcDcMatrix
        .filter(m => m.dc === dcId && m.level > 0)
        .forEach(m => {
          const po = programOutcomes.find(p => p.id === m.pc);
          if (po) {
            const existingLevel = pcMap.get(po.code) || 0;
            pcMap.set(po.code, Math.max(existingLevel, m.level));
          }
        });
    });

    return Array.from(pcMap.entries())
      .map(([code, level]) => ({ code, level }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!questionForm.exam) {
      return alert('Lütfen bir sınav türü seçin.', 'Hata', 'error');
    }
    if (!questionForm.code) {
      return alert('Lütfen soru kodunu girin.', 'Hata', 'error');
    }
    if (!questionForm.max_score) {
      return alert('Lütfen puan alanını doldurun.', 'Hata', 'error');
    }

    // Calculate total score of existing questions + new score
    let examObj = exams.find(ex => ex.type.toLowerCase() === questionForm.exam.toLowerCase());
    const examQuestions = examObj ? questions.filter(q => q.exam === examObj.id) : [];
    const otherQuestions = examQuestions.filter(q => q.id !== questionForm.id);
    const existingSum = otherQuestions.reduce((sum, q) => sum + (q.max_score || 0), 0);
    const newScore = parseInt(questionForm.max_score) || 0;
    const totalScore = existingSum + newScore;

    if (totalScore > 100) {
      return alert(
        `Bu soru kaydedilemez. "${questionForm.exam}" sınavı için toplam puan 100'ü geçiyor (Diğer soruların toplamı: ${existingSum} p, Bu soru: ${newScore} p, Toplam: ${totalScore} p).`,
        'Hata',
        'error'
      );
    }

    // Resolve or create Exam record in pocketbase
    if (!examObj) {
      try {
        examObj = await pb.collection('exams').create({
          course: activeCourse.id,
          type: questionForm.exam,
          name: questionForm.exam,
          date: ''
        });
        setExams(prev => [...prev, examObj]);
      } catch (err) {
        console.error('Error creating exam:', err);
        return alert('Sınav kaydı oluşturulurken hata oluştu.', 'Hata', 'error');
      }
    }

    const data = {
      exam: examObj.id,
      number: parseInt(questionForm.number) || 1,
      code: questionForm.code,
      type: questionForm.type,
      text: questionForm.text,
      max_score: parseInt(questionForm.max_score),
      course_outcome: Array.isArray(questionForm.course_outcome) ? questionForm.course_outcome : [],
      answer: questionForm.answer
    };

    try {
      if (questionForm.id) {
        await pb.collection('questions').update(questionForm.id, data);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.EXAM,
          details: `"${activeCourse?.code} - ${activeCourse?.name}" dersinin "${questionForm.exam}" sınavı için "${questionForm.code || 'Soru ' + questionForm.number}" sorusu güncellendi. (${questionForm.max_score} Puan)`,
          metadata: { questionId: questionForm.id, exam: questionForm.exam, maxScore: questionForm.max_score, course: activeCourse?.name }
        });
      } else {
        const res = await pb.collection('questions').create(data);
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.EXAM,
          details: `"${activeCourse?.code} - ${activeCourse?.name}" dersinin "${questionForm.exam}" sınavına "${questionForm.code || 'Soru ' + questionForm.number}" sorusu eklendi. (${questionForm.max_score} Puan)`,
          metadata: { questionId: res.id, exam: questionForm.exam, maxScore: questionForm.max_score, course: activeCourse?.name }
        });
      }
      
      const questionList = await pb.collection('questions').getFullList({
        filter: `exam.course = "${activeCourse.id}"`,
        sort: 'number',
        expand: 'exam,course_outcome'
      });
      setQuestions(questionList);
      resetQuestionForm(questionForm.exam, questionList);
      setShowQuestionModal(false);
    } catch (err) {
      console.error('Error saving question:', err);
      alert('Soru kaydedilirken bir hata oluştu: ' + err.message, 'Hata', 'error');
    }
  };

  const handleDeleteQuestion = async (id) => {
    const target = questions.find(q => q.id === id);
    if (await confirm('Bu soruyu silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('questions').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.EXAM,
          details: `"${activeCourse?.code} - ${activeCourse?.name}" dersinin "${target?.expand?.exam?.type || 'Sınav'}" sınavından "${target?.code || 'Soru ' + target?.number}" sorusu silindi.`,
          metadata: { questionId: id, course: activeCourse?.name }
        });
        const questionList = await pb.collection('questions').getFullList({
          filter: `exam.course = "${activeCourse.id}"`,
          sort: 'number',
          expand: 'exam,course_outcome'
        });
        setQuestions(questionList);
        if (questionForm.id === id) {
          resetQuestionForm('Vize', questionList);
        }
      } catch (err) {
        console.error('Error deleting question:', err);
        alert('Soru silinirken bir hata oluştu.', 'Hata', 'error');
      }
    }
  };

  const handleEditQuestion = (q) => {
    const examObj = exams.find(e => e.id === q.exam) || q.expand?.exam;
    setQuestionForm({
      id: q.id,
      code: q.code || `S${q.number}`,
      number: q.number || 1,
      text: q.text || '',
      max_score: q.max_score || '',
      course_outcome: Array.isArray(q.course_outcome) ? q.course_outcome : (q.course_outcome ? [q.course_outcome] : []),
      exam: examObj ? examObj.type : 'Vize',
      type: q.type || 'Klasik',
      answer: q.answer || ''
    });
    setShowQuestionModal(true);
  };

  const downloadTemplate = async () => {
    const headers = ["Kod", "Açıklama", "Sınav", "Tür", "DÇ", "Puan", "Cevap"];

    // ExcelJS ile workbook oluşturalım
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sorular');

    // Sayfa görünümü ayarı: Kılavuz çizgileri görünür olsun
    worksheet.views = [
      { showGridLines: true }
    ];

    // Kolon tanımları ve genişlikleri
    worksheet.columns = headers.map(h => {
      let width = 15;
      if (h === "Açıklama") width = 35;
      else if (h === "Tür") width = 20;
      else if (h === "Kod" || h === "DÇ" || h === "Puan" || h === "Cevap") width = 12;
      return { header: h, key: h, width: width };
    });

    // Örnek verileri ekle
    worksheet.addRow(["S1", "Örnek Soru Metni 1", "Vize", "Klasik", "DÇ1", 10, ""]);
    worksheet.addRow(["S2", "Örnek Soru Metni 2", "Vize", "Çoktan Seçmeli", "DÇ1", 5, "A"]);
    worksheet.addRow(["S3", "Örnek Soru Metni 3", "Vize", "Doğru/Yanlış", "DÇ1", 5, "Doğru"]);
    worksheet.addRow(["S4", "Örnek Soru Metni 4", "Vize", "Boşluk Doldurma", "DÇ1", 10, ""]);

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
    link.download = "Soru_Sablonu.xlsx";
    link.click();
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeCourse?.id) return;
    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const currentExams = [...exams];

      // Pre-validate total scores to ensure no exam exceeds 100 points
      const importSums = {};
      for (const row of rows) {
        const rawCode = String(row['Kod'] || row['code'] || '').trim();
        if (!rawCode) continue;

        const rawExamType = String(row['Sınav'] || row['exam_type'] || 'Vize').trim().toLowerCase();
        const rawMaxScore = parseInt(row['Puan'] || row['score']) || 10;
        importSums[rawExamType] = (importSums[rawExamType] || 0) + rawMaxScore;
      }

      for (const examType of Object.keys(importSums)) {
        const examObj = currentExams.find(e => e.type.toLowerCase() === examType);
        const existingSum = examObj 
          ? questions.filter(q => q.exam === examObj.id).reduce((sum, q) => sum + (q.max_score || 0), 0) 
          : 0;
        const total = existingSum + importSums[examType];
        if (total > 100) {
          setImporting(false);
          e.target.value = '';
          return alert(
            `Aktarım iptal edildi: "${examType.toUpperCase()}" sınavı için toplam puan 100'ü geçiyor (Mevcut: ${existingSum} p, Yüklenecek: ${importSums[examType]} p, Toplam: ${total} p).`,
            'Hata',
            'error'
          );
        }
      }
      const currentCourseOutcomes = [...courseOutcomes];
      
      let created = 0, errors = 0;

      for (const row of rows) {
        const rawCode = String(row['Kod'] || row['code'] || '').trim();
        const rawText = String(row['Açıklama'] || row['description'] || '').trim();
        const rawExamType = String(row['Sınav'] || row['exam_type'] || 'Vize').trim(); // Vize, Final, etc.
        let rawType = String(row['Tür'] || row['type'] || 'Klasik').trim(); // Klasik, Çoktan Seçmeli, vb.
        const rawDcs = String(row['DÇ'] || row['dc_code'] || '').trim(); // DÇ1, DÇ2
        const rawMaxScore = parseInt(row['Puan'] || row['score']) || 10;
        const rawAnswer = String(row['Cevap'] || row['key'] || '').trim();

        if (!rawCode) {
          errors++;
          continue;
        }

        if (rawType === 'Doğru Yanlış') {
          rawType = 'Doğru/Yanlış';
        }

        // 1. Resolve or create Exam
        let examObj = currentExams.find(ex => ex.type.toLowerCase() === rawExamType.toLowerCase());
        if (!examObj) {
          try {
            examObj = await pb.collection('exams').create({
              course: activeCourse.id,
              type: rawExamType,
              name: rawExamType,
              date: ''
            });
            currentExams.push(examObj);
            setExams(prev => [...prev, examObj]);
          } catch (err) {
            console.error('Error creating exam from excel row:', err);
            errors++;
            continue;
          }
        }

        // 2. Resolve DÇs (Course Outcomes)
        const selectedDcIds = [];
        if (rawDcs) {
          const codes = rawDcs.split(',').map(c => c.trim().toUpperCase());
          codes.forEach(code => {
            const co = currentCourseOutcomes.find(o => o.code.toUpperCase() === code);
            if (co) {
              selectedDcIds.push(co.id);
            }
          });
        }

        // 3. Determine number based on Soru Kodu or index
        let number = parseInt(rawCode.replace(/\D/g, ''));
        if (isNaN(number)) {
          const examQuestions = questions.filter(q => q.exam === examObj.id);
          const maxNum = examQuestions.reduce((max, q) => Math.max(max, q.number || 0), 0);
          number = maxNum + 1;
        }

        // 4. Create question
        try {
          await pb.collection('questions').create({
            exam: examObj.id,
            number: number,
            code: rawCode,
            type: rawType,
            text: rawText,
            max_score: rawMaxScore,
            course_outcome: selectedDcIds,
            answer: rawAnswer
          });
          created++;
        } catch (err) {
          console.error('Error creating question from excel row:', err);
          errors++;
        }
      }
      
      const questionList = await pb.collection('questions').getFullList({
        filter: `exam.course = "${activeCourse.id}"`,
        sort: 'number',
        expand: 'exam,course_outcome'
      });
      setQuestions(questionList);
      resetQuestionForm(questionForm.exam || 'Vize', questionList);

      if (created > 0) {
        logAction({
          action: LOG_ACTIONS.IMPORT,
          category: LOG_CATEGORIES.EXAM,
          details: `Excel ile "${activeCourse?.code} - ${activeCourse?.name}" dersine ${created} soru toplu olarak yüklendi.`,
          metadata: { created, errors, course: activeCourse?.name }
        });
      }

      if (errors > 0) {
        await alert(`${errors} satırda hata oluştu. ${created} soru aktarıldı.`, 'Aktarımda Hatalar Var', 'warning');
      }
    } catch (err) {
      console.error('Error importing questions:', err);
      alert('Dosya okunurken bir hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const filteredQuestions = questions.filter(q => {
    if (activeFilter === 'Tümü') return true;
    const examObj = exams.find(e => e.id === q.exam) || q.expand?.exam;
    return examObj && examObj.type === activeFilter;
  });

  const getTypeBadgeColor = (type) => {
    switch (type) {
      case 'Klasik': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Çoktan Seçmeli': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Doğru/Yanlış': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Boşluk Doldurma': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Soru & Sınav Yönetimi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Sınav soruları girişi, DÇ-PÇ kazanım eşleştirmeleri ve sınav yönetimi</p>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm space-y-6">
        {/* Course Selection */}
        <div>
          <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders Seçin</label>
          <select 
            value={activeCourse?.id || ''} 
            onChange={e => selectCourse(e.target.value)} 
            className="w-full max-w-md border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium"
          >
            <option value="">Seçiniz</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
        </div>

        {activeCourse && (
          <>
            {/* Header Toolbar: Filter Tabs & Actions */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 pt-4 border-t border-outline-variant">
              {/* Exam Type Filter Pills */}
              <div className="flex flex-wrap gap-1.5 bg-slate-50 p-1 rounded-xl border border-outline-variant">
                {[
                  'Tümü', 'Vize', 'Final', 'Bütünleme', 'Ödev', 'Proje', 'Sunum', 'Uygulama',
                  ...((activeCourse?.custom_weights || []).map(cw => cw.name).filter(Boolean))
                ].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeFilter === filter
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-on-surface-variant hover:bg-white hover:text-on-surface'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Actions: Download template, import, Add Question */}
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileImport} className="hidden" />
                <button 
                  onClick={downloadTemplate} 
                  className="px-3 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-slate-50 flex items-center gap-1.5 active:scale-95 transition-all"
                  title="Excel Soru Giriş Şablonu İndir"
                >
                  <span className="material-symbols-outlined text-base">download</span> Şablon İndir
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={importing}
                  className="px-3 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-slate-50 flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                  title="Excel Şablonundan Soruları Yükle"
                >
                  <span className="material-symbols-outlined text-base">upload</span> {importing ? 'Yükleniyor...' : 'Şablondan Aktar'}
                </button>
                <button 
                  onClick={() => {
                    resetQuestionForm('Vize');
                    setShowQuestionModal(true);
                  }} 
                  className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-primary/15 hover:bg-primary-container active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">add</span> Soru Ekle
                </button>
              </div>
            </div>

            {/* Questions List (Table Layout) */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-outline-variant">
                <h3 className="text-title-md font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-lg text-primary">menu_book</span>
                  <span>Tanımlı Sorular ({filteredQuestions.length})</span>
                </h3>
              </div>

              {filteredQuestions.length > 0 ? (
                <div className="bg-white rounded-xl border border-outline-variant overflow-x-auto shadow-sm max-h-[75vh] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant sticky top-0 z-10">
                        <th className="px-4 py-3 font-semibold">Kod</th>
                        <th className="px-4 py-3 font-semibold">Sınav</th>
                        <th className="px-4 py-3 font-semibold">Tür</th>
                        <th className="px-4 py-3 font-semibold">Soru Metni</th>
                        <th className="px-4 py-3 font-semibold">DÇ</th>
                        <th className="px-4 py-3 font-semibold">İlişkili PÇ'ler</th>
                        <th className="px-4 py-3 font-semibold">Puan</th>
                        <th className="px-4 py-3 font-semibold">Cevap</th>
                        <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {filteredQuestions.map((q) => {
                        const outcomes = Array.isArray(q.course_outcome)
                          ? q.course_outcome.map(id => courseOutcomes.find(o => o.id === id)).filter(Boolean)
                          : q.course_outcome
                            ? [courseOutcomes.find(o => o.id === q.course_outcome)].filter(Boolean)
                            : [];
                        const examObj = exams.find(e => e.id === q.exam) || q.expand?.exam;
                        const relatedPcs = getRelatedPcsForDcs(outcomes.map(o => o.id));

                        return (
                          <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                            {/* Kod */}
                            <td className="px-4 py-2.5 font-mono text-xs font-bold text-on-surface align-middle">
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded">
                                {q.code || `S${q.number}`}
                              </span>
                            </td>
                            {/* Sınav */}
                            <td className="px-4 py-2.5 text-xs text-on-surface-variant font-medium align-middle">
                              {examObj ? examObj.type : '—'}
                            </td>
                            {/* Tür */}
                            <td className="px-4 py-2.5 align-middle">
                              <span className={`px-2 py-0.5 border rounded text-[10px] font-bold ${getTypeBadgeColor(q.type || 'Klasik')}`}>
                                {q.type || 'Klasik'}
                              </span>
                            </td>
                            {/* Soru Metni */}
                            <td className="px-4 py-2.5 text-xs text-on-surface font-medium max-w-xs truncate align-middle" title={q.text}>
                              {q.text || <span className="text-on-surface-variant italic">Metin yok</span>}
                            </td>
                            {/* DÇ */}
                            <td className="px-4 py-2.5 align-middle">
                              <div className="flex flex-wrap gap-1 max-w-[120px]">
                                {outcomes.map(o => (
                                  <span key={o.id} className="bg-slate-100 text-slate-700 border border-slate-200 px-1 py-0.5 rounded text-[10px] font-bold" title={o.description}>
                                    {o.code}
                                  </span>
                                ))}
                                {outcomes.length === 0 && <span className="text-[10px] text-on-surface-variant italic">—</span>}
                              </div>
                            </td>
                            {/* İlişkili PÇ'ler */}
                            <td className="px-4 py-2.5 align-middle">
                              <div className="flex flex-wrap gap-1 max-w-[120px]">
                                {relatedPcs.map(pc => (
                                  <span key={pc.code} className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60" title={`Seviye: ${pc.level}`}>
                                    {pc.code}
                                  </span>
                                ))}
                                {relatedPcs.length === 0 && <span className="text-[10px] text-on-surface-variant italic">—</span>}
                              </div>
                            </td>
                            {/* Puan */}
                            <td className="px-4 py-2.5 align-middle">
                              <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded whitespace-nowrap">
                                {q.max_score} p
                              </span>
                            </td>
                            {/* Cevap */}
                            <td className="px-4 py-2.5 text-xs text-on-surface-variant max-w-[150px] truncate font-mono align-middle" title={q.answer}>
                              {q.answer || '—'}
                            </td>
                            {/* İşlemler */}
                            <td className="px-4 py-2.5 text-right align-middle">
                              <div className="flex justify-end items-center gap-1">
                                <button 
                                  onClick={() => handleEditQuestion(q)} 
                                  className="p-1 hover:bg-primary/10 text-primary rounded transition-all" 
                                  title="Düzenle"
                                >
                                  <span className="material-symbols-outlined text-lg">edit</span>
                                </button>
                                <button 
                                  onClick={() => handleDeleteQuestion(q.id)} 
                                  className="p-1 hover:bg-error/10 text-error rounded transition-all" 
                                  title="Sil"
                                >
                                  <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant rounded-xl bg-slate-50/50">
                  <span className="material-symbols-outlined text-4xl text-outline mb-2">quiz</span>
                  <p className="text-sm font-semibold">Bu filtrelere uygun soru bulunamadı.</p>
                  <p className="text-xs text-on-surface-variant mt-1">Soru Ekle butonunu kullanarak yeni bir soru ekleyebilirsiniz.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Soru Ekle / Düzenle Modalı */}
      {showQuestionModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowQuestionModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="text-headline-md font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary">
                  {questionForm.id ? 'edit_note' : 'add_circle'}
                </span>
                <span>{questionForm.id ? 'Soruyu Düzenle' : 'Yeni Soru Ekle'}</span>
              </h3>
              <button onClick={() => setShowQuestionModal(false)} className="p-1 hover:bg-slate-200 rounded-full transition-all flex items-center justify-center">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="p-6 space-y-4">
              {/* Sınav Seçimi (Tür olarak) */}
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Sınav Seçimi</label>
                <select 
                  value={questionForm.exam} 
                  onChange={e => handleExamChange(e.target.value)} 
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white font-medium"
                  required
                >
                  <option value="">Seçiniz</option>
                  <option value="Vize">Vize</option>
                  <option value="Final">Final</option>
                  <option value="Bütünleme">Bütünleme</option>
                  <option value="Ödev">Ödev</option>
                  <option value="Proje">Proje</option>
                  <option value="Sunum">Sunum</option>
                  <option value="Uygulama">Uygulama</option>
                  {(activeCourse?.custom_weights || []).map((cw, idx) => (
                    cw.name ? <option key={`custom-${idx}`} value={cw.name}>{cw.name}</option> : null
                  ))}
                </select>
              </div>

              {/* Soru Kodu & Puan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Soru Kodu</label>
                  <input 
                    type="text" 
                    value={questionForm.code} 
                    onChange={e => setQuestionForm({ ...questionForm, code: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white font-semibold font-mono" 
                    placeholder="Örn: S1"
                    required
                  />
                </div>
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Soru Puanı</label>
                  <input 
                    type="number" 
                    value={questionForm.max_score} 
                    onChange={e => setQuestionForm({ ...questionForm, max_score: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white" 
                    placeholder="Örn: 10" 
                    min="1"
                    required
                  />
                </div>
              </div>

              {/* Tür & Soru Sırası */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Tür</label>
                  <select 
                    value={questionForm.type} 
                    onChange={e => {
                      const newType = e.target.value;
                      let newAnswer = questionForm.answer;
                      if (newType === 'Çoktan Seçmeli' && !['A', 'B', 'C', 'D', 'E'].includes(newAnswer)) {
                        newAnswer = 'A';
                      } else if (newType === 'Doğru/Yanlış' && !['Doğru', 'Yanlış'].includes(newAnswer)) {
                        newAnswer = 'Doğru';
                      }
                      setQuestionForm({ ...questionForm, type: newType, answer: newAnswer });
                    }} 
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="Klasik">Klasik</option>
                    <option value="Çoktan Seçmeli">Çoktan Seçmeli</option>
                    <option value="Doğru/Yanlış">Doğru/Yanlış</option>
                    <option value="Boşluk Doldurma">Boşluk Doldurma</option>
                  </select>
                </div>
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Soru Sırası (No)</label>
                  <input 
                    type="number" 
                    value={questionForm.number} 
                    onChange={e => setQuestionForm({ ...questionForm, number: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white" 
                    min="1"
                  />
                </div>
              </div>

              {/* Ders Çıktıları (Checklist) */}
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Ders Çıktıları (DÇ)</label>
                <div className="bg-white border border-outline-variant rounded-lg p-3 space-y-2 max-h-[140px] overflow-y-auto">
                  {courseOutcomes.map(o => {
                    const isChecked = Array.isArray(questionForm.course_outcome) 
                      ? questionForm.course_outcome.includes(o.id)
                      : false;

                    return (
                      <label key={o.id} className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => handleDcCheckboxChange(o.id, e.target.checked)}
                          className="mt-1 rounded border-outline-variant text-primary focus:ring-primary focus:ring-opacity-25"
                        />
                        <div>
                          <span className="font-bold text-primary mr-1.5">{o.code}</span>
                          <span className="text-on-surface-variant text-xs">{o.description}</span>
                        </div>
                      </label>
                    );
                  })}
                  {courseOutcomes.length === 0 && (
                    <p className="text-xs text-on-surface-variant italic">Bu ders için tanımlı DÇ bulunmuyor.</p>
                  )}
                </div>
              </div>

              {/* İlişkili PÇ'ler (Dinamik) */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block mb-1">İlişkili PÇ'ler</label>
                <div className="bg-white border border-outline-variant/60 rounded-lg p-2.5 min-h-[42px] flex flex-wrap gap-1.5 items-center">
                  {questionForm.course_outcome && questionForm.course_outcome.length > 0 ? (
                    (() => {
                      const related = getRelatedPcsForDcs(questionForm.course_outcome);
                      if (related.length === 0) {
                        return <span className="text-xs text-on-surface-variant italic">Seçilen DÇ'ler için matris ilişkisi bulunamadı.</span>;
                      }
                      return related.map(pc => (
                        <span key={pc.code} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title={`İlişki Seviyesi: ${pc.level}`}>
                          {pc.code} <span className="ml-1 opacity-60">({pc.level})</span>
                        </span>
                      ));
                    })()
                  ) : (
                    <span className="text-xs text-on-surface-variant italic">İlişkili PÇ'leri görmek için önce DÇ seçmelisiniz.</span>
                  )}
                </div>
              </div>

              {/* Soru Metni */}
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1">Soru Metni</label>
                <textarea 
                  value={questionForm.text} 
                  onChange={e => setQuestionForm({ ...questionForm, text: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white" 
                  rows={2.5} 
                  placeholder="Örn: 2x + 5 = 15 ise x kaçtır?"
                />
              </div>

              {/* Cevap Anahtarı */}
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Cevap Anahtarı</label>
                {questionForm.type === 'Çoktan Seçmeli' ? (
                  <div className="flex gap-2">
                    {['A', 'B', 'C', 'D', 'E'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQuestionForm({ ...questionForm, answer: opt })}
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                          questionForm.answer === opt
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white text-on-surface border-outline-variant hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : questionForm.type === 'Doğru/Yanlış' ? (
                  <div className="flex gap-3">
                    {['Doğru', 'Yanlış'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQuestionForm({ ...questionForm, answer: opt })}
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                          questionForm.answer === opt
                            ? opt === 'Doğru'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-error text-white border-error shadow-sm'
                            : 'bg-white text-on-surface border-outline-variant hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea 
                    value={questionForm.answer} 
                    onChange={e => setQuestionForm({ ...questionForm, answer: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white font-mono" 
                    rows={2} 
                    placeholder={questionForm.type === 'Boşluk Doldurma' ? "Örn: yapay zeka, makine öğrenmesi" : "Örn: x = 5"}
                  />
                )}
              </div>

              {/* Form Actions */}
              <div className="flex gap-2 justify-end pt-2 border-t border-outline-variant/60">
                <button 
                  type="button"
                  onClick={() => setShowQuestionModal(false)} 
                  className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold hover:bg-slate-100 transition-all"
                >
                  İptal
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-md shadow-primary/15 hover:bg-primary-container transition-all"
                >
                  {questionForm.id ? 'Güncelle' : 'Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
