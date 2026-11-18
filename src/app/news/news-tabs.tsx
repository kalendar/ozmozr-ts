import { Tabs } from "@/components/ui";

export function NewsTabs({ active, allHref = "/news", unreadHref = "/news?show=unread" }: { active: string; allHref?: string; unreadHref?: string }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "all", label: "All", href: allHref },
        { key: "unread", label: "Unread", href: unreadHref },
        { key: "saved", label: "Saved", href: "/news/saved" },
        { key: "shared", label: "Shared with me", href: "/news/shared" },
      ]}
    />
  );
}
