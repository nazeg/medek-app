import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useTerm } from '../../contexts/TermContext';
import { useProgram } from '../../contexts/ProgramContext';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../../lib/logger';

export default function Matrix() {
  const location = useLocation();
  const isInstructorView = location.pathname.startsWith('/instructor');
  const { user } = useAuth();
  const { activeTerm } = useTerm();
  const { activeProgram } = useProgram();
  const [pcList, setPcList] = useState([]);
  const [dcList, setDcList] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [matrix, setMatrix] = useState({});

  useEffect(() => {
    setSelectedCourseId('');
  }, [activeProgram]);

  useEffect(() => {
    const hasAccess = isInstructorView ? (user && activeProgram && activeTerm) : (activeProgram && activeTerm);
    if (!hasAccess) {
      setPcList([]);
      setDcList([]);
      setCourses([]);
      setMatrix({});
      return;
    }

    const progId = activeProgram.id;
    const dcFilter = isInstructorView 
      ? `course.program = "${activeProgram.id}" && course.term = "${activeTerm.id}" && course.instructor ~ "${user.id}"`
      : `course.program = "${activeProgram.id}" && course.term = "${activeTerm.id}"`;

    const courseFilter = isInstructorView
      ? `program = "${progId}" && term = "${activeTerm.id}" && instructor ~ "${user.id}"`
      : `program = "${progId}" && term = "${activeTerm.id}"`;

    Promise.all([
      pb.collection('program_outcomes').getFullList({ filter: `program = "${progId}"`, sort: 'code' }),
      pb.collection('course_outcomes').getFullList({ filter: dcFilter, expand: 'course', sort: 'code' }),
      pb.collection('pc_dc_matrix').getFullList({ filter: `program = "${progId}"` }),
      pb.collection('courses').getFullList({ filter: courseFilter, sort: 'code' }),
    ]).then(([pc, dc, m, crs]) => {
      pc.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      dc.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      setPcList(pc);
      setDcList(dc);
      setCourses(crs);
      const map = {};
      m.forEach(item => { map[`${item.pc}_${item.dc}`] = item.level || 0; });
      setMatrix(map);
    }).catch(err => {
      console.error('Error loading matrix data:', err);
    });
  }, [activeProgram, activeTerm, isInstructorView, user]);

  const setLevel = async (pc, dc, level) => {
    const progId = activeProgram?.id;
    if (!progId) return;
    const key = `${pc}_${dc}`;
    const targetPc = pcList.find(p => p.id === pc);
    const targetDc = dcList.find(d => d.id === dc);

    try {
      const existing = await pb.collection('pc_dc_matrix').getFirstListItem(`program = "${progId}" && pc = "${pc}" && dc = "${dc}"`);
      if (level === 0) {
        await pb.collection('pc_dc_matrix').delete(existing.id);
      } else {
        await pb.collection('pc_dc_matrix').update(existing.id, { level: parseInt(level) });
      }
    } catch {
      if (level > 0) {
        await pb.collection('pc_dc_matrix').create({ program: progId, pc, dc, level: parseInt(level) });
      }
    }
    setMatrix(prev => ({ ...prev, [key]: parseInt(level) }));

    logAction({
      action: LOG_ACTIONS.UPDATE,
      category: LOG_CATEGORIES.MATRIX,
      details: `${targetDc?.expand?.course?.code ? `[${targetDc.expand.course.code}] ` : ''}${targetDc?.code || 'DÇ'} ↔ ${targetPc?.code || 'PÇ'} matris ilişki düzeyi "${level}" olarak güncellendi.`,
      metadata: { programId: progId, pc: targetPc?.code, dc: targetDc?.code, level }
    });
  };

  const levelColor = (l) => {
    if (l === 0) return 'bg-surface text-on-surface-variant';
    if (l === 1) return 'bg-red-100 text-red-700';
    if (l === 2) return 'bg-yellow-100 text-yellow-700';
    if (l === 3) return 'bg-green-100 text-green-700';
    if (l === 4) return 'bg-green-200 text-green-800';
    if (l === 5) return 'bg-primary/20 text-primary';
    return 'bg-surface text-on-surface-variant';
  };

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">PÇ-DÇ Matrisi</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Program çıktıları ile ders çıktıları arasındaki ilişkiyi belirleyin</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm">
        {!activeProgram && (
          <div className="text-center text-on-surface-variant py-8 font-medium">Lütfen üst menüden bir program seçiniz.</div>
        )}
        {activeProgram && (
          <>
            <div className="mb-6 p-4 bg-slate-50 border border-outline-variant rounded-xl">
              <label className="text-label-sm uppercase tracking-wider text-on-surface-variant block mb-1.5">Ders Filtrele</label>
              <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full max-w-xs border border-outline-variant rounded-lg px-4 py-2 text-sm focus:ring-0 focus:ring-transparent bg-white">
                <option value="">Tümü</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
            {pcList.length > 0 && (
              <div className="space-y-6 bg-slate-50/30 p-4 rounded-xl border border-outline-variant/50">
                {(selectedCourseId ? courses.filter(c => c.id === selectedCourseId) : courses).map(course => {
                  const courseDcs = dcList.filter(dc => dc.course === course.id);
                  return (
                    <div key={course.id} className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm p-4 space-y-4">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-sm border-b border-outline-variant pb-2.5">
                        <span className="material-symbols-outlined text-primary text-lg">auto_stories</span>
                        <span>{course.code} - {course.name}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                              <th className="px-3 py-2 font-semibold border-b border-outline-variant w-24">DÇ \ PÇ</th>
                              {pcList.map(pc => (
                                <th key={pc.id} className="px-2 py-2 text-center font-semibold border-b border-outline-variant border-l border-outline-variant/30 text-sm text-primary" title={pc.description}>
                                  {pc.code}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {courseDcs.map(dc => (
                              <tr key={dc.id} className="hover:bg-surface/50">
                                <td className="px-3 py-1.5 font-bold border-b border-outline-variant text-xs" title={dc.description}>
                                  <span className="font-bold text-on-surface">{dc.code}</span>
                                </td>
                                {pcList.map(pc => {
                                  const key = `${pc.id}_${dc.id}`;
                                  const level = matrix[key] || 0;
                                  return (
                                    <td key={pc.id} className="px-1 py-1 text-center border-b border-outline-variant border-l border-outline-variant/30">
                                      <select
                                        value={level}
                                        onChange={e => setLevel(pc.id, dc.id, e.target.value)}
                                        className={`w-11 h-6 text-center text-xs font-bold border-none rounded p-0 bg-none appearance-none ${levelColor(level)} focus:ring-2 focus:ring-primary/20 cursor-pointer`}
                                      >
                                        <option value={0}>-</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                        <option value={4}>4</option>
                                        <option value={5}>5</option>
                                      </select>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            {courseDcs.length === 0 && (
                              <tr>
                                <td colSpan={pcList.length + 1} className="px-4 py-6 text-center text-red-700 text-xs font-semibold">
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
                <div className="mt-4 flex gap-4 text-xs text-on-surface-variant bg-white p-3 rounded-lg border border-outline-variant/60">
                  <span><span className="inline-block w-3 h-3 rounded bg-red-100 mr-1"></span>1 - Çok Az</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-yellow-100 mr-1"></span>2 - Az</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-green-100 mr-1"></span>3 - Orta</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1"></span>4 - Yüksek</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-primary/20 mr-1"></span>5 - Çok Yüksek</span>
                </div>
              </div>
            )}
          </>
        )}
        {activeProgram && pcList.length === 0 && (
          <p className="text-center text-red-700 py-8 font-semibold">Bu programa ait PÇ bulunamadı. Önce Program Çıktıları tanımlayın.</p>
        )}
      </div>
    </>
  );
}
