import type { Metadata } from "next";
import { AppChrome } from "@/components/AppChrome";
import { ProfileView } from "@/components/gamification/ProfileView";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Your ear rank, coins, quests, and achievements on Earwitness.",
};

export default function ProfilePage() {
  return (
    <AppChrome>
      <ProfileView />
    </AppChrome>
  );
}
