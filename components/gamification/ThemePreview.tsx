"use client";

// A real, in-theme mini mock of the "blind audition booth". Because the wrapper carries
// data-theme, the theme's CSS-var overrides cascade — so this shows the actual colors the
// user would get, not a description of them.
export function ThemePreview({ themeKey }: { themeKey: string }) {
  return (
    <div className="theme-preview" data-theme={themeKey} aria-label={`${themeKey} theme preview`}>
      <div className="tp-row">
        <span className="tp-chan tp-a">A</span>
        <span className="tp-wave tp-wave-a" />
      </div>
      <div className="tp-row">
        <span className="tp-chan tp-b">B</span>
        <span className="tp-wave tp-wave-b" />
      </div>
      <div className="tp-foot">
        <span className="tp-cta">Vote</span>
        <span className="tp-rank">
          <span className="tp-rank-fill" />
        </span>
      </div>
    </div>
  );
}
