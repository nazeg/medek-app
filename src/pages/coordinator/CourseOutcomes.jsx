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
        setCourses([]);
      }
      return;
    }
    try {
      if (isInstructorView) {
        const o = await pb.collection('course_outcomes').getFullList({ 
          sort: 'code', 
          filter: `course = "${activeCourse.id}"`,
          expand: 'course' 
        });
        o.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        setOutcomes(o);
        setCourses([activeCourse]);
      } else {
        const [o, c] = await Promise.all([
          pb.collection('course_outcomes').getFullList({ 
            sort: 'code', 
            filter: `course.program = "${activeProgram.id}"`,
            expand: 'course' 
          }),
          pb.collection('courses').getFullList({ 
            sort: 'code',
            filter: `program = "${activeProgram.id}"`
          }),
        ]);
        o.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        c.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
        setOutcomes(o);
        setCourses(c);
      }
    } catch (err) {
      console.error('Error loading course outcomes:', err);
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
