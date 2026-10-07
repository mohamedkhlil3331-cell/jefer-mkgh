import { useState, useEffect } from "react";

const FONT_SCALE_KEY     = "app-font-scale";
const FONT_SCALE_MIN     = 80;
const FONT_SCALE_MAX     = 130;
const FONT_SCALE_STEP    = 10;
const FONT_SCALE_DEFAULT = 100;

function clamp(v: number) {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v));
}

function applyFontScale(level: number) {
  // Sets --font-scale on <html>; index.css wires html { font-size: calc(100% * var(--font-scale)); }
  // so all rem-based text scales without touching layout / images / spacing.
  document.documentElement.style.setProperty("--font-scale", String(level / 100));
}

export function useFontScale() {
  const [fontScale, setFontScaleState] = useState<number>(() => {
    const stored = localStorage.getItem(FONT_SCALE_KEY);
    return stored ? clamp(parseInt(stored, 10)) : FONT_SCALE_DEFAULT;
  });

  useEffect(() => {
    applyFontScale(fontScale);
    localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
  }, [fontScale]);

  const fontScaleUp    = () => setFontScaleState(s => clamp(s + FONT_SCALE_STEP));
  const fontScaleDown  = () => setFontScaleState(s => clamp(s - FONT_SCALE_STEP));
  const fontScaleReset = () => setFontScaleState(FONT_SCALE_DEFAULT);

  return {
    fontScale,
    fontScaleUp,
    fontScaleDown,
    fontScaleReset,
    canFontScaleUp:   fontScale < FONT_SCALE_MAX,
    canFontScaleDown: fontScale > FONT_SCALE_MIN,
  };
}
