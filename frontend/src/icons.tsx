import { emojiIcons, icons } from "./iconNames";
export function QuestIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  if (emojiIcons.includes(name)) {
    return (
      <span className="quest-emoji" aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>
        {name.slice(6)}
      </span>
    );
  }
  const Icon = icons[name] ?? icons.compass;
  return <Icon size={size} aria-hidden="true" />;
}
