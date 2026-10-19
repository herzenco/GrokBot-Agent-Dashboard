export type AvatarMood = "active" | "blocked" | "idle";

const IDS: Record<string, string> = {
  Roger: "roger",
  Chopper: "chopper",
  "AP-5": "ap5",
  "IG-11": "ig11",
  "K-2SO": "k2so",
  Yoda: "yoda",
  Cartier: "cartier",
  "R5-D4": "r5",
};

const BODY: Record<string, { body: string; dark: string }> = {
  roger: { body: "#5C7CFA", dark: "#1E2A5A" },
  chopper: { body: "#D5DADF", dark: "#E8590C" },
  ap5: { body: "#51CF66", dark: "#2B8A3E" },
  ig11: { body: "#38D9A9", dark: "#087F5B" },
  k2so: { body: "#FCC419", dark: "#C77700" },
  yoda: { body: "#91A7FF", dark: "#5F3DC4" },
  cartier: { body: "#F2C9A5", dark: "#A61E4D" },
  r5: { body: "#ADB5BD", dark: "#495057" },
};

const INK = "#1B1D24";

const FACE: Record<
  string,
  {
    ex1: number;
    ex2: number;
    ey: number;
    er: number;
    mx: number;
    my: number;
    eye: string;
    mouthInk: string;
    cheeks: boolean;
    b: string;
  }
> = {
  roger: { ex1: 27, ex2: 37, ey: 28.5, er: 2.6, mx: 32, my: 33, eye: INK, mouthInk: INK, cheeks: false, b: "0s" },
  chopper: { ex1: 27, ex2: 37, ey: 21, er: 2.6, mx: 32, my: 27, eye: INK, mouthInk: INK, cheeks: false, b: "0.7s" },
  ap5: { ex1: 27, ex2: 37, ey: 22, er: 2.6, mx: 32, my: 27, eye: INK, mouthInk: INK, cheeks: false, b: "1.3s" },
  ig11: { ex1: 26, ex2: 38, ey: 20.5, er: 2.4, mx: 32, my: 28, eye: "#C3FAE8", mouthInk: "none", cheeks: false, b: "2.1s" },
  k2so: { ex1: 27, ex2: 37, ey: 32, er: 2.8, mx: 32, my: 38, eye: INK, mouthInk: INK, cheeks: false, b: "0.4s" },
  yoda: { ex1: 27, ex2: 37, ey: 28, er: 2.2, mx: 32, my: 40, eye: INK, mouthInk: "none", cheeks: false, b: "1.8s" },
  cartier: { ex1: 27, ex2: 37, ey: 23, er: 1.9, mx: 32, my: 32.5, eye: INK, mouthInk: "#7A4B3A", cheeks: true, b: "2.6s" },
  r5: { ex1: 26, ex2: 38, ey: 25, er: 2.6, mx: 32, my: 30, eye: "#51CF66", mouthInk: "none", cheeks: false, b: "1.1s" },
};

export function avatarId(name: string): string | null {
  return IDS[name] ?? null;
}

export function tileVar(name: string): string {
  const id = avatarId(name);
  return id ? `var(--tile-${id})` : "var(--soft)";
}

export function avatarPalette(name: string, mood: AvatarMood) {
  const id = IDS[name] ?? "chopper";
  const known = Boolean(IDS[name]);
  const c0 = BODY[id];
  const f0 = FACE[id];
  const er = f0.er;
  const closed = (x: number, y: number) => `M${x - er} ${y} Q${x} ${y + er * 0.9} ${x + er} ${y}`;
  let mouth: string;
  if (mood === "blocked") mouth = `M${f0.mx - 3.5} ${f0.my + 1.5} q1.75 -1.8 3.5 0 t3.5 0`;
  else if (mood === "idle") mouth = `M${f0.mx - 1.6} ${f0.my + 0.5} h3.2`;
  else mouth = `M${f0.mx - 4} ${f0.my} Q${f0.mx} ${f0.my + 4} ${f0.mx + 4} ${f0.my}`;
  const show: Record<string, "inline" | "none"> = {};
  for (const key of Object.keys(BODY)) show[key] = key === id && known ? "inline" : "none";
  const idle = mood === "idle";
  const moodWord = mood === "blocked" ? "stuck" : mood === "idle" ? "napping" : "working";
  return {
    known,
    label: `${name}, ${moodWord}`,
    c: { body: c0.body, dark: c0.dark, tile: `var(--tile-${id})` },
    f: {
      ex1: f0.ex1,
      ex2: f0.ex2,
      ey: f0.ey,
      er,
      eye: f0.eye,
      mouthInk: f0.mouthInk,
      blinkBegin: f0.b,
      ch1: f0.ex1 - 4.5,
      ch2: f0.ex2 + 4.5,
      chy: f0.ey + 5.5,
      hl1: f0.ex1 + 0.9,
      hl2: f0.ex2 + 0.9,
      hly: f0.ey - 1,
      closed1: closed(f0.ex1, f0.ey),
      closed2: closed(f0.ex2, f0.ey),
    },
    show,
    mouth,
    bob: idle ? "0 0;0 0.8;0 0" : mood === "blocked" ? "0 0;0 -0.6;0 0" : "0 0;0 -1.4;0 0",
    bobDur: idle ? "4.5s" : "2.8s",
    blink: `${er};${er};0.3;${er}`,
    openOp: idle ? 0 : 1,
    closedOp: idle ? 1 : 0,
    hlOp: !idle && f0.eye === INK && er >= 2.4 ? 1 : 0,
    cheekOp: f0.cheeks ? 0.5 : 0,
    blockedShow: mood === "blocked" ? "inline" : "none",
    idleShow: idle ? "inline" : "none",
    orange: "var(--avatar-orange)",
    zz: "var(--avatar-zz)",
  };
}
