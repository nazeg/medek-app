import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import pb from '../lib/pocketbase';
import { logAction, LOG_ACTIONS, LOG_CATEGORIES } from '../lib/logger';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserAssignments = async () => {
      if (!pb.authStore.isValid || !pb.authStore.model) {
        setUser(null);
        setLoading(false);
        return;
      }
      const record = pb.authStore.model;
      try {
        if (record.role === 'coordinator' || record.role === 'program_head') {
          const progs = await pb.collection('programs').getList(1, 20, {
            filter: `head = "${record.id}"`
          });
          if (progs.totalItems === 0) {
            pb.authStore.clear();
            setUser(null);
            setLoading(false);
            return;
          }
          record.departmentNames = progs.items.map(p => p.name).join(', ');
        } else if (record.role === 'instructor') {
          const courses = await pb.collection('courses').getList(1, 50, {
            filter: `instructor ~ "${record.id}"`,
            expand: 'program'
          });
          if (courses.totalItems === 0) {
            pb.authStore.clear();
            setUser(null);
            setLoading(false);
            return;
          }
          const progNames = [...new Set(courses.items.map(c => c.expand?.program?.name).filter(Boolean))];
          record.departmentNames = progNames.join(', ');
        }
        setUser({ ...record });
      } catch (err) {
        console.error('Error verifying assignments on startup:', err);
        setUser({ ...record });
      }
      setLoading(false);
    };
    checkUserAssignments();
  }, []);

  const login = useCallback(async (email, password) => {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const record = authData.record;

    if (record.role === 'coordinator' || record.role === 'program_head') {
      const progs = await pb.collection('programs').getList(1, 20, {
        filter: `head = "${record.id}"`
      });
      if (progs.totalItems === 0) {
        pb.authStore.clear();
        throw new Error('Sisteme giriş yapabilmeniz için bir bölüm/programa atanmış olmanız gerekmektedir. Lütfen sistem yöneticisiyle iletişime geçin.');
      }
      record.departmentNames = progs.items.map(p => p.name).join(', ');
    } else if (record.role === 'instructor') {
      const courses = await pb.collection('courses').getList(1, 50, {
        filter: `instructor ~ "${record.id}"`,
        expand: 'program'
      });
      if (courses.totalItems === 0) {
        pb.authStore.clear();
        throw new Error('Sisteme giriş yapabilmeniz için en az bir derse atanmış olmanız gerekmektedir. Lütfen bölüm başkanıyla iletişime geçin.');
      }
      const progNames = [...new Set(courses.items.map(c => c.expand?.program?.name).filter(Boolean))];
      record.departmentNames = progNames.join(', ');
    }

    setUser({ ...record });

    // Log the successful user login event
    logAction({
      action: LOG_ACTIONS.LOGIN,
      category: LOG_CATEGORIES.USER,
      details: `"${record.title ? record.title + ' ' : ''}${record.name || record.email}" adlı kullanıcı sisteme başarıyla giriş yaptı.`,
      metadata: {
        userId: record.id,
        email: record.email,
        role: record.role,
        department: record.departmentNames || null
      },
      user: record
    });

    return record;
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback((role) => user?.role === role, [user]);

  const value = useMemo(() => ({ user, setUser, login, logout, loading, hasRole }), [user, setUser, login, logout, loading, hasRole]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
