// Portage de io.github.gcjojo.liblib.tween.Easing / Easings.

export type Easing = (t: number) => number;
const { pow, cos, sin, sqrt, PI } = Math;

const backC1 = 1.70158;
const backC2 = backC1 * 1.525;
const backC3 = backC1 + 1;
const elC1 = (2 * PI) / 3;
const elC2 = (2 * PI) / 4.5;

const bounceOut: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const EASINGS: Record<string, Easing> = {
  constant: (t) => (t >= 1 ? 1 : 0),
  linear: (t) => t,
  sine_in: (t) => 1 - cos((t * PI) / 2),
  sine_out: (t) => sin((t * PI) / 2),
  sine_in_out: (t) => -(cos(PI * t) - 1) / 2,
  quad_in: (t) => t * t,
  quad_out: (t) => 1 - (1 - t) * (1 - t),
  quad_in_out: (t) => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
  cubic_in: (t) => t * t * t,
  cubic_out: (t) => 1 - pow(1 - t, 3),
  cubic_in_out: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  quint_in: (t) => t * t * t * t * t,
  quint_out: (t) => 1 - pow(1 - t, 5),
  quint_in_out: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - pow(-2 * t + 2, 5) / 2),
  expo_in: (t) => (t === 0 ? 0 : pow(2, 10 * t - 10)),
  expo_out: (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
  expo_in_out: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2,
  circ_in: (t) => 1 - sqrt(1 - pow(t, 2)),
  circ_out: (t) => sqrt(1 - pow(t - 1, 2)),
  circ_in_out: (t) => (t < 0.5 ? (1 - sqrt(1 - pow(2 * t, 2))) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2),
  back_in: (t) => backC3 * t * t * t - backC1 * t * t,
  back_out: (t) => 1 + backC3 * pow(t - 1, 3) + backC1 * pow(t - 1, 2),
  back_in_out: (x) =>
    x < 0.5
      ? (pow(2 * x, 2) * ((backC2 + 1) * 2 * x - backC2)) / 2
      : (pow(2 * x - 2, 2) * ((backC2 + 1) * (x * 2 - 2) + backC2) + 2) / 2,
  elastic_in: (t) => (t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * elC1)),
  elastic_out: (t) => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * elC1) + 1),
  elastic_in_out: (x) =>
    x === 0
      ? 0
      : x === 1
        ? 1
        : x < 0.5
          ? -(pow(2, 20 * x - 10) * sin((20 * x - 11.125) * elC2)) / 2
          : (pow(2, -20 * x + 10) * sin((20 * x - 11.125) * elC2)) / 2 + 1,
  bounce_in: (t) => 1 - bounceOut(1 - t),
  bounce_out: bounceOut,
  bounce_in_out: (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
};

export const EASING_NAMES = Object.keys(EASINGS);
