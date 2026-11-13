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
  const completed = quest.completionState !== "none";
  const description = quest.description || "No description yet.";
  const truncated = description.length > 320;
  const label = `${quest.title} — ${statusNames[status]}${completed && status === "locked" ? `, previously ${quest.completionState}` : ""}${externalTree ? ` — Open ${externalTree}` : ""}`;
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
            {statusNames[status]}
            {completed && status === "locked"
              ? ` · Previously ${quest.completionState}`
              : ""}
          </span>
          {truncated && <small>Click to read more</small>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
