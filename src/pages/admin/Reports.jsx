import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';

export default function AdminReports() {
  const [stats, setStats] = useState({ faculties: 0, users: 0, programs: 0, courses: 0, students: 0 });

  useEffect(() => {
    Promise.all([
      pb.collection('faculties').getList(1, 1),
      pb.collection('users').getList(1, 1),
      pb.collection('programs').getList(1, 1),
      pb.collection('courses').getList(1, 1),
      pb.collection('students').getList(1, 1),
    ]).then(([f, us, p, c, s]) => {
      setStats({
        faculties: f.totalItems,
        users: us.totalItems, programs: p.totalItems, courses: c.totalItems, students: s.totalItems,
      });
    });
  }, []);

  const reportItems = [
    { label: 'Fakülte / MYO', value: stats.faculties, icon: 'school' },
    { label: 'Bölüm / Programlar', value: stats.programs, icon: 'schema' },
    { label: 'Kullanıcılar', value: stats.users, icon: 'people' },
    { label: 'Dersler', value: stats.courses, icon: 'auto_stories' },
    { label: 'Öğrenciler', value: stats.students, icon: 'group' },
  ];

  const maxVal = Math.max(...reportItems.map(item => item.value)) || 1;

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Sistem Raporları</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Genel sistem istatistikleri</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
        {reportItems.slice(0, 6).map((item) => (
          <div key={item.label} className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">{item.icon}</span>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase">{item.label}</p>
              <h3 className="text-headline-md font-bold">{item.value}</h3>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-lowest">
          <h3 className="text-headline-md text-on-surface">Sistem Özeti</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {reportItems.map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span className="w-32 text-sm font-medium text-on-surface">{item.label}</span>
                <div className="flex-1 bg-surface-container h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(item.value / maxVal) * 100}%` }}></div>
                </div>
                <span className="text-sm font-bold text-on-surface w-16 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
