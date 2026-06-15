import { useState, useEffect } from 'react';
import pb from '../../lib/pocketbase';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ faculties: 0, programs: 0, users: 0 });

  useEffect(() => {
    Promise.all([
      pb.collection('faculties').getList(1, 1),
      pb.collection('programs').getList(1, 1),
      pb.collection('users').getList(1, 1),
    ]).then(([f, p, us]) => {
      setStats({ faculties: f.totalItems, programs: p.totalItems, users: us.totalItems });
    });
  }, []);

  return (
    <>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg text-on-surface">Sistem Yönetici Paneli</h2>
          <p className="text-on-surface-variant mt-1 font-body-md">Fakülte, MYO, bölüm/program ve kullanıcı yönetimi</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {[
          { label: 'Fakülte / MYO', value: stats.faculties, icon: 'school', color: 'bg-secondary/10 text-secondary' },
          { label: 'Bölüm / Programlar', value: stats.programs, icon: 'schema', color: 'bg-tertiary/10 text-tertiary' },
          { label: 'Kullanıcılar', value: stats.users, icon: 'people', color: 'bg-primary/10 text-primary' },
        ].map((item) => (
          <div key={item.label} className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg ${item.color} flex items-center justify-center`}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase">{item.label}</p>
              <h3 className="text-headline-md font-bold">{item.value}</h3>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Fakülte / MYO', desc: 'Fakülte ve meslek yüksekokulu birimlerini tanımlayın.', icon: 'school', to: '/admin/faculties', color: 'primary' },
          { title: 'Bölüm / Program', desc: 'Bölüm ve program yapısını güncelleyin.', icon: 'schema', to: '/admin/departments', color: 'secondary' },
          { title: 'Kullanıcı Tanımla', desc: 'Rol ve erişim izinlerini belirleyin.', icon: 'person_add', to: '/admin/users', color: 'tertiary' },
        ].map((item) => (
          <a key={item.title} href={item.to} className="group relative overflow-hidden bg-white p-6 rounded-xl border border-outline-variant hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-48 cursor-pointer">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-${item.color}/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <div>
              <div className={`w-12 h-12 rounded-lg bg-${item.color}/10 text-${item.color} flex items-center justify-center mb-4`}>
                <span className="material-symbols-outlined text-3xl">{item.icon}</span>
              </div>
              <h3 className="text-headline-md text-on-surface">{item.title}</h3>
              <p className="text-on-surface-variant text-sm mt-1">{item.desc}</p>
            </div>
            <div className="flex items-center text-primary font-bold text-sm gap-1">
              Ekle ve Düzenle <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
