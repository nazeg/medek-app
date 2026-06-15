import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import pb from '../lib/pocketbase';

const TermContext = createContext(null);

export function TermProvider({ children }) {
  const [terms, setTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTerms = useCallback(async () => {
    try {
      const list = await pb.collection('terms').getFullList({ sort: '-name' });
      setTerms(list);
      
      // Determine default active term
      const savedTermId = localStorage.getItem('medek_active_term_id');
      if (savedTermId) {
        const found = list.find(t => t.id === savedTermId);
        if (found) {
          setActiveTerm(found);
          setLoading(false);
          return;
        }
      }
      
      // If no saved term or not found, pick the latest one
      if (list.length > 0) {
        setActiveTerm(list[0]);
        localStorage.setItem('medek_active_term_id', list[0].id);
      }
    } catch (err) {
      console.error('Error loading terms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  const selectTerm = useCallback((termId) => {
    const found = terms.find(t => t.id === termId);
    if (found) {
      setActiveTerm(found);
      localStorage.setItem('medek_active_term_id', termId);
    }
  }, [terms]);

  const value = useMemo(() => ({
    terms,
    activeTerm,
    selectTerm,
    loading,
    refreshTerms: loadTerms
  }), [terms, activeTerm, selectTerm, loading, loadTerms]);

  return (
    <TermContext.Provider value={value}>
      {children}
    </TermContext.Provider>
  );
}

export const useTerm = () => useContext(TermContext);
