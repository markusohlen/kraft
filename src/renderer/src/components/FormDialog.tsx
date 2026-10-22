import { useState, type FormEvent } from 'react'
import type { DialogRequest } from '../useRepositoryController'

export function FormDialog({ request, onClose }: { request: DialogRequest; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(request.fields.map((field) => [field.name, field.initial]))
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onClose()
    request.onSubmit(values)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <h2>{request.title}</h2>
        {request.description && <p className="muted">{request.description}</p>}
        {request.fields.map((field, index) =>
          field.type === 'checkbox' ? (
            <label key={field.name} className="checkbox-field">
              <input
                type="checkbox"
                checked={values[field.name] === true}
                onChange={(event) => setValues({ ...values, [field.name]: event.target.checked })}
              />
              {field.label}
            </label>
          ) : field.type === 'select' ? (
            <label key={field.name} className="text-field">
              <span>{field.label}</span>
              <select
                autoFocus={index === 0}
                value={String(values[field.name])}
                onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : field.type === 'textarea' ? (
            <label key={field.name} className="text-field">
              <span>{field.label}</span>
              <textarea
                autoFocus={index === 0}
                rows={8}
                value={String(values[field.name])}
                placeholder={field.placeholder}
                onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              />
            </label>
          ) : (
            <label key={field.name} className="text-field">
              <span>{field.label}</span>
              <input
                type={field.type}
                autoFocus={index === 0}
                value={String(values[field.name])}
                placeholder={field.placeholder}
                onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              />
            </label>
          )
        )}
        <div className="modal-buttons">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={request.danger ? 'danger-button' : 'primary'} autoFocus={request.fields.length === 0}>
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
