"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export type FormDialogField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "url" | "number" | "select";
  min?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};

type FormDialogProps = {
  title: string;
  description: string;
  submitLabel: string;
  fields: FormDialogField[];
  initialValues?: Partial<Record<string, string>>;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => boolean | void | Promise<boolean | void>;
};

export function FormDialog({
  title,
  description,
  submitLabel,
  fields,
  initialValues = {},
  onCancel,
  onSubmit,
}: FormDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.name, initialValues[field.name] || ""]),
    ),
  );
  const firstInputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (firstInputRef.current || submitRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((await onSubmit(values)) !== false) onCancel();
  }

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-dialog-title"
        aria-describedby="form-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <p className="eyebrow">新增內容</p>
        <h2 id="form-dialog-title">{title}</h2>
        <p id="form-dialog-description">{description}</p>
        {fields.map((field, index) => (
          <label key={field.name}>
            {field.label}
            {field.type === "select" ? (
              <select
                autoFocus={index === 0}
                value={values[field.name] || ""}
                required={field.required}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type={field.type || "text"}
                value={values[field.name] || ""}
                placeholder={field.placeholder}
                required={field.required}
                min={field.min}
                step={field.step}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            )}
          </label>
        ))}
        <footer>
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            取消
          </button>
          <button ref={submitRef} type="submit" className="dialog-primary">
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
