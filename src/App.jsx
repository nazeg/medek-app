import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Faculties from './pages/admin/Faculties';
import Departments from './pages/admin/Departments';
import Users from './pages/admin/Users';
import AdminReports from './pages/admin/Reports';
import Terms from './pages/admin/Terms';
import AdminLogs from './pages/admin/Logs';
import CoordinatorDashboard from './pages/coordinator/Dashboard';
import Programs from './pages/coordinator/Programs';
import CoordinatorCourses from './pages/coordinator/Courses';
import ProgramOutcomes from './pages/coordinator/ProgramOutcomes';
import CoordinatorCourseOutcomes from './pages/coordinator/CourseOutcomes';
import Matrix from './pages/coordinator/Matrix';

import InstructorDashboard from './pages/instructor/Dashboard';
import Exams from './pages/instructor/Exams';
import Grades from './pages/instructor/Grades';
import InstructorReports from './pages/instructor/InstructorReports';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const homePath = user.role === 'program_head' ? '/coordinator' : `/${user.role}`;
    return <Navigate to={homePath} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const VALID_ROLES = ['admin', 'coordinator', 'program_head', 'instructor'];
  const hasValidRole = user && VALID_ROLES.includes(user.role);
  const homePath = user ? (user.role === 'program_head' ? '/coordinator' : `/${user.role}`) : '/login';

  return (
    <Routes>
      <Route path="/login" element={hasValidRole ? <Navigate to={homePath} replace /> : <Login />} />
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="faculties" element={<Faculties />} />
        <Route path="departments" element={<Departments />} />
        <Route path="users" element={<Users />} />
        <Route path="terms" element={<Terms />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="logs" element={<AdminLogs />} />
      </Route>
      <Route path="/coordinator" element={<ProtectedRoute roles={['coordinator', 'program_head']}><Layout /></ProtectedRoute>}>
        <Route index element={<CoordinatorDashboard />} />
        <Route path="programs" element={<ProtectedRoute roles={['coordinator']}><Programs /></ProtectedRoute>} />
        <Route path="courses" element={<CoordinatorCourses />} />
        <Route path="program-outcomes" element={<ProgramOutcomes />} />
        <Route path="course-outcomes" element={<CoordinatorCourseOutcomes />} />
        <Route path="matrix" element={<Matrix />} />
        <Route path="reports" element={<InstructorReports />} />
      </Route>
      <Route path="/instructor" element={<ProtectedRoute roles={['instructor', 'coordinator', 'program_head']}><Layout /></ProtectedRoute>}>
        <Route index element={<InstructorDashboard />} />
        <Route path="course-outcomes" element={<CoordinatorCourseOutcomes />} />
        <Route path="matrix" element={<Matrix />} />
        <Route path="exams" element={<Exams />} />
        <Route path="grades" element={<Grades />} />
        <Route path="reports" element={<InstructorReports />} />
      </Route>
      <Route path="/" element={hasValidRole ? <Navigate to={homePath} replace /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { TermProvider } from './contexts/TermContext';
import { ProgramProvider } from './contexts/ProgramContext';
import { CourseProvider } from './contexts/CourseContext';
import { AlertConfirmProvider } from './contexts/AlertConfirmContext';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TermProvider>
          <ProgramProvider>
            <CourseProvider>
              <AlertConfirmProvider>
                <AppRoutes />
              </AlertConfirmProvider>
            </CourseProvider>
          </ProgramProvider>
        </TermProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
