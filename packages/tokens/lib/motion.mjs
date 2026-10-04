// Spring maths shared by the CSS, Swift and JS emitters. Zero dependencies.

/** Physical model of a spring (unit step response). */
export function springModel({ stiffness: k, damping: c, mass: m }) {
  const w0 = Math.sqrt(k / m);          // natural frequency (rad/s)
  const zeta = c / (2 * Math.sqrt(k * m)); // damping ratio
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const x = (t) => (zeta < 1
    ? 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
  // settle time: last instant the response is more than 0.2% away from 1
  let settle = 0;
  for (let t = 0; t <= 4; t += 1 / 240) if (Math.abs(x(t) - 1) > 0.002) settle = t;
  settle = Math.min(4, settle + 1 / 240);
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    stiffness: k, damping: c, mass: m,
    response: round((2 * Math.PI) / w0, 3),        // SwiftUI .spring(response:)
    dampingFraction: round(zeta, 3),               // SwiftUI .spring(dampingFraction:)
    bounce: round(Math.max(0, 1 - zeta), 3),       // motion.dev spring({ bounce })
    duration: round((2 * Math.PI) / w0, 3),        // motion.dev perceptual duration ~ response
    settleSec: round(settle, 3),
    x,
  };
}

/** CSS `linear()` easing that reproduces the spring (use with the settle duration). */
export function springLinear(spec, samples = 36) {
  const m = springModel(spec);
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * m.settleSec;
    pts.push(i === samples ? 1 : Math.round(m.x(t) * 1000) / 1000);
  }
  return { easing: `linear(${pts.join(', ')})`, durationMs: Math.round(m.settleSec * 1000) };
}

/** Strip the function so the model is JSON-safe. */
export function springSpec(spec) {
  const { x, ...rest } = springModel(spec); // eslint-disable-line no-unused-vars
  return rest;
}
