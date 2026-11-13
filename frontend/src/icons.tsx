import { icons } from "./iconNames";
export function QuestIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const Icon = icons[name] ?? icons.compass;
  return <Icon size={size} aria-hidden="true" />;
}
