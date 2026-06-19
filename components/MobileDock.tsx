"use client";

import Link from "next/link";
import { CalendarDays, Gauge, Radio, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Arena", icon: Gauge, exact: true },
  { href: "/golden-ears", label: "Golden", icon: Sparkles },
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/leaderboard", label: "Board", icon: Radio }
];

export function MobileDock() {
  const pathname = usePathname();

  return (
    <nav className="mobile-dock" aria-label="Primary mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link href={item.href} key={item.href} data-active={active} aria-current={active ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
