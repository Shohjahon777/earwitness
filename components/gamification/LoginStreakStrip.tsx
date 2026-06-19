"use client";

import { Flame, X } from "lucide-react";
import type { LoginReward } from "@/lib/types";

// Dismissible daily-login banner with a 7-day escalating-bonus strip. Loss aversion + a
// visible streak the user won't want to drop.
export function LoginStreakStrip({ reward, onDismiss }: { reward: LoginReward; onDismiss?: () => void }) {
  const today = Math.min(reward.newStreak, reward.schedule.length);

  return (
    <div className="login-strip" role="status">
      <div className="login-strip-head">
        <Flame size={18} aria-hidden="true" />
        <strong className="font-display">Day {reward.newStreak} streak — +{reward.coins} coins</strong>
        {reward.freezeUsed ? <span className="stat-pill">freeze used</span> : null}
        {onDismiss ? (
          <button className="icon-button login-strip-close" onClick={onDismiss} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="login-days">
        {reward.schedule.map((coins, i) => {
          const day = i + 1;
          return (
            <div className="login-day" data-done={day <= today} data-today={day === today} key={day}>
              <span className="font-mono login-day-n">D{day}</span>
              <span className="font-mono login-day-coins">{coins}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
