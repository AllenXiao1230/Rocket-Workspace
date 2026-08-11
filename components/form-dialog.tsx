"use client";

import { FormEvent, useState } from "react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

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
  const dialogRef = useDialogFocus<HTMLFormElement>(true, onCancel);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((await onSubmit(values)) !== false) onCancel();
  }

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        ref={dialogRef}
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-dialog-title"
        aria-describedby="form-dialog-description"
        tabIndex={-1}
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
                data-dialog-initial-focus={index === 0 || undefined}
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
                type={field.type || "text"}
                data-dialog-initial-focus={index === 0 || undefined}
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
          <button
            type="submit"
            className="dialog-primary"
            data-dialog-initial-focus={!fields.length || undefined}
          >
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
