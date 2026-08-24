import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import pb from '../lib/pocketbase';
import { useAuth } from './AuthContext';
import { useTerm } from './TermContext';
import { useProgram } from './ProgramContext';

const CourseContext = createContext(null);

export function CourseProvider({ children }) {
  const { user } = useAuth();
  const { activeTerm } = useTerm();
  const { activeProgram, selectProgram } = useProgram();
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCourses = useCallback(async () => {
    if (!user || !activeTerm) {
      setCourses([]);
      setActiveCourse(null);
      setLoading(false);
      return;
    }

    try {
      // Strictly query courses for the active term where instructor relation contains user.id
      const filter = `term = "${activeTerm.id}" && (instructor ~ "${user.id}" || instructor ?= "${user.id}")`;

      const list = await pb.collection('courses').getFullList({ 
        sort: 'code',
        filter: filter,
        expand: 'program,instructor',
        requestKey: null
      });

      // Strict client-side check: ensure only courses actually assigned to this user are shown
      const assignedList = list.filter(course => {
        if (!course.instructor) return false;
        if (Array.isArray(course.instructor)) {
          return course.instructor.includes(user.id);
        }
        return course.instructor === user.id;
      });

      setCourses(assignedList);
      
      const savedCourseId = localStorage.getItem(`medek_active_course_id_${user.id}_${activeTerm.id}`);
      if (savedCourseId) {
        const found = assignedList.find(c => c.id === savedCourseId);
        if (found) {
          setActiveCourse(found);
          setLoading(false);
          return;
        }
      }
      
      if (assignedList.length > 0) {
        setActiveCourse(assignedList[0]);
        localStorage.setItem(`medek_active_course_id_${user.id}_${activeTerm.id}`, assignedList[0].id);
      } else {
        setActiveCourse(null);
      }
    } catch (err) {
      console.error('Error loading courses in CourseContext:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeTerm]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const selectCourse = useCallback((courseId) => {
    const found = courses.find(c => c.id === courseId);
    if (found) {
      setActiveCourse(found);
      localStorage.setItem(`medek_active_course_id_${user?.id}_${activeTerm?.id}`, courseId);
      if (found.program && selectProgram) {
        selectProgram(found.program);
      }
    } else if (courseId === '') {
      setActiveCourse(null);
      localStorage.removeItem(`medek_active_course_id_${user?.id}_${activeTerm?.id}`);
    }
  }, [courses, user, activeTerm, selectProgram]);

  const value = useMemo(() => ({
    courses,
    activeCourse,
    selectCourse,
    loading,
    refreshCourses: loadCourses
  }), [courses, activeCourse, selectCourse, loading, loadCourses]);

  return (
    <CourseContext.Provider value={value}>
      {children}
    </CourseContext.Provider>
  );
}

export const useActiveCourse = () => useContext(CourseContext);
