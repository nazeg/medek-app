import { createContext, useContext, useState, useEffect } from 'react';

const AlertConfirmContext = createContext(null);

export function useAlertConfirm() {
  return useContext(AlertConfirmContext);
}

export function AlertConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { type: 'alert' | 'confirm', message, title, resolve, alertType: 'success' | 'error' | 'info' }

  // Keyboard navigation: Escape to cancel, Enter to confirm
  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (dialog.type === 'confirm') {
          dialog.resolve(false);
        } else {
          dialog.resolve();
        }
        setDialog(null);
      } else if (e.key === 'Enter') {
        if (dialog.type === 'confirm') {
          dialog.resolve(true);
        } else {
          dialog.resolve();
        }
        setDialog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  const customAlert = (message, title = 'Bilgi', alertType = 'info') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'alert',
        message,
        title,
        alertType,
        resolve,
      });
    });
  };

  const customConfirm = (message, title = 'Onay') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        message,
        title,
        resolve,
      });
    });
  };

  return (
    <AlertConfirmContext.Provider value={{ alert: customAlert, confirm: customConfirm }}>
      {children}
      {dialog && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in"
          onMouseDown={(e) => { e.currentTarget.dataset.clicked = e.target === e.currentTarget ? 'true' : 'false'; }}
          onClick={(e) => {
            if (e.target === e.currentTarget && e.currentTarget.dataset.clicked === 'true') {
              if (dialog.type === 'confirm') {
                dialog.resolve(false);
              } else {
                dialog.resolve();
              }
              setDialog(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-outline-variant animate-scale-up">
            <div className="p-6">
              <div className="flex items-start gap-4">
                {dialog.type === 'confirm' ? (
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex-shrink-0 flex items-center justify-center text-amber-600">
                    <span className="material-symbols-outlined text-2xl font-bold">help</span>
                  </div>
                ) : dialog.alertType === 'error' ? (
                  <div className="w-12 h-12 rounded-full bg-red-50 flex-shrink-0 flex items-center justify-center text-red-600">
                    <span className="material-symbols-outlined text-2xl font-bold">error</span>
                  </div>
                ) : dialog.alertType === 'success' ? (
                  <div className="w-12 h-12 rounded-full bg-green-50 flex-shrink-0 flex items-center justify-center text-green-600">
                    <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex-shrink-0 flex items-center justify-center text-blue-600">
                    <span className="material-symbols-outlined text-2xl font-bold">info</span>
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-on-surface mb-1">
                    {dialog.title}
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                    {dialog.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              {dialog.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => {
                      dialog.resolve(false);
                      setDialog(null);
                    }}
                    className="px-4 py-2 border border-outline-variant rounded-xl text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={() => {
                      dialog.resolve(true);
                      setDialog(null);
                    }}
                    className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary-container transition-all active:scale-[0.98]"
                  >
                    Evet
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    dialog.resolve();
                    setDialog(null);
                  }}
                  className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary-container transition-all active:scale-[0.98]"
                >
                  Tamam
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AlertConfirmContext.Provider>
  );
}
