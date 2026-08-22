import type { Metadata } from "next";
import { DenseGraphFixture } from "./DenseGraphFixture";

export const metadata: Metadata = {
  title: "Graph Workbench Density Fixture",
  description: "A deterministic 150-node browser fixture for density and selection regression coverage.",
};

export default function DensityPage() {
  return <DenseGraphFixture />;
}
