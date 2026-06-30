// Palette Chart.js par thème — <canvas> ne sait pas lire les variables CSS,
// on fournit donc les valeurs résolues (alignées sur style.css).
export const PALETTES = {
  dark: {
    rerng: "#4aa8ff", nat: "#3ed598", mi2n: "#f5b545",
    um: "#a877ff", us: "#3a4658", clim: "#5ecbe0",
    chelles: "#22d4d4", tournan: "#ff6b6b", villiers: "#c77dff", central: "#b5e853",
    canceled: "#ff5c7a", delayed: "#ffa94d", modified: "#4ecdc4",
    text: "#e6edf3", dim: "#8b98a9", faint: "#5d6b7d",
    grid: "#27313f", panel: "#151b24",
  },
  light: {
    rerng: "#1f74d0", nat: "#18a163", mi2n: "#cf8418",
    um: "#7a4fd6", us: "#c3ccd8", clim: "#0e87a0",
    chelles: "#007a8c", tournan: "#c0392b", villiers: "#7b2fbe", central: "#5a8a00",
    canceled: "#d63031", delayed: "#d9730d", modified: "#00827f",
    text: "#1a2230", dim: "#5a6675", faint: "#97a3b2",
    grid: "#e3e7ee", panel: "#ffffff",
  },
};

export const MAT_COLOR = (p) => ({ RERNG: p.rerng, NAT: p.nat, MI2N: p.mi2n });
