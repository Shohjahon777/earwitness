"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { LoginStreakStrip } from "./LoginStreakStrip";
import type { LoginReward } from "@/lib/types";

// Loads the gamification profile into the store once per mount, and surfaces the
// daily-login bonus banner when one was just claimed. Renders only the (dismissible) banner.
export function SessionBoot() {
  const setProfile = useSessionStore((s) => s.setProfile);
  const [login, setLogin] = useState<LoginReward | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const me = await getMe();
        if (!alive) return;
        setProfile(me);
        if (me.theme) document.documentElement.setAttribute("data-theme", me.theme);
        if (me.loginReward && me.loginReward.coins > 0) setLogin(me.loginReward);
      } catch {
        // offline / no DB — leave defaults
      }
    })();
    return () => {
      alive = false;
    };
  }, [setProfile]);

  if (!login) return null;
  return <LoginStreakStrip reward={login} onDismiss={() => setLogin(null)} />;
}
