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
      let filter = '';
      if (user.role === 'instructor') {
        // Load all courses assigned to this instructor for the selected term
        filter = `(instructor ~ "${user.id}" || instructor ?= "${user.id}") && term = "${activeTerm.id}"`;
      } else if (user.role === 'coordinator' || user.role === 'program_head') {
        // Coordinator sees courses they teach or courses in their active program
        if (activeProgram?.id) {
          filter = `(instructor ~ "${user.id}" || instructor ?= "${user.id}" || program = "${activeProgram.id}") && term = "${activeTerm.id}"`;
        } else {
          filter = `(instructor ~ "${user.id}" || instructor ?= "${user.id}") && term = "${activeTerm.id}"`;
        }
      } else {
        // Admin or other role
        if (activeProgram?.id) {
          filter = `program = "${activeProgram.id}" && term = "${activeTerm.id}"`;
        } else {
          filter = `term = "${activeTerm.id}"`;
        }
      }

      const list = await pb.collection('courses').getFullList({ 
        sort: 'code',
        filter: filter,
        expand: 'program,instructor',
        requestKey: null
      });
      setCourses(list);
      
      const savedCourseId = localStorage.getItem(`medek_active_course_id_${user.id}_${activeTerm.id}`);
      if (savedCourseId) {
        const found = list.find(c => c.id === savedCourseId);
        if (found) {
          setActiveCourse(found);
          setLoading(false);
          return;
        }
      }
      
      if (list.length > 0) {
        setActiveCourse(list[0]);
        localStorage.setItem(`medek_active_course_id_${user.id}_${activeTerm.id}`, list[0].id);
      } else {
        setActiveCourse(null);
      }
    } catch (err) {
      console.error('Error loading courses in CourseContext:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeTerm, activeProgram]);

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
