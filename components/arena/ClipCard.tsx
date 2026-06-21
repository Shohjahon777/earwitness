"use client";

import { Check, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Channel, Clip } from "@/lib/types";
import { WaveformPlayer } from "./WaveformPlayer";

export function ClipCard({
  channel,
  clip,
  active,
  dimmed,
  voted,
  heard,
  playCommand,
  onPlay,
  onPlayed,
  onEnded
}: {
  channel: Channel;
  clip: Clip;
  active: boolean;
  dimmed: boolean;
  voted: boolean;
  heard: boolean;
  playCommand: number;
  onPlay: (channel: Channel) => void;
  onPlayed: (channel: Channel) => void;
  onEnded: () => void;
}) {
  const [failed, setFailed] = useState(false);

  const channelColor = channel === "A" ? "var(--channel-a)" : "var(--channel-b)";
  const requestPlay = useCallback(() => {
    setFailed(false);
    onPlay(channel);
  }, [channel, onPlay]);

  useEffect(() => {
    if (playCommand > 0) requestPlay();
  }, [playCommand, requestPlay]);

  return (
    <section
      className="clip-card"
      data-active={active}
      data-dimmed={dimmed}
      data-nudge={voted}
      data-heard={heard}
      style={
        {
          "--channel-color": channelColor,
          "--nudge": channel === "A" ? "-6px" : "6px"
        } as React.CSSProperties
      }
      aria-label={`Channel ${channel} anonymized clip`}
    >
      <span className="channel-rail" aria-hidden="true" />
      <div className="clip-card-inner">
        <div className="channel-label">
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="channel-badge">{channel}</span>
            <span>
              Channel {channel}
              <span className="channel-subline">
                <span>Stack hidden until reveal</span>
                <span className="heard-pill" data-heard={heard}>
                  {heard ? <Check size={13} aria-hidden="true" /> : null}
                  {heard ? "Heard" : "Not heard"}
                </span>
              </span>
            </span>
          </span>
          <div className="transport-cluster">
            <span className="vu-meter" data-active={active} aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <i key={index} />
              ))}
            </span>
            <button
              type="button"
              data-channel-play={channel}
              className="icon-button"
              onClick={active ? onEnded : requestPlay}
              aria-label={active ? `Pause channel ${channel}` : `Play channel ${channel}`}
            >
              {active ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {failed ? (
          <div className="empty-state" role="alert" style={{ padding: 12 }}>
            <strong>Couldn&apos;t load this clip.</strong>
            <span className="muted">Retry channel {channel} to request the cached audio again.</span>
            <button className="secondary-btn" onClick={requestPlay}>
              <RotateCcw size={16} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : (
          <WaveformPlayer
            src={clip.url}
            color={channelColor}
            durationSec={clip.durationSec}
            playing={active}
            caption={clip.caption}
            label={`Channel ${channel}`}
            onProgress={(_, played) => {
              if (played) onPlayed(channel);
            }}
            onEnded={onEnded}
            onError={() => {
              setFailed(true);
              onEnded();
            }}
          />
        )}
      </div>
    </section>
  );
}
