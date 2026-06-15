import { useLocation } from 'react-router-dom';
import { useTerm } from '../../contexts/TermContext';
import { useProgram } from '../../contexts/ProgramContext';
import { useActiveCourse } from '../../contexts/CourseContext';
import { useAuth } from '../../contexts/AuthContext';

export default function TopNavbar({ title, subtitle }) {
  const location = useLocation();
  const { terms, activeTerm, selectTerm } = useTerm();
  const { programs, activeProgram, selectProgram } = useProgram();
  const { courses, activeCourse, selectCourse } = useActiveCourse();
  const { user } = useAuth();

  const isInstructorView = location.pathname.startsWith('/instructor') || user?.role === 'instructor';
  const showProgramSelector = user && (user.role === 'coordinator' || user.role === 'program_head' || user.role === 'instructor');

  return (
    <header className="h-16 fixed top-0 right-0 left-[260px] bg-white border-b border-outline-variant flex justify-end items-center px-margin-desktop z-40">
      <div className="flex items-center gap-4">
        {showProgramSelector && programs.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-50 border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-primary text-lg">school</span>
            <select
              value={activeProgram?.id || ''}
              onChange={(e) => selectProgram(e.target.value)}
              className="bg-transparent border-none text-sm font-semibold text-on-surface focus:outline-none focus:ring-0 focus:ring-transparent cursor-pointer py-0 max-w-[240px] truncate"
            >
              {programs.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 bg-slate-50 border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors">
          <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
          <select
            value={activeTerm?.id || ''}
            onChange={(e) => selectTerm(e.target.value)}
            className="bg-transparent border-none text-sm font-semibold text-on-surface focus:outline-none focus:ring-0 focus:ring-transparent cursor-pointer py-0"
          >
            {terms.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
