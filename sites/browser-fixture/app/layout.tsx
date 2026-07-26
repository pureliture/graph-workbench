import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Graph Workbench Browser Fixture";
const description = "A deterministic browser fixture for selection-driven 3D graph workbench evidence.";

const trustedHostPattern = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i;

function metadataBaseFor(requestHeaders: Headers): URL {
  // Sites terminates TLS and supplies the request Host at its public edge. The
  // app deliberately ignores x-forwarded-host/x-forwarded-proto because those
  // headers are untrusted application input and must not choose an OG origin.
  const host = requestHeaders.get("host")?.trim() ?? "localhost";
  if (!trustedHostPattern.test(host)) return new URL("https://localhost");
  try {
    return new URL(`https://${host}`);
  } catch {
    return new URL("https://localhost");
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = metadataBaseFor(await headers());
  const image = new URL("/og.png", metadataBase).toString();

  return {
    title,
    description,
    metadataBase,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
