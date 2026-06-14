"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { tokenMeta } from "@/config/deployment";

const links = [
  { href: "/", label: "Swap" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/presale", label: "Presale" },
  { href: "/launchpad", label: "Launchpad" },
  { href: "/stake", label: "Stake" },
  { href: "/airdrop", label: "Airdrop" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="nav">
      <div className="nav-inner container">
        <Link href="/" className="brand">
          <span className="brand-mark">🐸</span>
          <span>{tokenMeta.symbol} DEX</span>
        </Link>
        <nav className="nav-links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "nav-link active" : "nav-link"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
    </header>
  );
}
