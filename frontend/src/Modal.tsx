import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "./components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
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
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const origin = document.querySelector<HTMLElement>(
            "[data-return-focus]",
          );
          const fallback = document.querySelector<HTMLElement>(
            ".topbar .button-primary:not(:disabled), .nav-heading button",
          );
          (origin ?? fallback)?.focus();
        }}
      >
        <div className="modal-header">
          <DialogClose className="button button-quiet">
            <ArrowLeft size={16} /> Back
          </DialogClose>
          <DialogTitle>{title}</DialogTitle>
          <span className="eyebrow">QUEST JOURNAL</span>
        </div>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
