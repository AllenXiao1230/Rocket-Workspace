"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type DialogField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "url";
};

type FormDialogProps = {
  title: string;
  description: string;
  submitLabel: string;
  fields: DialogField[];
  initialValues?: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => boolean | void;
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

  useEffect(() => {
    firstInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSubmit(values) !== false) onCancel();
  }

  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={onCancel}
    >
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
            <input
              ref={index === 0 ? firstInputRef : undefined}
              type={field.type || "text"}
              value={values[field.name] || ""}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <footer>
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="dialog-primary">
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
