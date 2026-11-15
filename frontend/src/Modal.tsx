import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "./components/ui/dialog";
import { X } from "lucide-react";
import { QuestIcon } from "./icons";
import { useRef, type ReactNode } from "react";
import { useI18n } from "./i18n";
export default function Modal({
  title,
  children,
  onClose,
  icon,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  icon?: string;
  actions?: ReactNode;
}) {
  const t = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="modal-content"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
        onKeyDownCapture={(event) => {
          // A focused tooltip must not consume the modal's Escape shortcut.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const origin = document.querySelector<HTMLElement>(
            "[data-return-focus]",
          );
          const fallback = document.querySelector<HTMLElement>(".edit-switch");
          (origin ?? fallback)?.focus();
        }}
      >
        <div className="modal-header">
          {icon && (
            <span className="modal-quest-icon">
              <QuestIcon name={icon} size={20} />
            </span>
          )}
          <DialogTitle>{title}</DialogTitle>
          {actions}
          <DialogClose
            ref={closeRef}
            className="icon-button"
            aria-label={t.closeModal}
          >
            <X size={16} />
          </DialogClose>
        </div>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
