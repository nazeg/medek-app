import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useTerm } from '../../contexts/TermContext';

export default function CoordinatorDashboard() {
  const { user } = useAuth();
  const { activeProgram, programs } = useProgram();
  const { activeTerm } = useTerm();

  const [stats, setStats] = useState({
    programs: 0,
    courses: 0,
    outcomes: 0,
    courseOutcomes: 0,
    matrixRows: 0,
    instructors: 0,
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const targetProgId = activeProgram?.id;

        // Fetch programs list for this user
        let progsRes = [];
        if (user.role === 'coordinator' || user.role === 'program_head') {
          const headPrograms = await pb.collection('programs').getFullList({ 
            sort: 'name',
            filter: `head = "${user.id}"`
          }).catch(() => []);
          if (headPrograms.length > 0) {
            progsRes = headPrograms;
          } else if (user.role === 'coordinator' && user.faculty) {
            progsRes = await pb.collection('programs').getFullList({ 
              sort: 'name',
              filter: `faculty = "${user.faculty}"`
            }).catch(() => []);
          }
        }

        // Course filter based on targetProgId and activeTerm
        let courseFilter = '';
        if (targetProgId) {
          courseFilter = activeTerm?.id 
            ? `program = "${targetProgId}" && term = "${activeTerm.id}"`
            : `program = "${targetProgId}"`;
        } else {
          const isCoordinator = user.role === 'coordinator' || user.role === 'admin';
          const baseProg = isCoordinator ? `program.faculty = "${user.faculty}"` : `program.head = "${user.id}"`;
          courseFilter = activeTerm?.id ? `${baseProg} && term = "${activeTerm.id}"` : baseProg;
        }

        // Program Outcomes (PÇ) filter
        let poFilter = '';
        if (targetProgId) {
          poFilter = `program = "${targetProgId}"`;
        } else if (progsRes.length > 0) {
          poFilter = progsRes.map(p => `program = "${p.id}"`).join(' || ');
        }

        const [coursesRes, poRes] = await Promise.all([
          pb.collection('courses').getFullList({
            sort: 'name',
            filter: courseFilter,
            expand: 'instructor,program',
          }).catch(() => []),
          poFilter ? pb.collection('program_outcomes').getList(1, 1, { filter: poFilter }).catch(() => ({ totalItems: 0 })) : Promise.resolve({ totalItems: 0 }),
        ]);

        let courseOutcomesCount = 0;
        let matrixRowsCount = 0;

        if (coursesRes.length > 0) {
          const courseIdsFilter = coursesRes.map(c => `course = "${c.id}"`).join(' || ');
          const dcsList = await pb.collection('course_outcomes').getFullList({
            filter: courseIdsFilter,
          }).catch(() => []);
          
          courseOutcomesCount = dcsList.length;

          if (dcsList.length > 0) {
            const dcIdsFilter = dcsList.map(d => `dc = "${d.id}"`).join(' || ');
            const matrixRes = await pb.collection('pc_dc_matrix').getList(1, 1, {
              filter: dcIdsFilter,
            }).catch(() => ({ totalItems: 0 }));
            matrixRowsCount = matrixRes.totalItems;
          }
        }

        // Calculate distinct instructors assigned to the active courses for this selection
        const distinctInstructors = new Set();
        coursesRes.forEach(c => {
          if (Array.isArray(c.instructor)) {
            c.instructor.forEach(i => i && distinctInstructors.add(i));
          } else if (c.instructor) {
            distinctInstructors.add(c.instructor);
          }
        });

        setStats({
          programs: targetProgId ? 1 : progsRes.length,
          courses: coursesRes.length,
          outcomes: poRes.totalItems || 0,
          courseOutcomes: courseOutcomesCount,
          matrixRows: matrixRowsCount,
          instructors: distinctInstructors.size,
        });
        setCourses(coursesRes.slice(0, 8));
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, activeProgram, activeTerm]);

  const statCards = [
    {
      label: 'Program',
      value: stats.programs,
      icon: 'schema',
      color: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/20',
      to: '/coordinator/courses',
    },
    {
      label: 'Ders',
      value: stats.courses,
      icon: 'auto_stories',
      color: 'text-secondary',
      bg: 'bg-secondary/10',
      border: 'border-secondary/20',
      to: '/coordinator/courses',
    },
    {
      label: 'Program Çıktısı (PÇ)',
      value: stats.outcomes,
      icon: 'target',
      color: 'text-tertiary',
      bg: 'bg-tertiary/10',
      border: 'border-tertiary/20',
      to: '/coordinator/program-outcomes',
    },
    {
      label: 'Ders Çıktısı (DÇ)',
      value: stats.courseOutcomes,
      icon: 'description',
      color: 'text-[#7C3AED]',
      bg: 'bg-[#7C3AED]/10',
      border: 'border-[#7C3AED]/20',
      to: '/coordinator/course-outcomes',
    },
    {
      label: 'Matris Satırı',
      value: stats.matrixRows,
      icon: 'grid_on',
      color: 'text-[#0891B2]',
      bg: 'bg-[#0891B2]/10',
      border: 'border-[#0891B2]/20',
      to: '/coordinator/matrix',
    },
    {
      label: 'Öğretim Elemanı',
      value: stats.instructors,
      icon: 'group',
      color: 'text-[#059669]',
      bg: 'bg-[#059669]/10',
      border: 'border-[#059669]/20',
      to: '/coordinator/courses',
    },
  ];

  const quickLinks = [
    {
      to: '/coordinator/courses',
      icon: 'auto_stories',
      label: 'Eğitim Müfredatı',
      desc: 'Ders ve öğretim elemanı yönetimi',
      accent: 'from-primary to-primary-container',
    },
    {
      to: '/coordinator/program-outcomes',
      icon: 'target',
      label: 'Program Çıktıları (PÇ)',
      desc: 'Program kazanımlarını tanımlayın',
      accent: 'from-tertiary to-tertiary-container',
    },
    {
      to: '/coordinator/course-outcomes',
      icon: 'description',
      label: 'Ders Çıktıları (DÇ)',
      desc: 'Her derse ait çıktıları yönetin',
      accent: 'from-[#7C3AED] to-[#A78BFA]',
    },
    {
      to: '/coordinator/matrix',
      icon: 'grid_on',
      label: 'PÇ-DÇ Matrisi',
      desc: 'Çıktılar arası ilişki haritası',
      accent: 'from-[#0891B2] to-[#67E8F9]',
    },
    {
      to: '/coordinator/reports',
      icon: 'analytics',
      label: 'Analizler & Raporlar',
      desc: 'Program performans değerlendirmesi',
      accent: 'from-[#D97706] to-[#FCD34D]',
    },
  ];

  // Helper to get instructor display name
  const getInstructorName = (course) => {
    const instructors = course.expand?.instructor;
    if (!instructors) return <span className="text-error text-xs font-semibold">Atanmamış</span>;
    const arr = Array.isArray(instructors) ? instructors : [instructors];
    if (arr.length === 0) return <span className="text-error text-xs font-semibold">Atanmamış</span>;
    return (
      <span className="text-on-surface text-sm">
        {arr.map(i => i.title ? `${i.title} ${i.name}` : i.name).join(', ')}
      </span>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-display-lg text-on-surface font-bold">Akreditasyon Paneli</h2>
          <p className="text-on-surface-variant font-body-lg mt-1">
            Hoş geldiniz, <span className="font-semibold text-on-surface">{user?.title ? `${user.title} ${user.name}` : user?.name}</span>
          </p>
        </div>
        <Link
          to="/coordinator/reports"
          className="bg-primary text-white px-5 py-2.5 rounded-lg font-label-md flex items-center gap-2 hover:bg-primary-container transition-all active:scale-95 shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">analytics</span>
          Analizlere Git
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className={`bg-white p-4 rounded-xl border ${card.border} shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group`}
          >
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <span className={`material-symbols-outlined text-lg ${card.color}`}>{card.icon}</span>
            </div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1 text-xs">{card.label}</p>
            <h3 className={`text-2xl font-bold ${card.color}`}>
              {loading ? (
                <span className="inline-block w-8 h-6 bg-surface-container-high animate-pulse rounded" />
              ) : (
                card.value
              )}
            </h3>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Courses Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest">
              <h3 className="text-headline-md text-on-surface font-semibold">Ders Listesi</h3>
              <Link
                to="/coordinator/courses"
                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
              >
                Tümünü Gör
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </Link>
            </div>
            {loading ? (
              <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : courses.length === 0 ? (
              <div className="px-6 py-12 text-center text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-4xl text-outline-variant block mb-2">auto_stories</span>
                Henüz ders eklenmemiş.{' '}
                <Link to="/coordinator/courses" className="text-primary font-semibold hover:underline">Ders ekleyin</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      <th className="px-6 py-3 font-label-sm text-on-surface-variant uppercase text-xs">Ders Adı</th>
                      <th className="px-6 py-3 font-label-sm text-on-surface-variant uppercase text-xs">Program</th>
                      <th className="px-6 py-3 font-label-sm text-on-surface-variant uppercase text-xs">Öğretim Elemanı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {courses.map((course) => (
                      <tr key={course.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-on-surface text-sm">{course.name}</span>
                            {course.sube && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                Şube {course.sube}
                              </span>
                            )}
                            {course.code && (
                              <span className="text-xs text-on-surface-variant font-mono">({course.code})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-on-surface-variant">
                          {course.expand?.program?.name || '—'}
                        </td>
                        <td className="px-6 py-3.5">
                          {getInstructorName(course)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-3">
          <h3 className="text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold px-1 mb-4">
            Hızlı Erişim
          </h3>
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-4 bg-white rounded-xl border border-outline-variant p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all hover:-translate-y-0.5 group"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${link.accent} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                <span className="material-symbols-outlined text-white text-lg">{link.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">{link.label}</p>
                <p className="text-xs text-on-surface-variant truncate">{link.desc}</p>
              </div>
              <span className="material-symbols-outlined text-outline-variant text-lg group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
