"use client";

import { create } from "zustand";

interface SessionState {
  accuracy: number;
  streak: number;
  votes: number;
  setSession: (session: { accuracy: number; streak: number; votes: number }) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accuracy: 68,
  streak: 3,
  votes: 24,
  setSession: (session) => set(session)
}));
