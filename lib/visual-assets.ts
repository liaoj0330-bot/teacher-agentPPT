const palettes = [
  {
    bg: "#F7FAFF",
    sky: "#EAF3FF",
    accent: "#2F7CFF",
    accent2: "#7C5CFF",
    ink: "#172033",
    soft: "#D9E7FF"
  },
  {
    bg: "#F5FBF8",
    sky: "#DFF7EF",
    accent: "#0E9F6E",
    accent2: "#2F7CFF",
    ink: "#102A28",
    soft: "#CBF3E6"
  },
  {
    bg: "#FFF9F4",
    sky: "#FFE7D6",
    accent: "#E9503F",
    accent2: "#FFB84D",
    ink: "#231815",
    soft: "#FFE2DA"
  },
  {
    bg: "#FBFAFF",
    sky: "#EFEAFF",
    accent: "#6D5DFC",
    accent2: "#2F7CFF",
    ink: "#18181B",
    soft: "#DED8FF"
  }
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitTitle(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= 12) {
    return [clean];
  }
  return [clean.slice(0, 12), clean.slice(12, 24)];
}

export function svgToDataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function createTopicVisualDataUri({
  title,
  subtitle,
  index = 0,
  topic
}: {
  title: string;
  subtitle?: string;
  index?: number;
  topic?: string;
}) {
  const palette = palettes[index % palettes.length];
  const lines = splitTitle(title || topic || "AI PPT").map(escapeXml);
  const subtitleText = escapeXml(subtitle || topic || "Research · Outline · Planning · Design");
  const tag = escapeXml(topic?.includes("杭州") ? "HANGZHOU" : topic?.includes("北京") ? "BEIJING" : "PPT AGENT");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.bg}"/>
      <stop offset="0.58" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="${palette.sky}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.accent}"/>
      <stop offset="1" stop-color="${palette.accent2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#1E293B" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="1200" height="675" rx="44" fill="url(#bg)"/>
  <g opacity="0.7">
    <circle cx="1008" cy="122" r="94" fill="${palette.soft}"/>
    <circle cx="1048" cy="90" r="34" fill="#FFFFFF"/>
    <path d="M690 554 C780 472 852 484 934 394 C1008 314 1082 330 1148 244" fill="none" stroke="${palette.accent}" stroke-width="18" stroke-linecap="round" opacity="0.20"/>
    <path d="M694 548 C770 490 852 502 926 418 C1008 328 1080 352 1144 276" fill="none" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="18 18"/>
  </g>
  <g transform="translate(680 120)" filter="url(#shadow)">
    <rect x="0" y="0" width="398" height="380" rx="34" fill="#FFFFFF" opacity="0.96"/>
    <rect x="42" y="48" width="132" height="92" rx="20" fill="${palette.soft}"/>
    <rect x="206" y="48" width="112" height="92" rx="20" fill="#F8FAFC"/>
    <rect x="42" y="176" width="276" height="28" rx="14" fill="url(#accent)" opacity="0.92"/>
    <rect x="42" y="232" width="306" height="22" rx="11" fill="#E5E7EB"/>
    <rect x="42" y="276" width="246" height="22" rx="11" fill="#E5E7EB"/>
    <rect x="42" y="320" width="184" height="22" rx="11" fill="#E5E7EB"/>
    <circle cx="306" cy="300" r="42" fill="${palette.accent}" opacity="0.12"/>
    <path d="M278 302 L298 322 L340 270" fill="none" stroke="${palette.accent}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(82 92)">
    <rect x="0" y="0" width="150" height="42" rx="21" fill="#FFFFFF" opacity="0.88"/>
    <circle cx="24" cy="21" r="8" fill="${palette.accent}"/>
    <text x="44" y="27" font-family="Microsoft YaHei, Arial" font-size="17" font-weight="700" fill="${palette.ink}">${tag}</text>
    ${lines
      .map(
        (line, lineIndex) =>
          `<text x="0" y="${154 + lineIndex * 62}" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="${palette.ink}">${line}</text>`
      )
      .join("")}
    <text x="3" y="312" font-family="Microsoft YaHei, Arial" font-size="24" font-weight="500" fill="#667085">${subtitleText}</text>
    <rect x="0" y="362" width="96" height="10" rx="5" fill="${palette.accent}"/>
    <rect x="112" y="362" width="52" height="10" rx="5" fill="${palette.accent2}" opacity="0.72"/>
  </g>
  <text x="82" y="618" font-family="Microsoft YaHei, Arial" font-size="20" font-weight="700" fill="#667085">AI PPT Agent · editable visual system</text>
</svg>`;

  return svgToDataUri(svg);
}

export function createBeijingVisualDataUri({
  title,
  subtitle,
  index = 0
}: {
  title: string;
  subtitle?: string;
  index?: number;
}) {
  return createTopicVisualDataUri({ title, subtitle, index, topic: "北京旅行攻略" });
}
