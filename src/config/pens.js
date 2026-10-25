// Pen skins. All differences are purely cosmetic: every pen has identical physics (fair competition).
// There is no unlock system, so every pen is available from the start.

export const PENS = [
  {
    id: 'classic-blue',
    name: { en: 'Classic Blue', bn: 'ক্লাসিক ব্লু' },
    desc: { en: 'The everyday ballpoint every desk knows.', bn: 'প্রতিটি বেঞ্চের চেনা সেই সাধারণ বলপেন।' },
    body: '#2f6fed', accent: '#dfe8ff', tip: '#1b1b1f', cap: '#1c3f9e', glow: '#5b8cff', metalness: 0.2, emissive: 0,
  },
  {
    id: 'crimson-strike',
    name: { en: 'Crimson Strike', bn: 'ক্রিমসন স্ট্রাইক' },
    desc: { en: 'Bold red, built for aggressive flicks.', bn: 'গাঢ় লাল, আক্রমণাত্মক ফ্লিকের জন্য।' },
    body: '#DC3545', accent: '#ffd9dd', tip: '#2a0a0e', cap: '#8e1624', glow: '#ff5d6c', metalness: 0.25, emissive: 0,
  },
  {
    id: 'neon-phantom',
    name: { en: 'Neon Phantom', bn: 'নিয়ন ফ্যান্টম' },
    desc: { en: 'Matte black with a glowing green edge.', bn: 'ম্যাট কালো, উজ্জ্বল সবুজ কিনারা।' },
    body: '#15151c', accent: '#39ff9c', tip: '#39ff9c', cap: '#0c0c10', glow: '#39ff9c', metalness: 0.1, emissive: 0.45,
  },
  {
    id: 'golden-legend',
    name: { en: 'Golden Legend', bn: 'গোল্ডেন লেজেন্ড' },
    desc: { en: 'Polished gold finish. Pure bragging rights.', bn: 'পালিশ করা সোনালি ফিনিশ। শুধুই গর্বের।' },
    body: '#d9a521', accent: '#fff3c4', tip: '#3a2b05', cap: '#8a6310', glow: '#ffd25a', metalness: 0.85, emissive: 0.05,
  },
];

export const PEN_IDS = PENS.map((p) => p.id);
export const DEFAULT_PEN = PEN_IDS[0];

export function getPen(id) {
  return PENS.find((p) => p.id === id) || PENS[0];
}
export function isPenId(id) {
  return PEN_IDS.includes(id);
}
