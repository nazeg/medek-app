import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { useAuth } from '../../contexts/AuthContext';
import { useTerm } from '../../contexts/TermContext';
import { useActiveCourse } from '../../contexts/CourseContext';

export default function InstructorDashboard() {
  const { user } = useAuth();
  const { activeTerm } = useTerm();
  const { selectCourse } = useActiveCourse();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [coursesWithStats, setCoursesWithStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    coursesCount: 0,
    outcomesCount: 0,
    examsCount: 0,
    studentsCount: 0
  });

  useEffect(() => {
    if (!user?.id || !activeTerm?.id) {
      setCourses([]);
      setCoursesWithStats([]);
      setLoading(false);
      return;
    }

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch courses for this instructor and active term
        const assignedCourses = await pb.collection('courses').getFullList({
          filter: `instructor ~ "${user.id}" && term = "${activeTerm.id}"`,
          expand: 'program',
          sort: 'code'
        });
        setCourses(assignedCourses);

        let dcsCount = 0;
        let examsCount = 0;
        const courseStats = {};

        if (assignedCourses.length > 0) {
          const courseIdsFilter = assignedCourses.map(c => `course = "${c.id}"`).join(' || ');
          
          const [dcsList, examsList] = await Promise.all([
            pb.collection('course_outcomes').getFullList({
              filter: courseIdsFilter,
            }),
            pb.collection('exams').getFullList({
              filter: courseIdsFilter,
            })
          ]);

          dcsCount = dcsList.length;
          examsCount = examsList.length;

          // Map stats to each course
          assignedCourses.forEach(c => {
            const courseDcs = dcsList.filter(d => d.course === c.id);
            const courseExams = examsList.filter(e => e.course === c.id);
            courseStats[c.id] = {
              dcs: courseDcs.length,
              exams: courseExams.map(e => e.type).join(', ') || 'Tanımlanmamış'
            };
          });
        }

        const studentsRes = await pb.collection('students').getList(1, 1);

        setStats({
          coursesCount: assignedCourses.length,
          outcomesCount: dcsCount,
          examsCount: examsCount,
          studentsCount: studentsRes.totalItems
        });

        setCoursesWithStats(assignedCourses.map(c => ({
          ...c,
          dcsCount: courseStats[c.id]?.dcs || 0,
          examsStr: courseStats[c.id]?.exams || 'Tanımlanmamış'
        })));

      } catch (err) {
        console.error('Error loading instructor dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user, activeTerm]);

  const handleQuickAction = (courseId, path) => {
    selectCourse(courseId);
    navigate(path);
  };

  const statCards = [
    {
      label: 'Atanmış Dersler',
      value: stats.coursesCount,
      icon: 'auto_stories',
      color: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/20',
    },
    {
      label: 'Ders Çıktıları (DÇ)',
      value: stats.outcomesCount,
      icon: 'description',
      color: 'text-[#7C3AED]',
      bg: 'bg-[#7C3AED]/10',
      border: 'border-[#7C3AED]/20',
    },
    {
      label: 'Değerlendirmeler',
      value: stats.examsCount,
      icon: 'assignment',
      color: 'text-[#D97706]',
      bg: 'bg-[#D97706]/10',
      border: 'border-[#D97706]/20',
    },
    {
      label: 'Sistem Öğrencileri',
      value: stats.studentsCount,
      icon: 'group',
      color: 'text-[#059669]',
      bg: 'bg-[#059669]/10',
      border: 'border-[#059669]/20',
    }
  ];

  return (
    <>
      {/* Header */}
      <header className="flex justify-between items-start md:items-center mb-8 flex-col md:flex-row gap-4">
        <div>
          <h2 className="text-display-lg text-on-surface font-bold">Öğretim Elemanı Paneli</h2>
          <p className="font-body-md text-on-surface-variant">
            Hoş geldiniz, <span className="font-semibold text-on-surface">{user?.title ? `${user.title} ${user.name}` : user?.name}</span>. 
            Bu dönem (<span className="font-medium text-on-surface">{activeTerm?.name || 'Seçili Dönem Yok'}</span>) aktif <span className="font-bold text-primary">{courses.length}</span> dersiniz bulunmaktadır.
          </p>
        </div>
      </header>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className={`bg-white p-5 rounded-xl border ${card.border} shadow-sm flex flex-col justify-between`}
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider text-xs font-semibold">{card.label}</span>
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                <span className={`material-symbols-outlined text-lg ${card.color}`}>{card.icon}</span>
              </div>
            </div>
            <h3 className={`text-3xl font-extrabold ${card.color}`}>
              {loading ? (
                <span className="inline-block w-8 h-8 bg-surface-container-high animate-pulse rounded" />
              ) : (
                card.value
              )}
            </h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Courses List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-headline-md text-on-surface font-bold border-l-4 border-primary pl-3.5">Aktif Dersleriniz</h3>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl border border-outline-variant p-6 space-y-4 animate-pulse">
                  <div className="h-6 bg-surface-container-high w-1/3 rounded" />
                  <div className="h-4 bg-surface-container w-2/3 rounded" />
                  <div className="h-10 bg-surface-container-low rounded w-full" />
                </div>
              ))}
            </div>
          ) : coursesWithStats.length > 0 ? (
            <div className="space-y-4">
              {coursesWithStats.map(course => (
                <div
                  key={course.id}
                  className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden hover:border-primary/40 transition-all group"
                >
                  <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex gap-4 items-center">
                      <div className="bg-primary text-white px-3 py-1.5 rounded-lg text-label-md font-bold uppercase tracking-wider text-[11px]">
                        {course.code}
                      </div>
                      <div>
                        <h4 className="text-headline-md font-bold text-on-surface group-hover:text-primary transition-colors">{course.name}</h4>
                        <p className="text-body-md text-on-surface-variant font-medium mt-0.5">{course.expand?.program?.name || '—'}</p>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/50">
                      {course.sinif}. Sınıf
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-on-surface-variant border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#7C3AED] text-lg">description</span>
                        <span>
                          Ders Çıktısı (DÇ): <strong className="text-on-surface font-semibold">{course.dcsCount} adet</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#D97706] text-lg">assignment</span>
                        <span>
                          Değerlendirmeler: <strong className="text-on-surface font-semibold">{course.examsStr}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="text-xs text-on-surface-variant/70 italic">
                        İşlemler için sağdaki butonları kullanabilirsiniz.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleQuickAction(course.id, '/instructor/exams')}
                          className="px-3.5 py-2 border border-outline-variant text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]">design_services</span>
                          Sınav Planı
                        </button>
                        <button
                          onClick={() => handleQuickAction(course.id, '/instructor/grades')}
                          className="px-3.5 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-primary hover:text-white active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit_note</span>
                          Not Girişi
                        </button>
                        <button
                          onClick={() => handleQuickAction(course.id, '/instructor/reports')}
                          className="px-3 py-2 text-on-surface-variant hover:text-primary rounded-lg text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">analytics</span>
                          Rapor Al
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-outline-variant rounded-xl p-10 text-center text-slate-500 font-medium">
              <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">auto_stories</span>
              Bu akademik dönem için size atanmış ders bulunmamaktadır.
            </div>
          )}
        </div>

        {/* Guidance / Steps Workflow */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-6 space-y-5">
            <h3 className="text-headline-md text-on-surface font-bold flex items-center gap-2 border-b border-outline-variant pb-4">
              <span className="material-symbols-outlined text-primary">school</span>
              Akreditasyon Adımları
            </h3>
            
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Sınav ve Ağırlık Planlama</h4>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Dersleriniz için Vize, Final veya Ödev gibi sınav türlerini ve bunların ağırlıklarını belirleyin.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Soru - DÇ İlişkilendirmesi</h4>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Her sınav sorusunun hangi ders çıktılarına (DÇ) katkı sağladığını ve puan limitlerini girin.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Soru Bazlı Not Girişi</h4>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Öğrencilerinizin soru puanlarını el ile girin veya Excel şablonunu indirip tek tıkla toplu yükleyin.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0 flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Rapor & Değerlendirme</h4>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Sistem PÇ ve DÇ başarı oranlarını otomatik hesaplasın; dönem sonu akreditasyon raporlarını alın.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
