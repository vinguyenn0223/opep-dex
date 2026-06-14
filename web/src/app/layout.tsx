import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Decor } from "@/components/Decor";
import { Ticker } from "@/components/Ticker";
import "./globals.css";

const display = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const body = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "OPEPE DEX — Meme DEX on OPN Chain",
  description: "Swap, provide liquidity, join presales, stake, and claim airdrops on OPN Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          <Decor />
          <Nav />
          <Ticker />
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
