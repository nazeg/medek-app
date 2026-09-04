import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useTerm } from '../../contexts/TermContext';
import { useActiveCourse } from '../../contexts/CourseContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function CoordinatorCourseOutcomes() {
  const location = useLocation();
  const isInstructorView = location.pathname.startsWith('/instructor');
  const { user: coordinatorUser } = useAuth();
  const { activeProgram } = useProgram();
  const { activeTerm } = useTerm();
  const { activeCourse, selectCourse, courses: instructorCourses } = useActiveCourse();
  const { confirm } = useAlertConfirm();
  const [outcomes, setOutcomes] = useState([]);
  const [programOutcomes, setProgramOutcomes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ 
    code: '', 
    description: '', 
    course: '', 
    min_threshold: 50, 
    target_goal: 70, 
    evidence: '' 
  });

  useEffect(() => {
    setSelectedCourseId('');
  }, [activeProgram, activeTerm]);

  const getInstructorName = (course) => {
    const inst = course?.expand?.instructor;
    if (!inst) return null;
    if (Array.isArray(inst)) {
      if (inst.length === 0) return null;
      return inst.map(i => i.title ? `${i.title} ${i.name}` : i.name).join(', ');
    }
    return inst.title ? `${inst.title} ${inst.name}` : inst.name;
  };

  const load = async () => {
    const hasAccess = isInstructorView 
      ? (coordinatorUser && activeCourse) 
      : (coordinatorUser && activeProgram && activeTerm);
    if (!hasAccess) {
      setOutcomes([]);
      setProgramOutcomes([]);
      setCourses([]);
      return;
    }
    try {
      if (isInstructorView) {
        const [o, po] = await Promise.all([
          pb.collection('course_outcomes').getFullList({ 
            sort: 'code', 
            filter: `course = "${activeCourse.id}"`,
            expand: 'course' 
          }),
          activeCourse.program ? pb.collection('program_outcomes').getFullList({
            sort: 'code',
            filter: `program = "${activeCourse.program}"`
          }) : Promise.resolve([])
        ]);
        o.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        po.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        setOutcomes(o);
        setProgramOutcomes(po);
        setCourses([activeCourse]);
      } else {
        const [o, c, po] = await Promise.all([
          pb.collection('course_outcomes').getFullList({ 
            sort: 'code', 
            filter: `course.program = "${activeProgram.id}" && course.term = "${activeTerm.id}"`,
            expand: 'course' 
          }),
          pb.collection('courses').getFullList({ 
            sort: 'code', 
            filter: `program = "${activeProgram.id}" && term = "${activeTerm.id}"`,
            expand: 'instructor'
          }),
          pb.collection('program_outcomes').getFullList({
            sort: 'code',
            filter: `program = "${activeProgram.id}"`
          })
        ]);
        o.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        c.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        po.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        setOutcomes(o);
        setCourses(c);
        setProgramOutcomes(po);
      }
    } catch (err) {
      console.error('Error loading course and program outcomes:', err);
    }
  };

  useEffect(() => { load(); }, [coordinatorUser, activeProgram, activeTerm, activeCourse, isInstructorView]);

  const handleSave = async () => {
    const courseId = isInstructorView ? activeCourse.id : form.course;
    const targetCourse = courses.find(c => c.id === courseId) || activeCourse;
    
    if (!form.code.trim()) {
      alert('Lütfen DÇ kodunu giriniz.', 'Eksik Bilgi', 'warning');
      return;
    }
    if (!courseId) {
      alert('Lütfen bir ders seçiniz.', 'Eksik Bilgi', 'warning');
      return;
    }

    const data = { 
      code: form.code.trim(),
      description: form.description.trim(),
      course: courseId,
      min_threshold: form.min_threshold !== '' ? Number(form.min_threshold) : 50,
      target_goal: form.target_goal !== '' ? Number(form.target_goal) : 70,
      evidence: (form.evidence || '').trim()
    };

    try {
      if (editItem) {
        await pb.collection('course_outcomes').update(editItem.id, data);
        logAction({
          action: LOG_ACTIONS.UPDATE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${form.code}" ders çıktısı güncellendi. Alt Sınır: %${data.min_threshold}, Hedef: %${data.target_goal}. Ders: ${targetCourse ? targetCourse.code + ' - ' + targetCourse.name : '—'}`,
          metadata: { outcomeId: editItem.id, ...data }
        });
      } else {
        const res = await pb.collection('course_outcomes').create(data);
        logAction({
          action: LOG_ACTIONS.CREATE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${form.code}" adlı yeni ders çıktısı eklendi. Alt Sınır: %${data.min_threshold}, Hedef: %${data.target_goal}. Ders: ${targetCourse ? targetCourse.code + ' - ' + targetCourse.name : '—'}`,
          metadata: { outcomeId: res.id, ...data }
        });
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ code: '', description: '', course: '', min_threshold: 50, target_goal: 70, evidence: '' });
      load();
    } catch (err) {
      alert('DÇ kaydedilirken hata oluştu: ' + (err.message || JSON.stringify(err)), 'Hata', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ 
      code: item.code || '', 
      description: item.description || '', 
      course: item.course || '',
      min_threshold: item.min_threshold ?? 50,
      target_goal: item.target_goal ?? 70,
      evidence: item.evidence || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const target = outcomes.find(o => o.id === id);
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      try {
        await pb.collection('course_outcomes').delete(id);
        logAction({
          action: LOG_ACTIONS.DELETE,
          category: LOG_CATEGORIES.OUTCOMES,
          details: `"${target?.code || id}" ders çıktısı silindi. Ders: ${target?.expand?.course?.name || '—'}`,
          metadata: { outcomeId: id, code: target?.code }
        });
        load();
      } catch (err) {
        alert('DÇ silinemedi. Lütfen önce bu çıktıya bağlı soruları ve matris ilişkilerini kontrol edin.', 'Hata', 'error');
      }
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-headline-lg text-on-surface">Ders Çıktıları (DÇ)</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">
            Ders kazanımlarını, alt sınırlarını, başarı hedeflerini ve kanıt kararlarını tanımlayın
          </p>
        </div>
        {((!isInstructorView && activeProgram && activeTerm) || (isInstructorView && activeCourse)) && (
          <button 
            onClick={() => { 
              setEditItem(null); 
              setForm({ 
                code: '', 
                description: '', 
                course: isInstructorView ? activeCourse.id : (selectedCourseId || ''),
                min_threshold: 50,
                target_goal: 70,
                evidence: ''
              }); 
              setShowModal(true); 
            }} 
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">add</span> DÇ Ekle
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        {isInstructorView && (
          <div className="p-4 bg-slate-50 border-b border-outline-variant">
            <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Ders Seçin</label>
            <select value={activeCourse?.id || ''} onChange={e => selectCourse(e.target.value)} className="w-full max-w-md border border-outline-variant rounded-lg px-4 py-2 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium">
              <option value="">Seçiniz</option>
              {instructorCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name} {c.sinif ? `(${c.sinif}. Sınıf)` : ''} {c.sube ? `(Şube: ${c.sube})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isInstructorView && !activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {!isInstructorView && activeProgram && !activeTerm && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir dönem seçiniz.</div>
        )}
        {isInstructorView && !activeCourse && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen bir ders seçiniz.</div>
        )}
        {((!isInstructorView && activeProgram && activeTerm) || (isInstructorView && activeCourse)) && (
          <>
            {!isInstructorView && (
              <div className="p-4 bg-slate-50 border-b border-outline-variant">
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Ders Filtrele</label>
                <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full max-w-md border border-outline-variant rounded-lg px-4 py-2 text-sm focus:ring-0 focus:ring-transparent bg-white font-medium">
                  <option value="">Tümü</option>
                  {courses.map(c => {
                    const instName = getInstructorName(c);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name} {c.sinif ? `(${c.sinif}. Sınıf)` : ''} {c.sube ? `(Şube: ${c.sube})` : ''} {instName ? `— ${instName}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <div className="p-4 space-y-6 bg-slate-50/30">
              {(selectedCourseId ? courses.filter(c => c.id === selectedCourseId) : courses).map(course => {
                const courseOutcomes = outcomes.filter(o => o.course === course.id);
                const instructorName = getInstructorName(course);

                return (
                  <div key={course.id} className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-outline-variant flex flex-wrap justify-between items-center gap-3">
                      <div className="flex flex-wrap items-center gap-2 font-bold text-slate-800 text-sm">
                        <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">auto_stories</span>
                        <span>{course.code} - {course.name}</span>
                        {course.sinif && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-200/80 text-slate-700 border border-slate-300/60">
                            {course.sinif}. Sınıf
                          </span>
                        )}
                        {course.sube && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200/80">
                            Şube: {course.sube}
                          </span>
                        )}
                        {instructorName && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                            <span className="material-symbols-outlined text-sm">person</span>
                            <span>{instructorName}</span>
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => { 
                          setEditItem(null); 
                          setForm({ 
                            code: '', 
                            description: '', 
                            course: course.id,
                            min_threshold: 50,
                            target_goal: 70,
                            evidence: ''
                          }); 
                          setShowModal(true); 
                        }} 
                        className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                      >
                        <span className="material-symbols-outlined text-xs">add</span> DÇ Ekle
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant">
                            <th className="px-4 py-2.5 font-semibold w-20">Kod</th>
                            <th className="px-4 py-2.5 font-semibold min-w-[260px]">Açıklama</th>
                            <th className="px-4 py-2.5 font-semibold text-center w-28">Alt Sınır</th>
                            <th className="px-4 py-2.5 font-semibold text-center w-28">Başarı Hedefi</th>
                            <th className="px-4 py-2.5 font-semibold w-48">Kanıt / Karar</th>
                            <th className="px-4 py-2.5 font-semibold text-right w-24">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant">
                          {courseOutcomes.map(o => (
                            <tr key={o.id} className="hover:bg-surface-container-low transition-colors group">
                              <td className="px-4 py-2.5 font-bold text-primary text-sm whitespace-nowrap">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">
                                  {o.code}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-on-surface">
                                {o.description || '—'}
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  %{o.min_threshold ?? 50}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  %{o.target_goal ?? 70}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
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
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => handleEdit(o)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant transition-colors cursor-pointer" title="Düzenle">
                                    <span className="material-symbols-outlined text-lg">edit</span>
                                  </button>
                                  <button onClick={() => handleDelete(o.id)} className="p-1 hover:bg-surface-container rounded text-error transition-colors cursor-pointer" title="Sil">
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {courseOutcomes.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-red-700 text-xs font-semibold">
                                Bu derse ait tanımlanmış DÇ bulunmamaktadır.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {(selectedCourseId ? courses.filter(c => c.id === selectedCourseId) : courses).length === 0 && (
                <div className="text-center py-8 text-on-surface-variant text-sm">Ders bulunamadı.</div>
              )}

              {/* Program Outcomes (PÇ) - Read-only reference for Instructors with Thresholds & Evidence */}
              {isInstructorView && activeCourse && (
                <div className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm mt-6">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-outline-variant flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-primary text-xl">fact_check</span>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          Program Çıktıları (PÇ) {activeCourse.expand?.program?.name ? `— ${activeCourse.expand.program.name}` : ''}
                        </h4>
                        <p className="text-[11px] text-on-surface-variant">Bölüm başkanlığı tarafından tanımlanan program hedefleri ve kanıt kararları (Bilgilendirme Amaçlı)</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                      <span className="material-symbols-outlined text-xs text-slate-500">lock</span>
                      Salt Okunur ({programOutcomes.length} PÇ)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 text-on-surface-variant text-[11px] font-semibold uppercase border-b border-outline-variant">
                          <th className="px-4 py-2.5 font-semibold w-20">PÇ Kodu</th>
                          <th className="px-4 py-2.5 font-semibold min-w-[260px]">Kazanım / Program Çıktısı Açıklaması</th>
                          <th className="px-4 py-2.5 font-semibold text-center w-28">Alt Sınır</th>
                          <th className="px-4 py-2.5 font-semibold text-center w-28">Başarı Hedefi</th>
                          <th className="px-4 py-2.5 font-semibold w-48">Kanıt / Karar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {programOutcomes.map(po => (
                          <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 font-bold text-primary text-sm whitespace-nowrap align-top">
                              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                                {po.code}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-on-surface leading-relaxed">
                              {po.description || '—'}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap align-top">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                %{po.min_threshold ?? 50}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap align-top">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                %{po.target_goal ?? 70}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {po.evidence ? (
                                <div className="relative group/tooltip inline-block max-w-[200px]">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200/80 cursor-help transition-colors hover:bg-amber-100/70">
                                    <span className="material-symbols-outlined text-[15px] text-amber-700 flex-shrink-0">gavel</span>
                                    <span className="truncate">{po.evidence}</span>
                                  </div>
                                  {/* Hover Tooltip Popup */}
                                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl border border-slate-700 animate-fade-in pointer-events-none">
                                    <div className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                                      <span className="material-symbols-outlined text-sm">verified</span>
                                      Kurul / Dayanak Kanıtı
                                    </div>
                                    <p className="leading-relaxed text-slate-200 break-words font-normal">
                                      {po.evidence}
                                    </p>
                                    <div className="w-2.5 h-2.5 bg-slate-900 border-r border-b border-slate-700 transform rotate-45 absolute -bottom-1.5 left-4"></div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Girilmemiş</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {programOutcomes.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant text-xs font-medium">
                              Bu programa ait bölüm başkanlığı tarafından henüz tanımlanmış Program Çıktısı (PÇ) bulunmamaktadır.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* DÇ Modal */}
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
                <h3 className="text-headline-md font-bold text-on-surface">{editItem ? 'DÇ Düzenle' : 'Yeni DÇ Ekle'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">DÇ Kodu *</label>
                <input 
                  value={form.code} 
                  onChange={e => setForm({ ...form, code: e.target.value })} 
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  placeholder="Örn: DÇ1, DÇ.01" 
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
                  placeholder="Ders çıktısının detaylı açıklaması..."
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
                  <span className="text-[10px] text-slate-400 mt-1 block">Dersin ulaşmayı hedeflediği oran</span>
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
                    placeholder="Örn: Ders Bilgi Paketi / Bölüm Kurulu 14.09.2025 tarih ve 2025/12 sayılı kararı" 
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">DÇ tablosunda ve raporlarda üzerine gelindiğinde detay olarak gösterilir</span>
              </div>

              {!isInstructorView ? (
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Ders *</label>
                  <select 
                    value={form.course} 
                    onChange={e => setForm({ ...form, course: e.target.value })} 
                    className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="">Seçiniz</option>
                    {courses.map(c => {
                      const instName = getInstructorName(c);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name} {c.sinif ? `(${c.sinif}. Sınıf)` : ''} {c.sube ? `(Şube: ${c.sube})` : ''} {instName ? `— ${instName}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5 font-bold">Bağlı Ders</label>
                  <input
                    type="text"
                    value={activeCourse ? `${activeCourse.code} - ${activeCourse.name} ${activeCourse.sinif ? `(${activeCourse.sinif}. Sınıf)` : ''} ${activeCourse.sube ? `(Şube: ${activeCourse.sube})` : ''}` : 'Seçili Ders Yok'}
                    disabled
                    className="w-full border border-outline-variant bg-slate-50 text-slate-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed font-medium"
                  />
                </div>
              )}
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
