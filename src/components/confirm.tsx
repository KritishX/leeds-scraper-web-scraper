import { useEffect, useId, useRef, useState } from "react";

type Request = {
  title: string;
  text: string;
  action: string;
  resolve: (confirmed: boolean) => void;
};

// `confirm(title, text, action)` opens a modal dialog and resolves to true
// only when the action button is chosen. Render `dialog` once in the page.
export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = (title: string, text: string, action = "Delete") =>
    new Promise<boolean>((resolve) =>
      setRequest({ title, text, action, resolve }),
    );
  const dialog = request && (
    <ConfirmDialog
      {...request}
      onClose={(confirmed) => {
        request.resolve(confirmed);
        setRequest(null);
      }}
    />
  );
  return [dialog, confirm] as const;
}

// showModal() makes the rest of the page inert (focus stays in the dialog) and
// Escape cancels; focus starts on Cancel and returns to the trigger on close.
function ConfirmDialog({
  title,
  text,
  action,
  onClose,
}: Omit<Request, "resolve"> & { onClose: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancel.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={id + "title"}
      aria-describedby={id + "text"}
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
    >
      <h2 id={id + "title"}>{title}</h2>
      <p id={id + "text"}>{text}</p>
      <div className="button-row">
        <button ref={cancel} className="btn" onClick={() => onClose(false)}>
          Cancel
        </button>
        <button className="btn danger" onClick={() => onClose(true)}>
          {action}
        </button>
      </div>
    </dialog>
  );
}
