import { avatarPalette, type AvatarMood } from "@/lib/avatar-model";

export function Avatar({
  name,
  mood,
  size = 60,
}: {
  name: string;
  mood: AvatarMood;
  size?: number;
}) {
  const model = avatarPalette(name, mood);
  if (!model.known) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size }} aria-label={name}>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  const {
    label,
    c,
    f,
    show,
    mouth,
    bob,
    bobDur,
    blink,
    openOp,
    closedOp,
    hlOp,
    cheekOp,
    blockedShow,
    idleShow,
    orange,
    zz,
  } = model;

  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label={label} style={{display: "block", overflow: "hidden", borderRadius: "28%"}}>
          <rect x="0" y="0" width="64" height="64" fill={c.tile}></rect>
          <g>
            <animateTransform attributeName="transform" type="translate" values={bob} dur={bobDur} begin={f.blinkBegin} repeatCount="indefinite"></animateTransform>

            <g display={show.roger}>
              <path d="M14 64 V50 Q14 43 22 42 H42 Q50 43 50 50 V64 Z" fill={c.body}></path>
              <rect x="13" y="42" width="10" height="3.5" rx="1.5" fill="#FCC419"></rect>
              <rect x="41" y="42" width="10" height="3.5" rx="1.5" fill="#FCC419"></rect>
              <path d="M32 44 V64" stroke={c.dark} strokeWidth="1.4"></path>
              <circle cx="35" cy="50" r="1.3" fill="#FCC419"></circle>
              <circle cx="35" cy="56" r="1.3" fill="#FCC419"></circle>
              <g>
                <animateTransform attributeName="transform" type="rotate" values="0 46 49;-8 46 49;0 46 49" dur="2.4s" repeatCount="indefinite"></animateTransform>
                <path d="M46 49 L57 37" stroke={c.body} strokeWidth="5" strokeLinecap="round"></path>
                <circle cx="57.5" cy="36.5" r="3.2" fill={c.dark}></circle>
                <path d="M58.5 35.5 L62 32" stroke={c.dark} strokeWidth="2.4" strokeLinecap="round"></path>
              </g>
              <rect x="29" y="38" width="6" height="5" fill={c.dark}></rect>
              <rect x="18" y="17" width="28" height="23" rx="8" fill={c.body}></rect>
              <rect x="21" y="23" width="22" height="14" rx="5" fill="#DCE4FF"></rect>
              <path d="M15 19 Q16 6 32 6 Q48 6 49 19 Z" fill={c.dark}></path>
              <path d="M17 18.5 H47 L44.5 22.5 H19.5 Z" fill="#11162B"></path>
              <circle cx="32" cy="12.5" r="2.4" fill="#FCC419"></circle>
            </g>

            <g display={show.chopper}>
              <path d="M9 64 V51 Q9 41 21 39 H43 Q55 41 55 51 V64 Z" fill="#232A3B"></path>
              <path d="M25 39 L32 53 L39 39 Z" fill="#FFFFFF"></path>
              <path d="M30.6 41 H33.4 L34.6 51 L32 56 L29.4 51 Z" fill={c.dark}></path>
              <path d="M25 39 L29.5 52 L23 47 Z M39 39 L34.5 52 L41 47 Z" fill="#161B28"></path>
              <path d="M44 47 L49 47 L47.5 44.5 Z" fill="#FFFFFF"></path>
              <rect x="28" y="33" width="8" height="7" fill="#868E96"></rect>
              <rect x="19" y="10" width="26" height="25" rx="8" fill={c.body}></rect>
              <rect x="16.5" y="18" width="3.5" height="8" rx="1.75" fill="#868E96"></rect>
              <rect x="44" y="18" width="3.5" height="8" rx="1.75" fill="#868E96"></rect>
              <path d="M22 13 Q32 8 42 13" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.7"></path>
            </g>

            <g display={show.ap5}>
              <g fill={c.dark} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="5.5" fontWeight="500">
                <text x="3" y="10">01<animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"></animate></text>
                <text x="6" y="17">10<animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="0.6s" repeatCount="indefinite"></animate></text>
                <text x="2" y="24">11<animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="1.2s" repeatCount="indefinite"></animate></text>
              </g>
              <path d="M14 64 V47 Q14 41 20 41 H44 Q50 41 50 47 V64 Z" fill={c.body}></path>
              <rect x="26" y="44" width="12" height="3" rx="1.5" fill={c.dark}></rect>
              <rect x="29" y="35" width="6" height="7" fill={c.dark}></rect>
              <path d="M32 10 V4.5" stroke={c.dark} strokeWidth="2" strokeLinecap="round"></path>
              <circle cx="32" cy="4" r="2" fill="#B2F2BB">
                <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite"></animate>
              </circle>
              <circle cx="15.5" cy="23" r="2.6" fill={c.dark}></circle>
              <circle cx="48.5" cy="23" r="2.6" fill={c.dark}></circle>
              <rect x="16" y="10" width="32" height="27" rx="9" fill={c.body}></rect>
              <rect x="20" y="15" width="24" height="17" rx="5" fill="#EBFBEE"></rect>
              <rect x="8" y="50" width="48" height="13" rx="3" fill="#343A40"></rect>
              <g fill="#868E96">
                <rect x="11" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="16.5" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="22" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="27.5" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="33" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="38.5" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="44" y="52.5" width="4" height="2.6" rx="0.6"></rect><rect x="49.5" y="52.5" width="4" height="2.6" rx="0.6"></rect>
                <rect x="11" y="56.5" width="6" height="2.6" rx="0.6"></rect><rect x="18.5" y="56.5" width="27" height="2.6" rx="0.6"></rect><rect x="47" y="56.5" width="6.5" height="2.6" rx="0.6"></rect>
              </g>
              <rect x="27.5" y="52.5" width="4" height="2.6" rx="0.6" fill="#8CE99A">
                <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="0.8s" repeatCount="indefinite"></animate>
              </rect>
              <circle cx="22" cy="51" r="3.4" fill={c.dark}>
                <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0;0 0" dur="0.5s" repeatCount="indefinite"></animateTransform>
              </circle>
              <circle cx="42" cy="51" r="3.4" fill={c.dark}>
                <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -2;0 0" dur="0.5s" repeatCount="indefinite"></animateTransform>
              </circle>
            </g>

            <g display={show.ig11}>
              <path d="M8 64 V48 Q8 38 20 36 H44 Q56 38 56 48 V64 Z" fill={c.dark}></path>
              <path d="M22 40 H42 V46 Q32 50 22 46 Z" fill={c.body} opacity="0.55"></path>
              <rect x="27" y="31" width="10" height="6" fill={c.dark}></rect>
              <rect x="17" y="8" width="30" height="25" rx="10" fill={c.body}></rect>
              <rect x="19.5" y="16" width="25" height="9" rx="4.5" fill="#0B3D30"></rect>
              <path d="M27 29 H37 M28.5 31 H35.5" stroke="#0B3D30" strokeWidth="1.2" strokeLinecap="round"></path>
              <path d="M32 8 V4" stroke={c.dark} strokeWidth="2" strokeLinecap="round"></path>
              <circle cx="32" cy="3.5" r="1.8" fill="#C3FAE8">
                <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"></animate>
              </circle>
              <path d="M4 41 L18 37 L32 41 V51 Q32 60 18 64.5 Q4 60 4 51 Z" fill={c.body} stroke="#FFFFFF" strokeWidth="1.6"></path>
              <path d="M18 42 V60 M9 48 H27" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.85"></path>
              <path d="M7 44 L12 42.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round">
                <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.8;0.88;1" dur="3.5s" repeatCount="indefinite"></animate>
              </path>
            </g>

            <g display={show.k2so}>
              <rect x="20" y="47" width="24" height="17" rx="5" fill={c.body}></rect>
              <rect x="16" y="18" width="32" height="27" rx="10" fill={c.body}></rect>
              <path d="M14 31 Q14 10 32 10 Q50 10 50 31 V35 H46 V26 Q46 17 32 17 Q18 17 18 26 V35 H14 Z" fill="#8B5A2B"></path>
              <rect x="13" y="29" width="6" height="12" rx="3" fill="#7A4B22"></rect>
              <rect x="45" y="29" width="6" height="12" rx="3" fill="#7A4B22"></rect>
              <path d="M18 19 H46" stroke="#5C3B1A" strokeWidth="2.2"></path>
              <circle cx="26" cy="19" r="5" fill="#A5D8FF" stroke="#495057" strokeWidth="2"></circle>
              <circle cx="38" cy="19" r="5" fill="#A5D8FF" stroke="#495057" strokeWidth="2"></circle>
              <path d="M24 17.5 l2 -1.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"></path>
              <path d="M36 17.5 l2 -1.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"></path>
              <g>
                <animateTransform attributeName="transform" type="rotate" values="0 41 50;-10 41 50;0 41 50" dur="1.4s" repeatCount="indefinite"></animateTransform>
                <path d="M40 49 L53 57 L50 60 L38 52 Z" fill="#F1F3F5"></path>
              </g>
              <path d="M19 45 Q32 51 45 45 L45 49 Q32 55 19 49 Z" fill="#F8F9FA"></path>
            </g>

            <g display={show.yoda}>
              <path d="M8 64 V56 Q12 47 22 45 L32 57 L42 45 Q52 47 56 56 V64 Z" fill={c.dark}></path>
              <path d="M26 13 L21 4 M32 11 V2 M38 13 L43 4" stroke={c.body} strokeWidth="1.8" strokeLinecap="round"></path>
              <circle cx="21" cy="4" r="2" fill="#FFE066"><animate attributeName="opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite"></animate></circle>
              <circle cx="32" cy="2.5" r="2" fill="#FFE066"><animate attributeName="opacity" values="0.35;1;0.35" dur="2.2s" repeatCount="indefinite"></animate></circle>
              <circle cx="43" cy="4" r="2" fill="#FFE066"><animate attributeName="opacity" values="1;0.35;1" dur="2.2s" begin="0.7s" repeatCount="indefinite"></animate></circle>
              <ellipse cx="32" cy="28" rx="15" ry="17" fill={c.body}></ellipse>
              <path d="M22 18 Q32 14 42 18" fill="none" stroke={c.dark} strokeWidth="1" opacity="0.35"></path>
              <path d="M23 21 Q32 18 41 21" fill="none" stroke={c.dark} strokeWidth="1" opacity="0.3"></path>
              <path d="M19 33 Q20 56 32 61 Q44 56 45 33 Q39 41 32 41 Q25 41 19 33 Z" fill="#F1F3F5"></path>
              <path d="M24.5 37 Q32 32.5 39.5 37 Q32 39.5 24.5 37 Z" fill="#FFFFFF"></path>
              <path d="M22.5 23 Q26.5 20.5 30.5 23 M33.5 23 Q37.5 20.5 41.5 23" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round"></path>
              <circle cx="27" cy="28" r="4.6" fill="#FFFFFF" fillOpacity="0.25" stroke="#495057" strokeWidth="1.2"></circle>
              <circle cx="37" cy="28" r="4.6" fill="#FFFFFF" fillOpacity="0.25" stroke="#495057" strokeWidth="1.2"></circle>
              <path d="M31.6 28 H32.4" stroke="#495057" strokeWidth="1.2"></path>
            </g>

            <g display={show.cartier}>
              <path d="M8 64 V54 Q10 42 22 40 H42 Q54 42 56 54 V64 Z" fill={c.dark}></path>
              <path d="M27 40 L32 47 L37 40" fill="none" stroke="#FFFFFF" strokeWidth="1.4" opacity="0.6"></path>
              <rect x="28" y="34" width="8" height="7" fill={c.body}></rect>
              <circle cx="19.5" cy="25" r="3" fill={c.body}></circle>
              <circle cx="44.5" cy="25" r="3" fill={c.body}></circle>
              <circle cx="32" cy="24" r="13" fill={c.body}></circle>
              <path d="M19.5 21 Q18 26 21 30 Q21 25 22.5 22 Z M44.5 21 Q46 26 43 30 Q43 25 41.5 22 Z" fill="#E9ECEF"></path>
              <path d="M18 18 Q19 8 32 8 Q46 8 47 15 Q50.5 16 50.5 18.5 Q40 17.5 18 18.5 Z" fill="#7C6A55"></path>
              <path d="M21 14 Q32 11 44 14" fill="none" stroke="#5E5040" strokeWidth="0.9"></path>
              <path d="M24 19.5 Q27 18.5 30 19.5 M34 19.5 Q37 18.5 40 19.5" fill="none" stroke="#E9ECEF" strokeWidth="1.6" strokeLinecap="round"></path>
              <path d="M25.5 29 Q32 25.5 38.5 29 Q32 31 25.5 29 Z" fill="#F1F3F5"></path>
              <circle cx="15" cy="52" r="3.6" fill={c.body}></circle>
              <circle cx="49" cy="52" r="3.6" fill={c.body}></circle>
              <rect x="16" y="44" width="32" height="14" rx="3" fill="#2B2B2B"></rect>
              <rect x="16" y="44" width="32" height="4.5" rx="2" fill="#CED4DA"></rect>
              <rect x="41" y="42" width="4" height="2.2" rx="1" fill="#ADB5BD"></rect>
              <rect x="20" y="49.5" width="4" height="3" rx="0.6" fill="#ADB5BD"></rect>
              <rect x="26" y="49.5" width="3" height="3" rx="0.6" fill="#868E96"></rect>
              <circle cx="37" cy="52" r="5.6" fill="#141414" stroke="#ADB5BD" strokeWidth="1.4"></circle>
              <circle cx="37" cy="52" r="2.6" fill="#343A40"></circle>
              <circle cx="35.3" cy="50.3" r="1" fill="#FFFFFF">
                <animate attributeName="opacity" values="0.3;0.3;1;0.3" keyTimes="0;0.84;0.9;1" dur="4.5s" repeatCount="indefinite"></animate>
              </circle>
            </g>

            <g display={show.r5}>
              <rect x="28" y="46" width="8" height="7" fill={c.dark}></rect>
              <rect x="19" y="52" width="26" height="5" rx="2.5" fill={c.dark}></rect>
              <rect x="9" y="11" width="46" height="36" rx="8" fill={c.body}></rect>
              <rect x="14" y="16" width="36" height="26" rx="4" fill="#16191D"></rect>
              <path d="M22 32 l3.5 2.5 -3.5 2.5" fill="none" stroke="#51CF66" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
              <rect x="29" y="35.6" width="6" height="1.8" rx="0.9" fill="#51CF66">
                <animate attributeName="opacity" values="1;0" calcMode="discrete" dur="1s" repeatCount="indefinite"></animate>
              </rect>
            </g>

            <g opacity={cheekOp} fill="#FF8FA3">
              <circle cx={f.ch1} cy={f.chy} r="2.4"></circle>
              <circle cx={f.ch2} cy={f.chy} r="2.4"></circle>
            </g>
            <g opacity={openOp} fill={f.eye}>
              <ellipse cx={f.ex1} cy={f.ey} rx={f.er} ry={f.er}>
                <animate attributeName="ry" values={blink} keyTimes="0;0.92;0.96;1" dur="4.6s" begin={f.blinkBegin} repeatCount="indefinite"></animate>
              </ellipse>
              <ellipse cx={f.ex2} cy={f.ey} rx={f.er} ry={f.er}>
                <animate attributeName="ry" values={blink} keyTimes="0;0.92;0.96;1" dur="4.6s" begin={f.blinkBegin} repeatCount="indefinite"></animate>
              </ellipse>
            </g>
            <g opacity={hlOp} fill="#FFFFFF">
              <circle cx={f.hl1} cy={f.hly} r="0.8"></circle>
              <circle cx={f.hl2} cy={f.hly} r="0.8"></circle>
            </g>
            <g opacity={closedOp} fill="none" stroke={f.eye} strokeWidth="1.6" strokeLinecap="round">
              <path d={f.closed1}></path>
              <path d={f.closed2}></path>
            </g>
            <path d={mouth} fill="none" stroke={f.mouthInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
          </g>

          <g display={blockedShow}>
            <circle cx="55" cy="9" r="7" fill="none" stroke={orange} strokeWidth="1.5">
              <animate attributeName="r" values="7;10" dur="1.6s" repeatCount="indefinite"></animate>
              <animate attributeName="opacity" values="0.6;0" dur="1.6s" repeatCount="indefinite"></animate>
            </circle>
            <circle cx="55" cy="9" r="7" fill={orange} stroke={c.tile} strokeWidth="1.5"></circle>
            <path d="M55 5.5 V9.8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round"></path>
            <circle cx="55" cy="12.6" r="1.1" fill="#FFFFFF"></circle>
          </g>

          <g display={idleShow} fill={zz} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontWeight="500">
            <text x="49" y="15" fontSize="8">z
              <animate attributeName="opacity" values="0;1;0" dur="2.6s" repeatCount="indefinite"></animate>
            </text>
            <text x="54" y="8" fontSize="6.5">z
              <animate attributeName="opacity" values="0;1;0" dur="2.6s" begin="0.6s" repeatCount="indefinite"></animate>
            </text>
          </g>
        </svg>

    </span>
  );
}
