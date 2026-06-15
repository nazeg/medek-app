import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { useActiveCourse } from '../../contexts/CourseContext';

export default function Grades() {
  const { alert, confirm } = useAlertConfirm();
  const { user } = useAuth();
  const { activeCourse, selectCourse, courses } = useActiveCourse();
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [questions, setQuestions] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirtyGrades, setDirtyGrades] = useState(new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    pb.collection('students').getFullList({ sort: 'number' }).then(setStudents);
  }, []);

  useEffect(() => {
    if (!activeCourse?.id) {
      setExams([]);
      setSelectedExam('');
      return;
    }
    pb.collection('exams').getFullList({ filter: `course = "${activeCourse.id}"`, sort: 'type' }).then(e => {
      setExams(e);
      setSelectedExam('');
    });
  }, [activeCourse]);

  useEffect(() => {
    if (!selectedExam) { setQuestions([]); return; }
    pb.collection('questions').getFullList({ filter: `exam = "${selectedExam}"`, sort: 'number' }).then(q => {
      setQuestions(q);
    });
    pb.collection('student_grades').getFullList({ filter: `exam = "${selectedExam}"` }).then(g => {
      const map = {};
      g.forEach(gr => { map[`${gr.student}_${gr.question}`] = gr.score; });
      setGrades(map);
      setDirtyGrades(new Set());
    });
  }, [selectedExam]);

  const setGrade = (studentId, questionId, score) => {
    const key = `${studentId}_${questionId}`;
    setGrades(prev => ({ ...prev, [key]: score }));
    setDirtyGrades(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const saveGrades = async () => {
    if (dirtyGrades.size === 0) {
      alert('Kaydedilecek değişiklik bulunmamaktadır.', 'Bilgi', 'info');
      return;
    }

    setSaving(true);
    try {
      const dirtyKeys = Array.from(dirtyGrades);
      const batchSize = 30;
      
      for (let i = 0; i < dirtyKeys.length; i += batchSize) {
        const chunk = dirtyKeys.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (key) => {
          const score = grades[key];
          const [student, question] = key.split('_');
          try {
            const existing = await pb.collection('student_grades').getFirstListItem(`exam = "${selectedExam}" && student = "${student}" && question = "${question}"`);
            await pb.collection('student_grades').update(existing.id, { score: parseInt(score) || 0 });
          } catch {
            await pb.collection('student_grades').create({ exam: selectedExam, student, question, score: parseInt(score) || 0 });
          }
        }));
      }

      setDirtyGrades(new Set());
      alert('Notlar başarıyla kaydedildi.', 'Başarılı', 'success');
    } catch (err) {
      console.error('Error saving grades:', err);
      alert('Notlar kaydedilirken bir hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (await confirm(`"${studentName}" isimli öğrenciyi sistemden silmek istediğinize emin misiniz? Bu işlem öğrenciye ait tüm notları da silecektir.`)) {
      try {
        await pb.collection('students').delete(studentId);
        setStudents(prev => prev.filter(s => s.id !== studentId));
      } catch (err) {
        console.error('Error deleting student:', err);
        alert('Öğrenci silinirken bir hata oluştu: ' + err.message, 'Hata', 'error');
      }
    }
  };

  const totalScore = (studentId) => {
    return questions.reduce((sum, q) => {
      const val = grades[`${studentId}_${q.id}`];
      if (val === undefined || val === '') return sum;
      if (q.type === 'Çoktan Seçmeli') {
        const optionMap = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
        const chosen = optionMap[val];
        const correct = (q.answer || 'A').toUpperCase();
        return sum + (chosen === correct ? q.max_score : 0);
      }
      return sum + (parseInt(val) || 0);
    }, 0);
  };

  const downloadTemplate = async () => {
    if (!selectedExam) return alert('Lütfen önce bir sınav seçiniz.', 'Hata', 'error');
    const examObj = exams.find(e => e.id === selectedExam);
    const examName = examObj ? examObj.type : 'Sınav';
    
    // Workbook and Worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${examName} Notları`);

    worksheet.views = [{ showGridLines: true }];

    // Columns
    const columns = [
      { header: 'Öğrenci No', key: 'number', width: 15 },
      { header: 'Ad Soyad', key: 'name', width: 25 }
    ];

    questions.forEach(q => {
      const qCode = q.code || `S${q.number}`;
      columns.push({
        header: `${qCode} (Max: ${q.max_score}p)`,
        key: q.id,
        width: 15
      });
    });

    worksheet.columns = columns;

    // Headings Style
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    for (let c = 1; c <= columns.length; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A2A3A' }
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
      cell.protection = { locked: true };
    }

    // Add Student Rows
    students.forEach((student, index) => {
      const rowData = {
        number: student.number,
        name: student.name
      };
      
      // Populate existing grades if any
      questions.forEach(q => {
        const score = grades[`${student.id}_${q.id}`];
        if (score === undefined || score === '') {
          rowData[q.id] = '';
        } else if (q.type === 'Çoktan Seçmeli') {
          const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
          rowData[q.id] = optionLetters[score] || '';
        } else if (q.type === 'Doğru/Yanlış') {
          rowData[q.id] = parseInt(score) === q.max_score ? (q.answer || 'Doğru') : '—';
        } else {
          rowData[q.id] = score;
        }
      });

      const row = worksheet.addRow(rowData);
      row.height = 20;

      const isZebra = (index % 2 === 0);
      const bgColor = isZebra ? 'FFF8F9FA' : 'FFFFFFFF';

      // Column 1 & 2: Student Number and Name (Locked)
      for (let c = 1; c <= 2; c++) {
        const cell = row.getCell(c);
        cell.protection = { locked: true };
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      }

      // Columns 3+: Question Grades (Unlocked)
      for (let c = 3; c <= columns.length; c++) {
        const cell = row.getCell(c);
        cell.protection = { locked: false };
        cell.font = { name: 'Segoe UI', size: 10, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      }
    });

    // Protect Sheet
    await worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: true,
      autoFilter: true,
      pivotTables: false
    });

    // Write file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeCourse.code}_${examName}_Not_Sablonu.xlsx`;
    link.click();
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedExam) return;
    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const updatedGrades = { ...grades };
      const newDirty = new Set(dirtyGrades);
      let updatedCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        // Read Student Number
        const rawNo = String(row['Öğrenci No'] || row['Student No'] || row['no'] || '').trim();
        if (!rawNo) continue;

        const student = students.find(s => s.number === rawNo);
        if (!student) {
          errorCount++;
          continue;
        }

        // For each key in the row, check if it matches a question
        Object.keys(row).forEach(key => {
          if (key === 'Öğrenci No' || key === 'Ad Soyad' || key === 'Student No' || key === 'no' || key === 'name') return;
          
          // Extract question code from header (e.g. "S1 (Max: 10p)" -> "S1")
          const match = key.match(/^([A-Za-z0-9_-]+)/);
          const qCode = match ? match[1] : key;

          const question = questions.find(q => (q.code || `S${q.number}`).toLowerCase() === qCode.toLowerCase());
          if (question) {
            const rawVal = row[key];
            const rawValStr = String(rawVal !== undefined && rawVal !== null ? rawVal : '').trim();
            if (rawValStr !== '') {
              let score = 0;
              if (question.type === 'Çoktan Seçmeli') {
                const letter = rawValStr.toUpperCase();
                const scoreMap = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };
                if (scoreMap[letter] !== undefined) {
                  score = scoreMap[letter];
                } else {
                  score = Math.min(Math.max(parseInt(rawValStr) || 0, 0), 5);
                }
              } else if (question.type === 'Doğru/Yanlış') {
                const cleanVal = rawValStr.toLowerCase();
                const correctAns = (question.answer || 'Doğru').toLowerCase();
                let studentAns = '';
                if (cleanVal === 'doğru' || cleanVal === 'd') studentAns = 'doğru';
                if (cleanVal === 'yanlış' || cleanVal === 'y') studentAns = 'yanlış';
                
                if (studentAns) {
                  score = studentAns === correctAns ? question.max_score : 0;
                } else {
                  score = Math.min(Math.max(parseInt(rawValStr) || 0, 0), question.max_score);
                }
              } else {
                score = Math.min(Math.max(parseInt(rawValStr) || 0, 0), question.max_score);
              }
              const gradeKey = `${student.id}_${question.id}`;
              updatedGrades[gradeKey] = score;
              newDirty.add(gradeKey);
              updatedCount++;
            }
          }
        });
      }

      setGrades(updatedGrades);
      setDirtyGrades(newDirty);
      if (errorCount > 0) {
        alert(`${errorCount} öğrenci sistemde bulunamadığı için atlandı. ${updatedCount} not yükleme önbelleğine alındı. Kaydetmek için 'Notları Kaydet' butonuna basınız.`, 'Aktarım Tamamlandı', 'warning');
      } else {
        alert(`${updatedCount} not başarıyla yüklendi. Kaydetmek için 'Notları Kaydet' butonuna basınız.`, 'Başarılı', 'success');
      }
    } catch (err) {
      console.error('Error importing grades:', err);
      alert('Dosya okunurken bir hata oluştu: ' + err.message, 'Hata', 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Not Girişi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Öğrenci bazlı not girişi</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto flex-1">
            <div className="flex-1 max-w-xs">
              <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders Seçin</label>
              <select value={activeCourse?.id || ''} onChange={e => selectCourse(e.target.value)} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium">
                <option value="">Seçiniz</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
            <div className="flex-1 max-w-xs">
              <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Sınav Seçin</label>
              <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium" disabled={!activeCourse}>
                <option value="">Seçiniz</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.type}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            {selectedExam && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileImport} className="hidden" />
                <button
                  onClick={downloadTemplate}
                  className="px-3 py-2.5 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-slate-50 flex items-center gap-1.5 active:scale-95 transition-all"
                  title="Excel Not Giriş Şablonu İndir"
                >
                  <span className="material-symbols-outlined text-base">download</span> Şablon İndir
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-3 py-2.5 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-slate-50 flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                  title="Excel Şablonundan Notları Yükle"
                >
                  <span className="material-symbols-outlined text-base">upload</span> {importing ? 'Yükleniyor...' : 'Şablondan Aktar'}
                </button>
                <button
                  onClick={saveGrades}
                  disabled={saving}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-primary/15 hover:bg-primary-container active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">{saving ? 'hourglass_empty' : 'save'}</span> 
                  {saving ? 'Kaydediliyor...' : 'Notları Kaydet'}
                </button>
              </>
            )}
          </div>
        </div>
        {activeCourse && (
          <>
            {selectedExam && questions.length > 0 && (
              <div className="overflow-x-auto border border-outline-variant rounded-lg">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant font-bold uppercase text-[10px] tracking-wider">
                      <th className="px-4 py-3 border-b border-outline-variant">Öğrenci No</th>
                      <th className="px-4 py-3 border-b border-outline-variant">Ad Soyad</th>
                      {questions.map((q, i) => (
                        <th key={q.id} className="px-3 py-3 text-center border-b border-outline-variant">
                          {q.code || `S${q.number}`}<br/><span className="text-[9px] font-normal">{(Array.isArray(q.course_outcome) ? q.course_outcome.length > 0 : !!q.course_outcome) ? 'DÇ' : ''}</span>
                          <span className="block text-[9px] font-normal">({q.max_score}p)</span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right border-b border-outline-variant">Toplam</th>
                      <th className="px-4 py-3 text-center border-b border-outline-variant w-16">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {students.map(student => (
                      <tr key={student.id} className="hover:bg-surface-container-low/50">
                        <td className="px-4 py-3 text-on-surface-variant font-mono">{student.number}</td>
                        <td className="px-4 py-3 font-bold">{student.name}</td>
                         {questions.map(q => {
                           const valKey = `${student.id}_${q.id}`;
                           const currentScore = grades[valKey] !== undefined ? grades[valKey] : '';

                            if (q.type === 'Çoktan Seçmeli') {
                              const optionLetters = ['', 'A', 'B', 'C', 'D', 'E'];
                              const selectedLetter = optionLetters[currentScore] || '';
                              return (
                                <td key={q.id} className="px-0.5 py-1 text-center">
                                  <select
                                    value={selectedLetter}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const scoreMap = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, '': 0 };
                                      setGrade(student.id, q.id, scoreMap[val] || 0);
                                    }}
                                    className="w-10 h-7 mx-auto block text-center text-xs bg-white bg-none font-semibold cursor-pointer appearance-none border-0 outline-none p-0"
                                    style={{ backgroundImage: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                                  >
                                    <option value="">—</option>
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                    <option value="E">E</option>
                                  </select>
                                </td >
                              );
                            } else if (q.type === 'Doğru/Yanlış') {
                              return (
                                <td key={q.id} className="px-0.5 py-1 text-center">
                                  <select
                                    value={currentScore === q.max_score ? (q.answer || 'Doğru') : ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        setGrade(student.id, q.id, 0);
                                      } else if (val === (q.answer || 'Doğru')) {
                                        setGrade(student.id, q.id, q.max_score);
                                      } else {
                                        setGrade(student.id, q.id, 0);
                                      }
                                    }}
                                    className="w-12 h-7 mx-auto block text-center text-xs bg-white bg-none font-semibold cursor-pointer appearance-none border-0 outline-none p-0"
                                    style={{ backgroundImage: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                                  >
                                    <option value="">—</option>
                                    <option value="Doğru">Doğru</option>
                                    <option value="Yanlış">Yanlış</option>
                                  </select>
                                </td>
                              );
                            } else {
                              return (
                                <td key={q.id} className="px-0.5 py-1 text-center">
                                  <input
                                    type="number"
                                    max={q.max_score}
                                    min="0"
                                    value={currentScore}
                                    onChange={e => { const v = e.target.value; setGrade(student.id, q.id, v === '' ? '' : Math.min(Math.max(parseInt(v) || 0, 0), q.max_score)); }}
                                    className="w-10 h-7 mx-auto block text-center text-xs bg-white border-0 outline-none p-0"
                                  />
                                </td>
                              );
                           }
                         })}
                        <td className="px-4 py-3 text-right font-extrabold text-primary">{totalScore(student.id)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                            className="p-1 hover:bg-error/10 text-error rounded transition-all inline-flex items-center justify-center active:scale-95"
                            title="Öğrenciyi Sil"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selectedExam && questions.length === 0 && (
              <p className="text-center py-8 text-on-surface-variant">Bu sınava ait soru bulunamadı. Önce soruları tanımlayın.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
