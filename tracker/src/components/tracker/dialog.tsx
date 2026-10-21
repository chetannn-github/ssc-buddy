import { LoaderCircle } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";

type DialogField = {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
};

type FormDialog = {
  kind: "form";
  title: string;
  description?: string;
  fields: DialogField[];
  confirmLabel?: string;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
};

type ConfirmDialog = {
  kind: "confirm";
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean | undefined;
  onConfirm: () => void | Promise<void>;
};

type DialogContextValue = {
  openForm: (dialog: Omit<FormDialog, "kind">) => void;
  confirm: (dialog: Omit<ConfirmDialog, "kind">) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useTrackerDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useTrackerDialog must be used inside TrackerDialogProvider");
  return context;
}

export function TrackerDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(FormDialog | ConfirmDialog) | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openForm = (next: Omit<FormDialog, "kind">) => {
    setValues(
      Object.fromEntries(next.fields.map((field) => [field.name, field.defaultValue ?? ""])),
    );
    setDialog({ ...next, kind: "form" });
  };

  const confirm = (next: Omit<ConfirmDialog, "kind">) => setDialog({ ...next, kind: "confirm" });
  const close = () => setDialog(null);

  return (
    <DialogContext.Provider value={{ openForm, confirm }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tracker-dialog-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121212] p-5 text-zinc-100 shadow-2xl"
          >
            <h2 id="tracker-dialog-title" className="text-lg font-semibold">
              {dialog.title}
            </h2>
            {dialog.description && (
              <p className="mt-1 text-sm text-zinc-400">{dialog.description}</p>
            )}

            {dialog.kind === "form" ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (isSubmitting) return;
                  setIsSubmitting(true);
                  Promise.all([
                    Promise.resolve(dialog.onConfirm(values)),
                    new Promise<void>((resolve) => window.setTimeout(resolve, 160)),
                  ])
                    .then(close)
                    .finally(() => setIsSubmitting(false));
                }}
              >
                {dialog.fields.map((field) => (
                  <label key={field.name} className="block text-sm text-zinc-300">
                    <span>{field.label}</span>
                    <input
                      autoFocus={field === dialog.fields[0]}
                      type={field.type ?? "text"}
                      min={field.min}
                      required
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      className="mt-1.5 h-10 w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-blue-400/70 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </label>
                ))}
                <DialogActions confirmLabel={dialog.confirmLabel ?? "Save"} onCancel={close} loading={isSubmitting} />
              </form>
            ) : (
              <div className="mt-5">
                <DialogActions
                  confirmLabel={dialog.confirmLabel ?? "Confirm"}
                  danger={dialog.danger}
                  onCancel={close}
                  loading={isSubmitting}
                  onConfirm={() => {
                    if (isSubmitting) return;
                    setIsSubmitting(true);
                    Promise.all([
                      Promise.resolve(dialog.onConfirm()),
                      new Promise<void>((resolve) => window.setTimeout(resolve, 160)),
                    ])
                      .then(close)
                      .finally(() => setIsSubmitting(false));
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

function DialogActions({
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
  loading = false,
}: {
  confirmLabel: string;
  danger?: boolean | undefined;
  onCancel: () => void;
  onConfirm?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        disabled={loading}
        onClick={onCancel}
        className="rounded-xl bg-white/8 px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/12"
      >
        Cancel
      </button>
      <button
        type={onConfirm ? "button" : "submit"}
        disabled={loading}
        onClick={onConfirm}
        className={`rounded-xl px-3 py-2 text-sm font-medium text-white transition ${
          danger ? "bg-red-500 hover:bg-red-400" : "bg-blue-500 hover:bg-blue-400"
        }`}
      >
        {loading && <LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" />}{confirmLabel}
      </button>
    </div>
  );
}
