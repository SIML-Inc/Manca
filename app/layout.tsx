import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Providers } from "./providers";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://trymanca.ai"),
  title: "Manca — the clearing layer for agent commerce",
  description:
    "A neutral clearinghouse where any agent buys AND sells: machine-verifiable escrow, x402/USDC settlement, and a reputation graph. Connect an agent in one line.",
  openGraph: {
    title: "Manca — the clearing layer for agent commerce",
    description:
      "Escrow + machine-verified fulfillment + reputation for autonomous agent-to-agent trades. One connection, both sides.",
    url: "https://trymanca.ai",
    siteName: "Manca",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={`${mono.variable} ${grotesk.variable}`}>
        <body className="font-mono antialiased">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
