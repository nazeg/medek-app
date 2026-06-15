import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import pb from '../../lib/pocketbase';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const verifyAssignment = async () => {
      try {
        if (user.role === 'coordinator' || user.role === 'program_head') {
          const progs = await pb.collection('programs').getList(1, 1, {
            filter: `head = "${user.id}"`
          });
          if (progs.totalItems === 0) {
            logout();
          }
        } else if (user.role === 'instructor') {
          const courses = await pb.collection('courses').getList(1, 1, {
            filter: `instructor ~ "${user.id}"`
          });
          if (courses.totalItems === 0) {
            logout();
          }
        }
      } catch (err) {
        console.error('Error verifying assignment on navigation:', err);
      }
    };

    verifyAssignment();
  }, [location.pathname, user, logout]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[260px] flex-1 flex flex-col min-h-screen relative overflow-x-hidden">
        <TopNavbar />
        <div className={`mt-16 p-margin-desktop w-full space-y-8 flex-grow ${
          location.pathname.endsWith('/grades') || 
          location.pathname.endsWith('/reports') || 
          location.pathname.endsWith('/matrix')
            ? 'px-4 md:px-8' 
            : 'max-w-[1200px] mx-auto'
        }`}>
          <Outlet />
        </div>
        <footer className="py-6 text-center text-xs text-on-surface-variant/70 border-t border-outline-variant/60 mt-auto">
          <p className="font-semibold">Geliştiriciler: Öğr. Gör. Osman ÖZEN - Şube Müdürü Nazmi EĞRET</p>
          <p className="mt-1">Kütahya Sağlık Bilimleri Üniversitesi</p>
        </footer>
      </main>
    </div>
  );
}
