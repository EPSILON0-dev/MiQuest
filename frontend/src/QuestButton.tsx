import { Tooltip } from "radix-ui";
import {
  Check,
  LockKeyhole,
  ShieldCheck,
  CircleAlert,
  ArrowUpRight,
} from "lucide-react";
import { QuestIcon } from "./icons";
import type { Quest } from "./model";
import { statusNames } from "./questStatus";
import { useI18n } from "./i18n";
export default function QuestButton({
  quest,
  status,
  onClick,
  className = "",
  externalTree,
}: {
  quest: Quest;
  status: string;
  onClick: () => void;
  className?: string;
  externalTree?: string;
}) {
  const t = useI18n();
  const completed = quest.completionState !== "none";
  const description = quest.description || t.noDescription;
  const truncated = description.length > 320;
  const label = `${quest.title} — ${t.status[status as keyof typeof t.status] ?? statusNames[status]}${completed && status === "locked" ? `, previously ${t.status[quest.completionState as keyof typeof t.status] ?? quest.completionState}` : ""}${externalTree ? ` — ${t.open} ${externalTree}` : ""}`;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`quest-node ${quest.milestone ? "milestone" : ""} ${status} ${completed ? quest.completionState : ""} ${className}`}
          onClick={onClick}
        >
          <QuestIcon name={quest.icon} size={quest.milestone ? 30 : 25} />
          {completed && (
            <Check
              className="completion-mark"
              size={23}
              strokeWidth={3.5}
              aria-hidden="true"
            />
          )}
          {quest.completionState === "overridden" && (
            <ShieldCheck
              className="override-mark"
              size={16}
              aria-hidden="true"
            />
          )}
          {status === "locked" && (
            <LockKeyhole className="lock-mark" size={14} aria-hidden="true" />
          )}
          {status === "in_progress" && (
            <span className="progress-mark" aria-hidden="true" />
          )}
          {status === "blocked" && (
            <CircleAlert
              className="blocked-mark"
              size={16}
              aria-hidden="true"
            />
          )}
          {externalTree && (
            <ArrowUpRight
              className="external-mark"
              size={13}
              aria-hidden="true"
            />
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="quest-tooltip"
          side="right"
          sideOffset={12}
          collisionPadding={12}
          avoidCollisions
        >
          <strong>{quest.title}</strong>
          <p>
            {truncated
              ? `${description.slice(0, 320).trimEnd()}…`
              : description}
          </p>
          <span className="tooltip-status">
            {t.status[status as keyof typeof t.status] ?? statusNames[status]}
            {completed && status === "locked"
              ? ` · ${t.status[quest.completionState as keyof typeof t.status] ?? quest.completionState}`
              : ""}
          </span>
          {truncated && <small>{t.readMore}</small>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
