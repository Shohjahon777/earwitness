import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { RoundExperience } from "@/components/arena/RoundExperience";

export const metadata: Metadata = {
  title: "Golden ears"
};

export default function GoldenEarsPage() {
  return (
    <AppChrome mode="golden-ears">
      <RoundExperience mode="golden-ears" />
    </AppChrome>
  );
}
