import { getShareCard } from "@/lib/server/data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getShareCard(id);
  const score = data.stats.score ? `${data.stats.score}/5` : `${data.stats.accuracy}%`;
  const label = data.stats.score ? "Daily score" : "AI-detection";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="brand" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#3DA9FC"/>
      <stop offset="1" stop-color="#FF715B"/>
    </linearGradient>
    <radialGradient id="blue" cx="16%" cy="4%" r="70%">
      <stop offset="0" stop-color="#3DA9FC" stop-opacity=".38"/>
      <stop offset="1" stop-color="#1E1C26" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="coral" cx="98%" cy="18%" r="72%">
      <stop offset="0" stop-color="#FF715B" stop-opacity=".30"/>
      <stop offset="1" stop-color="#1E1C26" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#1E1C26"/>
  <rect width="1200" height="630" fill="url(#blue)"/>
  <rect width="1200" height="630" fill="url(#coral)"/>
  <rect x="42" y="42" width="1116" height="546" rx="18" fill="none" stroke="rgba(242,240,234,.16)"/>
  <circle cx="86" cy="84" r="15" fill="url(#brand)"/>
  <text x="118" y="96" fill="#F2F0EA" font-family="Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="4">EARWITNESS</text>
  <text x="72" y="268" fill="#FFC94D" font-family="Arial, sans-serif" font-size="154" font-weight="900">${escapeXml(score)}</text>
  <text x="80" y="332" fill="#F2F0EA" font-family="Arial, sans-serif" font-size="48" font-weight="800">${escapeXml(label)}</text>
  <text x="80" y="386" fill="#9A98A4" font-family="Arial, sans-serif" font-size="30">${escapeXml(data.tagline)}</text>
  <text x="80" y="532" fill="#F2F0EA" font-family="Arial, sans-serif" font-size="28">${escapeXml(data.stats.handle)} · streak ${data.stats.streak}</text>
  <text x="862" y="532" fill="#FFC94D" font-family="Arial, sans-serif" font-size="30" font-weight="800">Can you beat it?</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=300"
    }
  });
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
