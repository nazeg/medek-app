import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import pb from '../lib/pocketbase';
import { useAuth } from './AuthContext';

const ProgramContext = createContext(null);

export function ProgramProvider({ children }) {
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    if (!user) {
      setPrograms([]);
      setActiveProgram(null);
      setLoading(false);
      return;
    }
    
    try {
      let list = [];
      if (user.role === 'coordinator' || user.role === 'program_head') {
        const headPrograms = await pb.collection('programs').getFullList({ 
          sort: 'name',
          filter: `head = "${user.id}"`,
          expand: 'faculty'
        });
        if (headPrograms.length > 0) {
          list = headPrograms;
        } else if (user.role === 'coordinator' && user.faculty) {
          list = await pb.collection('programs').getFullList({ 
            sort: 'name',
            filter: `faculty = "${user.faculty}"`,
            expand: 'faculty'
          });
        } else {
          list = [];
        }
      } else if (user.role === 'instructor') {
        const coursesList = await pb.collection('courses').getFullList({
          filter: `instructor ~ "${user.id}" || instructor ?= "${user.id}"`,
          expand: 'program,program.faculty',
          requestKey: null
        });
        const assignedCourses = coursesList.filter(course => {
          if (!course.instructor) return false;
          if (Array.isArray(course.instructor)) {
            return course.instructor.includes(user.id);
          }
          return course.instructor === user.id;
        });
        const programMap = {};
        assignedCourses.forEach(c => {
          if (c.expand?.program) {
            programMap[c.expand.program.id] = c.expand.program;
          }
        });
        list = Object.values(programMap).sort((a, b) => a.name.localeCompare(b.name));
      } else if (user.role === 'admin') {
        list = await pb.collection('programs').getFullList({ sort: 'name', expand: 'faculty' });
      } else {
        list = await pb.collection('programs').getFullList({ sort: 'name', expand: 'faculty' });
      }
      setPrograms(list);
      
      // Determine default active program
      const savedProgId = localStorage.getItem('medek_active_program_id');
      if (savedProgId) {
        const found = list.find(p => p.id === savedProgId);
        if (found) {
          setActiveProgram(found);
          setLoading(false);
          return;
        }
      }
      
      // If no saved program or not found, pick the first one
      if (list.length > 0) {
        setActiveProgram(list[0]);
        localStorage.setItem('medek_active_program_id', list[0].id);
      } else {
        setActiveProgram(null);
      }
    } catch (err) {
      console.error('Error loading programs in ProgramContext:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const selectProgram = useCallback((progId) => {
    const found = programs.find(p => p.id === progId);
    if (found) {
      setActiveProgram(found);
      localStorage.setItem('medek_active_program_id', progId);
    } else if (progId === '') {
      setActiveProgram(null);
      localStorage.removeItem('medek_active_program_id');
    }
  }, [programs]);

  const value = useMemo(() => ({
    programs,
    activeProgram,
    selectProgram,
    loading,
    refreshPrograms: loadPrograms
  }), [programs, activeProgram, selectProgram, loading, loadPrograms]);

  return (
    <ProgramContext.Provider value={value}>
      {children}
    </ProgramContext.Provider>
  );
}

export const useProgram = () => useContext(ProgramContext);
