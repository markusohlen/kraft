import type { RepositoryController } from '../useRepositoryController'

export function Toasts({ controller }: { controller: RepositoryController }) {
  return (
    <div className="toasts">
      {controller.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <pre className="toast-text">{toast.text}</pre>
          <div className="toast-buttons">
            {toast.action && (
              <button
                className="link-button"
                onClick={() => {
                  controller.dismissToast(toast.id)
                  toast.action!.run()
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button className="icon-button" title="Dismiss" onClick={() => controller.dismissToast(toast.id)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
