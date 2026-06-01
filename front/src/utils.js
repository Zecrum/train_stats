// Helpers partagés : formatage de dates FR, pourcentages, config branches/matériels.
export const MATERIALS = [
  { key: "RERNG", name: "RER NG", note: "Nouvelle Génération" },
  { key: "NAT", name: "NAT", note: "Francilien (Z 50000)" },
  { key: "MI2N", name: "MI2N", note: "Matériel d'origine" },
];

export const TODAY = new Date().toLocaleDateString("en-CA");

export function pct(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];

export function fmtLong(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtShort(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}
