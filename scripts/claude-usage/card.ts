import type { ModelShare, UsageSummary } from "./model-share.ts";
import type { ModelFamily } from "./models.ts";

const card = { width: 300, height: 135 };
const bar = { x: 25, y: 34, width: 250, height: 8, gap: 2 };
const legend = { columnOffsets: [25, 170], centreBaseline: 85, widePitch: 26, tightPitch: 22, swatchRadius: 5 };

const familyColours: Record<ModelFamily, string> = {
  fable: "#61fcd7",
  opus: "#2dd7b4",
  sonnet: "#12b193",
  haiku: "#098b73",
  other: "#898781",
};

const thousandsAndMillions = [
  { suffix: "K", tenth: 100 },
  { suffix: "M", tenth: 100_000 },
];
const billions = { suffix: "B", tenth: 100_000_000 };

export const formatCompact = (count: number): string => {
  if (count < 1000) return String(count);

  const scale = thousandsAndMillions.find(({ tenth }) => Math.round(count / tenth) < 10_000) ?? billions;
  return `${Math.round(count / scale.tenth) / 10}${scale.suffix}`;
};

const toHundredths = (value: number): number => Math.round(value * 100) / 100;

const percentage = (share: number): string => `${(share * 100).toFixed(2)}%`;

const windowLabel = (weeks: number): string => (weeks === 1 ? "last week" : `last ${weeks} weeks`);

const legendLabel = (model: ModelShare): string => `${model.label} ${percentage(model.share)}`;

const renderSegments = (models: readonly ModelShare[]): string => {
  const drawable = bar.width - bar.gap * (models.length - 1);
  let x = bar.x;

  return models
    .map((model) => {
      const width = toHundredths(model.share * drawable);
      const segment = `<rect class="segment" x="${toHundredths(x)}" y="${bar.y}" width="${width}" height="${bar.height}" fill="${familyColours[model.family]}"/>`;
      x += width + bar.gap;
      return segment;
    })
    .join("\n    ");
};

const renderLegend = (models: readonly ModelShare[]): string => {
  const rows = Math.ceil(models.length / 2);
  const pitch = rows > 2 ? legend.tightPitch : legend.widePitch;
  const firstBaseline = legend.centreBaseline - (pitch * (rows - 1)) / 2;

  return models
    .map((model, index) => {
      const column = index < rows ? 0 : 1;
      const row = index - column * rows;
      const x = legend.columnOffsets[column];
      const baseline = firstBaseline + row * pitch;

      return [
        `<g class="entry" style="animation-delay: ${450 + row * 150}ms">`,
        `  <circle cx="${x + legend.swatchRadius}" cy="${baseline - 4}" r="${legend.swatchRadius}" fill="${familyColours[model.family]}"/>`,
        `  <text class="legend" x="${x + 15}" y="${baseline}">${legendLabel(model)}</text>`,
        `</g>`,
      ].join("\n  ");
    })
    .join("\n  ");
};

const describe = (summary: UsageSummary): string =>
  summary.models.length === 0
    ? `No usage in the ${windowLabel(summary.weeks)}.`
    : `${summary.models.map(legendLabel).join(", ")}. ${formatCompact(summary.outputTokens)} output tokens in the ${windowLabel(summary.weeks)}.`;

const renderBody = (summary: UsageSummary): string =>
  summary.models.length === 0
    ? `<text class="empty" x="${card.width / 2}" y="${legend.centreBaseline - 10}" text-anchor="middle">No usage in the ${windowLabel(summary.weeks)}</text>`
    : [
        `<text class="meta" x="${bar.x + bar.width}" y="24" text-anchor="end">${formatCompact(summary.outputTokens)} output tokens · ${windowLabel(summary.weeks)}</text>`,
        `<g clip-path="url(#bar)">`,
        `  ${renderSegments(summary.models)}`,
        `</g>`,
        renderLegend(summary.models),
      ].join("\n  ");

export const renderCard = (summary: UsageSummary): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}" viewBox="0 0 ${card.width} ${card.height}" fill="none" role="img" aria-labelledby="card-title card-description">
  <title id="card-title">Claude Code model usage</title>
  <desc id="card-description">${describe(summary)}</desc>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif; }
    .title { font-size: 11px; font-weight: 600; fill: #64ffda; }
    .meta { font-size: 10px; fill: #ffffff; }
    .legend, .empty { font-size: 11px; fill: #b388ff; }
    .reveal { animation: reveal 1s ease-in-out forwards; }
    .entry { opacity: 0; animation: appear 0.3s ease-in-out forwards; }
    @keyframes reveal { from { width: 0; } to { width: ${bar.width}px; } }
    @keyframes appear { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .reveal { animation: none; }
      .entry { opacity: 1; animation: none; }
    }
  </style>
  <defs>
    <linearGradient id="surface" gradientTransform="rotate(45)" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f0c29"/>
      <stop offset="50%" stop-color="#302b63"/>
      <stop offset="100%" stop-color="#24243e"/>
    </linearGradient>
    <clipPath id="bar">
      <rect class="reveal" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${bar.height / 2}"/>
    </clipPath>
  </defs>
  <rect x="0.5" y="0.5" width="${card.width - 1}" height="${card.height - 1}" rx="4.5" fill="url(#surface)"/>
  <text class="title" x="${bar.x}" y="24">Claude Code</text>
  ${renderBody(summary)}
</svg>
`;
