import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useActiveCourse } from '../../contexts/CourseContext';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

export default function CoordinatorCourseOutcomes() {
  const location = useLocation();
  const isInstructorView = location.pathname.startsWith('/instructor');
  const { user: coordinatorUser } = useAuth();
  const { activeProgram } = useProgram();
  const { activeCourse, selectCourse, courses: instructorCourses } = useActiveCourse();
  const { confirm } = useAlertConfirm();
  const [outcomes, setOutcomes] = useState([]);
  const [programOutcomes, setProgramOutcomes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ code: '', description: '', course: '' });

  useEffect(() => {
    setSelectedCourseId('');
  }, [activeProgram]);

  const load = async () => {
    const hasAccess = isInstructorView ? (coordinatorUser && activeCourse) : (coordinatorUser && activeProgram);
    if (!hasAccess) {
      if (isInstructorView) {
        setOutcomes([]);
        setProgramOutcomes([]);
        setCourses([]);
      }
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
            filter: `course.program = "${activeProgram.id}"`,
            expand: 'course' 
          }),
          pb.collection('courses').getFullList({ 
            sort: 'code',
            filter: `program = "${activeProgram.id}"`
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

  useEffect(() => { load(); }, [coordinatorUser, activeProgram, activeCourse, isInstructorView]);

  const handleSave = async () => {
    const courseId = isInstructorView ? activeCourse.id : form.course;
    const data = { ...form, course: courseId };
    if (editItem) {
      await pb.collection('course_outcomes').update(editItem.id, data);
    } else {
      await pb.collection('course_outcomes').create(data);
    }
    setShowModal(false);
    setEditItem(null);
    setForm({ code: '', description: '', course: '' });
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ code: item.code, description: item.description, course: item.course });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (await confirm('Silmek istediğinize emin misiniz?')) {
      await pb.collection('course_outcomes').delete(id);
      load();
    }
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Ders Çıktıları (DÇ)</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Ders kazanımlarını tanımlayın</p>
        </div>
        {((!isInstructorView && activeProgram) || (isInstructorView && activeCourse)) && (
          <button onClick={() => { setEditItem(null); setForm({ code: '', description: '', course: isInstructorView ? activeCourse.id : (selectedCourseId || '') }); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95">
            <span className="material-symbols-outlined text-lg">add</span> DÇ Ekle
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        {isInstructorView && (
          <div className="p-4 bg-slate-50 border-b border-outline-variant">
            <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders Seçin</label>
            <select value={activeCourse?.id || ''} onChange={e => selectCourse(e.target.value)} className="w-full max-w-xs border border-outline-variant rounded-lg px-4 py-2 text-sm focus:ring-0 focus:ring-transparent bg-white">
              <option value="">Seçiniz</option>
              {instructorCourses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
        )}
        {!isInstructorView && !activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {isInstructorView && !activeCourse && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen bir ders seçiniz.</div>
        )}
        {((!isInstructorView && activeProgram) || (isInstructorView && activeCourse)) && (
          <>
            {!isInstructorView && (
              <div className="p-4 bg-slate-50 border-b border-outline-variant">
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders Filtrele</label>
                <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full max-w-xs border border-outline-variant rounded-lg px-4 py-2 text-sm focus:ring-0 focus:ring-transparent bg-white">
                  <option value="">Tümü</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </div>
            )}
            <div className="p-4 space-y-6 bg-slate-50/30">
              {(selectedCourseId ? courses.filter(c => c.id === selectedCourseId) : courses).map(course => {
                const courseOutcomes = outcomes.filter(o => o.course === course.id);
                return (
                  <div key={course.id} className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-outline-variant flex justify-between items-center">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                        <span className="material-symbols-outlined text-primary text-lg">auto_stories</span>
                        <span>{course.code} - {course.name}</span>
                      </div>
                      {!isInstructorView && (
                        <button onClick={() => { setEditItem(null); setForm({ code: '', description: '', course: course.id }); setShowModal(true); }} className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-all">
                          <span className="material-symbols-outlined text-xs">add</span> DÇ Ekle
                        </button>
                      )}
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white text-on-surface-variant text-[11px] font-semibold uppercase border-b border-outline-variant">
                          <th className="px-4 py-2 font-semibold w-24">Kod</th>
                          <th className="px-4 py-2 font-semibold">Açıklama</th>
                          <th className="px-4 py-2 font-semibold text-right w-32">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {courseOutcomes.map(o => (
                          <tr key={o.id} className="hover:bg-surface-container-low transition-colors group">
                            <td className="px-4 py-2 font-bold text-primary text-sm">{o.code}</td>
                            <td className="px-4 py-2 text-sm text-on-surface">{o.description}</td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleEdit(o)} className="p-1 hover:bg-surface-container rounded text-on-surface-variant" title="Düzenle"><span className="material-symbols-outlined text-lg">edit</span></button>
                                <button onClick={() => handleDelete(o.id)} className="p-1 hover:bg-surface-container rounded text-error" title="Sil"><span className="material-symbols-outlined text-lg">delete</span></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {courseOutcomes.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-red-700 text-xs font-semibold">
                              Bu derse ait tanımlanmış DÇ bulunmamaktadır.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {(selectedCourseId ? courses.filter(c => c.id === selectedCourseId) : courses).length === 0 && (
                <div className="text-center py-8 text-on-surface-variant text-sm">Ders bulunamadı.</div>
              )}

              {/* Program Outcomes (PÇ) - Read-only reference for Instructors */}
              {isInstructorView && activeCourse && (
                <div className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm mt-6">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-outline-variant flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-primary text-xl">fact_check</span>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          Program Çıktıları (PÇ) {activeCourse.expand?.program?.name ? `— ${activeCourse.expand.program.name}` : ''}
                        </h4>
                        <p className="text-[11px] text-on-surface-variant">Bölüm başkanlığı tarafından tanımlanan program hedefleri (Bilgilendirme Amaçlı)</p>
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
                          <th className="px-5 py-2.5 font-semibold w-24">PÇ Kodu</th>
                          <th className="px-5 py-2.5 font-semibold">Kazanım / Program Çıktısı Açıklaması</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {programOutcomes.map(po => (
                          <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-3 font-bold text-primary text-sm whitespace-nowrap align-top">
                              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                                {po.code}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm text-on-surface leading-relaxed">
                              {po.description}
                            </td>
                          </tr>
                        ))}
                        {programOutcomes.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-5 py-8 text-center text-on-surface-variant text-xs font-medium">
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
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') setShowModal(false); }}
        >
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md">{editItem ? 'DÇ Düzenle' : 'Yeni DÇ'}</h3>
              <button onClick={() => setShowModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Kod</label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm" placeholder="Örn: DÇ1" />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Açıklama</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm" rows={3} />
              </div>
              {!isInstructorView && (
                <div>
                  <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders</label>
                  <select value={form.course} onChange={e => setForm({ ...form, course: e.target.value })} className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm">
                    <option value="">Seçiniz</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
              )}
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
