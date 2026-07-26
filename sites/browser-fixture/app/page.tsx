import type { Metadata } from "next";
import { BrowserGraphFixture } from "./BrowserGraphFixture";

export const metadata: Metadata = {
  title: "Graph Workbench Browser Fixture",
  description: "A full-viewport browser fixture for selection-driven 3D graph interaction and live evidence.",
};

export default function Home() {
  return <BrowserGraphFixture />;
}
