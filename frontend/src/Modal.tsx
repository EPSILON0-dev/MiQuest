import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "./components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { QuestIcon } from "./icons";
import type { ReactNode } from "react";
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
          <DialogClose className="button button-quiet">
            <ArrowLeft size={16} /> Back
          </DialogClose>
          {icon && (
            <span className="modal-quest-icon">
              <QuestIcon name={icon} size={20} />
            </span>
          )}
          <DialogTitle>{title}</DialogTitle>
          {actions}
        </div>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
