import { getCharacterPack, type CharacterId } from "@/lib/characterPacks";

type PortraitProps = {
  character: CharacterId;
  size?: "hero" | "card" | "mini";
  className?: string;
};

/**
 * Original vector portraits for FitLog character packs. They are deliberately
 * self-contained visual signals — no official art, game UI assets, or source
 * illustrations are used.
 */
export default function CharacterPortrait({ character, size = "hero", className = "" }: PortraitProps) {
  const pack = getCharacterPack(character);
  const id = `portrait-${character}`;
  return (
    <svg
      viewBox="0 0 240 280"
      className={`character-portrait character-portrait--${size} ${className}`}
      role="img"
      aria-label={`${pack.name} 主题人物肖像`}
      style={{ "--portrait-primary": pack.accent, "--portrait-secondary": pack.accentSoft, "--portrait-ink": pack.ink } as React.CSSProperties}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--portrait-primary)" stopOpacity="0.92" />
          <stop offset="1" stopColor="var(--portrait-secondary)" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd6c1" />
          <stop offset="1" stopColor="#d9947d" />
        </linearGradient>
      </defs>
      <rect width="240" height="280" rx="24" fill={`url(#${id}-bg)`} />
      <path d="M-8 247 C52 187 73 246 121 203 C168 162 197 211 252 170 L252 288 L-8 288Z" fill="rgba(7, 7, 11, .24)" />
      <circle cx="188" cy="54" r="42" fill="rgba(255,255,255,.14)" />
      <g opacity=".24" stroke="var(--portrait-ink)" strokeWidth="1.5" fill="none">
        <path d="M-12 64 L248 18" />
        <path d="M-8 90 L246 44" />
        <path d="M-12 224 L244 179" />
      </g>
      {renderPortrait(character, id)}
    </svg>
  );
}

function Face({ id, x = 116, y = 90, hair = "#1c1717", eye = "#161616", beard = false }: { id: string; x?: number; y?: number; hair?: string; eye?: string; beard?: boolean }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 31} rx="40" ry="50" fill={`url(#${id}-skin)`} />
      <ellipse cx={x - 14} cy={y + 33} rx="4" ry="5" fill={eye} />
      <ellipse cx={x + 16} cy={y + 33} rx="4" ry="5" fill={eye} />
      <path d={`M${x - 11} ${y + 58} Q${x} ${y + 63} ${x + 12} ${y + 57}`} fill="none" stroke="#7c3d38" strokeWidth="2.2" strokeLinecap="round" />
      {beard && <path d={`M${x - 31} ${y + 52} Q${x} ${y + 96} ${x + 33} ${y + 52} Q${x} ${y + 81} ${x - 31} ${y + 52}`} fill="#4a352e" opacity=".9" />}
      <path d={`M${x - 44} ${y + 22} Q${x - 43} ${y - 30} ${x + 6} ${y - 19} Q${x + 45} ${y - 8} ${x + 40} ${y + 32} L${x + 23} ${y + 7} L${x + 5} ${y + 23} L${x - 12} ${y + 1} L${x - 33} ${y + 26}Z`} fill={hair} />
    </g>
  );
}

function Body({ color = "#1b2028", accent = "#ffffff", broad = false }: { color?: string; accent?: string; broad?: boolean }) {
  const width = broad ? 112 : 92;
  return (
    <g>
      <path d={`M${120 - width / 2} 222 Q${120 - width / 2 + 8} 158 120 151 Q${120 + width / 2 - 8} 158 ${120 + width / 2} 222 L${120 + width / 2} 280 L${120 - width / 2} 280Z`} fill={color} />
      <path d="M97 154 L120 180 L143 154 L133 212 L108 212Z" fill={accent} opacity=".92" />
    </g>
  );
}

function renderPortrait(character: CharacterId, id: string) {
  switch (character) {
    case "joker":
      return <g>
        <Body color="#0d0b10" accent="#ec2028" />
        <Face id={id} hair="#111116" eye="#1e0e0d" />
        <path d="M72 118 Q116 98 158 117 Q153 137 116 139 Q82 136 72 118Z" fill="#f7f6ef" />
        <path d="M76 118 Q95 126 116 113 Q137 126 155 117" fill="none" stroke="#111116" strokeWidth="3" />
        <path d="M38 164 L73 143 L67 195Z" fill="#f5f0e4" opacity=".88" />
        <rect x="162" y="126" width="28" height="42" rx="3" fill="#f6f0dc" transform="rotate(17 176 147)" />
        <path d="M176 133 l7 10 -7 10 -7 -10Z" fill="#ec2028" />
      </g>;
    case "queen":
      return <g>
        <Body color="#152239" accent="#7fb7df" />
        <Face id={id} hair="#5c3425" eye="#26364c" />
        <path d="M73 72 Q116 28 160 77 L155 99 Q119 73 76 103Z" fill="#6b412d" />
        <path d="M69 110 Q116 95 165 110 L155 122 Q117 114 78 122Z" fill="#8ec4e8" opacity=".9" />
        <circle cx="179" cy="144" r="24" fill="none" stroke="#8ec4e8" strokeWidth="5" />
        <circle cx="179" cy="144" r="7" fill="#e9f6ff" />
        <path d="M47 218 H194" stroke="#89bce1" strokeWidth="2" strokeDasharray="5 4" opacity=".75" />
      </g>;
    case "oracle":
      return <g>
        <Body color="#183f35" accent="#a9ef90" />
        <Face id={id} hair="#db8b3a" eye="#21341c" />
        <path d="M70 94 Q115 48 163 92 L159 111 Q116 90 76 112Z" fill="#e19b42" />
        <rect x="76" y="111" width="76" height="25" rx="10" fill="none" stroke="#c8ff9f" strokeWidth="5" />
        <path d="M112 123 H119" stroke="#c8ff9f" strokeWidth="4" />
        <path d="M54 110 Q42 91 60 77 M178 110 Q194 91 178 77" fill="none" stroke="#c8ff9f" strokeWidth="5" />
        <circle cx="184" cy="162" r="31" fill="none" stroke="#9cf58d" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M152 162 H216 M184 130 V194" stroke="#9cf58d" strokeWidth="1.5" opacity=".85" />
      </g>;
    case "violet":
      return <g>
        <Body color="#6c173e" accent="#f5c4d9" />
        <Face id={id} hair="#a8434e" eye="#5d2031" />
        <path d="M76 80 Q115 30 157 79 L169 141 L149 114 L145 82 Q118 59 88 95Z" fill="#a84755" />
        <path d="M143 82 Q191 109 184 182" fill="none" stroke="#ffbed7" strokeWidth="8" strokeLinecap="round" />
        <path d="M63 201 Q120 169 183 200" fill="none" stroke="#ffbed7" strokeWidth="4" />
        <path d="M174 110 l11 11 -11 11 -11 -11Z" fill="#f5c4d9" opacity=".9" />
      </g>;
    case "makoto":
      return <g>
        <Body color="#14254f" accent="#d8f6ff" />
        <Face id={id} hair="#26375f" eye="#23396e" />
        <path d="M76 66 Q115 35 162 76 L154 105 L131 86 L105 100 L84 89Z" fill="#2d3d67" />
        <circle cx="183" cy="60" r="24" fill="#eafcff" opacity=".92" />
        <path d="M166 58 Q183 76 199 59" stroke="#4d7dc9" strokeWidth="5" fill="none" />
        <path d="M43 210 Q108 183 183 214" fill="none" stroke="#a8eaff" strokeWidth="2" opacity=".75" />
      </g>;
    case "mitsuru":
      return <g>
        <Body color="#1b214d" accent="#f0e9ff" />
        <Face id={id} hair="#a3344f" eye="#452139" />
        <path d="M72 76 Q113 28 155 70 Q173 115 162 166 L145 124 L139 79 Q111 57 85 96Z" fill="#a73552" />
        <path d="M178 109 L187 205" stroke="#dbeeff" strokeWidth="3" />
        <path d="M165 143 H200" stroke="#dbeeff" strokeWidth="5" />
        <circle cx="184" cy="129" r="5" fill="#e9a1ba" />
      </g>;
    case "fuuka":
      return <g>
        <Body color="#1f5b58" accent="#b8f3e2" />
        <Face id={id} hair="#845c48" eye="#245e62" />
        <path d="M72 76 Q115 36 163 80 L155 121 L143 89 L116 103 L87 90Z" fill="#8b604a" />
        <path d="M68 108 Q49 85 61 67 M166 108 Q186 86 171 67" fill="none" stroke="#aaf3e0" strokeWidth="5" />
        <circle cx="61" cy="106" r="9" fill="#aaf3e0" />
        <circle cx="173" cy="106" r="9" fill="#aaf3e0" />
        <path d="M147 154 Q184 129 210 154 Q184 180 147 154Z" fill="none" stroke="#aaf3e0" strokeWidth="2" />
        <circle cx="179" cy="154" r="5" fill="#aaf3e0" />
      </g>;
    case "aigis":
      return <g>
        <Body color="#e6eff1" accent="#f2bd56" broad />
        <Face id={id} hair="#e0b356" eye="#d08425" />
        <path d="M74 79 Q115 28 159 77 L151 105 Q117 73 84 106Z" fill="#e5b95d" />
        <circle cx="149" cy="121" r="6" fill="#f2bd56" />
        <path d="M54 174 H82 V203 H54Z M158 174 H186 V203 H158Z" fill="#bedceb" stroke="#427394" strokeWidth="3" />
        <circle cx="184" cy="145" r="18" fill="none" stroke="#f2bd56" strokeWidth="4" />
      </g>;
    case "joel":
      return <g>
        <Body color="#4a5040" accent="#9b8661" broad />
        <Face id={id} hair="#60473a" eye="#3f3028" beard />
        <path d="M75 78 Q114 39 160 78 L151 97 L131 83 L104 94 L84 91Z" fill="#614839" />
        <path d="M56 162 L88 145 L95 218 L61 227Z" fill="#695742" />
        <path d="M53 146 L75 164" stroke="#b89b6b" strokeWidth="9" />
        <path d="M181 110 L206 142" stroke="#f7e5a7" strokeWidth="8" opacity=".9" />
        <circle cx="207" cy="143" r="14" fill="#f7e5a7" opacity=".22" />
      </g>;
    case "ellie":
      return <g>
        <Body color="#5e694e" accent="#d9a078" />
        <Face id={id} hair="#785344" eye="#4a302c" />
        <path d="M75 76 Q116 37 160 78 L151 101 L137 83 L106 100 L87 91Z" fill="#795445" />
        <path d="M153 82 Q184 111 175 158" fill="none" stroke="#795445" strokeWidth="11" strokeLinecap="round" />
        <path d="M52 160 L81 146 L89 225 L60 226Z" fill="#48513d" />
        <rect x="164" y="155" width="29" height="38" rx="3" fill="#f2e2c4" transform="rotate(9 178 174)" />
        <path d="M169 166 l17 10 M169 174 l13 8" stroke="#a56b57" strokeWidth="2" />
      </g>;
    case "abby":
      return <g>
        <Body color="#52636a" accent="#d9ded8" broad />
        <Face id={id} hair="#d5b066" eye="#36444a" />
        <path d="M75 76 Q115 37 160 78 L150 99 L132 82 L105 98 L85 91Z" fill="#d5b169" />
        <path d="M154 82 Q189 126 177 175" fill="none" stroke="#d5b169" strokeWidth="10" strokeLinecap="round" />
        <path d="M49 195 H86 M155 195 H192" stroke="#e5e1d7" strokeWidth="9" strokeDasharray="5 3" />
        <circle cx="186" cy="151" r="25" fill="none" stroke="#bd9a59" strokeWidth="7" />
        <circle cx="186" cy="151" r="10" fill="#52636a" />
      </g>;
  }
}
