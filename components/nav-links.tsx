"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "总览" },
  { href: "/week", label: "本周任务" },
  { href: "/okrs", label: "OKR 编辑" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-[#f7f1e6] text-ink"
                : "text-[#d9ccb6] hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
