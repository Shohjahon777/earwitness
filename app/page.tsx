import { AppChrome } from "@/components/AppChrome";
import { RoundExperience } from "@/components/arena/RoundExperience";

export default function HomePage() {
  return (
    <AppChrome mode="arena">
      <RoundExperience mode="arena" />
    </AppChrome>
  );
}
