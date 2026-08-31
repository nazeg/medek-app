import pb from './pocketbase';

export const LOG_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
  LOGIN: 'LOGIN',
};

export const LOG_CATEGORIES = {
  USER: 'Kullanıcı',
  FACULTY_DEPT: 'Fakülte/Bölüm',
  TERM: 'Dönem',
  COURSE: 'Ders',
  OUTCOMES: 'PÇ/DÇ',
  MATRIX: 'Matris',
  EXAM: 'Sınav',
  GRADE: 'Not',
  STUDENT: 'Öğrenci',
  SYSTEM: 'Sistem',
};

/**
 * Logs an action to PocketBase logs collection safely and asynchronously.
 * 
 * @param {Object} params
 * @param {string} params.action - CREATE | UPDATE | DELETE | IMPORT | EXPORT | LOGIN
 * @param {string} params.category - Module/Category name
 * @param {string} params.details - Human readable description of the action
 * @param {Object} [params.metadata] - Optional arbitrary structured metadata
 * @param {Object} [params.user] - Optional explicit user object override
 */
export async function logAction({ action, category, details, metadata = null, user = null }) {
  try {
    const authRecord = user || pb.authStore.record || pb.authStore.model;
    
    let userName = 'Sistem / Anonim';
    let userRole = 'unknown';
    let userId = null;

    if (authRecord) {
      userId = authRecord.id || null;
      userRole = authRecord.role || 'user';
      const title = authRecord.title ? `${authRecord.title} ` : '';
      userName = `${title}${authRecord.name || authRecord.email || 'Kullanıcı'}`.trim();
    }

    const payload = {
      user_name: userName,
      user_role: userRole,
      action: action || LOG_ACTIONS.UPDATE,
      category: category || LOG_CATEGORIES.SYSTEM,
      details: details || '',
    };

    if (userId) {
      payload.user = userId;
    }

    if (metadata && typeof metadata === 'object') {
      payload.metadata = metadata;
    }

    // Fire-and-forget log creation
    pb.collection('logs').create(payload).then(() => {
      console.log('[AuditLogger] Log saved successfully:', payload.action, payload.details);
    }).catch(err => {
      console.warn('[AuditLogger] Could not record log entry:', err?.message || err, payload);
    });
  } catch (err) {
    console.warn('[AuditLogger] Error preparing log:', err);
  }
}

export default {
  logAction,
  LOG_ACTIONS,
  LOG_CATEGORIES,
};
