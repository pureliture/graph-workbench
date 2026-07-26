import type { Metadata } from "next";
import { BrowserGraphFixture } from "./BrowserGraphFixture";

export const metadata: Metadata = {
  title: "Graph Workbench Browser Fixture",
  description: "A deterministic browser fixture for selection-driven 3D graph workbench evidence.",
};

export default function Home() {
  return <BrowserGraphFixture />;
}
