"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useResolvedTheme, type ResolvedThemeName } from "@/lib/hooks/use-resolved-theme";
import { Aurora } from "./aurora";

/**
 * Orb numbers are generated art, copied from BRAND.md section 10 (the same values baked into `--fd-aurora`).
 * x / y are fractions of the 124% box the CSS gradient layer is drawn in; radius is a fraction of the longer viewport
 * side (capped like the CSS `min(62vmax, 1364px)`); `peak` / `mid` are the alpha at 0% and 45% of the falloff.
 */
interface OrbSpec {
  x: number;
  y: number;
  radius: number;
  rgb: readonly [number, number, number];
  peak: number;
  mid: number;
  phase: number;
}

const ORBS: Record<ResolvedThemeName, readonly OrbSpec[]> = {
  dark: [
    { x: 0.06, y: 0.0, radius: 0.62, rgb: [107, 63, 245], peak: 0.67, mid: 0.29, phase: 0.0 },
    { x: 0.96, y: 0.02, radius: 0.5, rgb: [47, 123, 255], peak: 0.52, mid: 0.22, phase: 0.31 },
    { x: 0.84, y: 1.06, radius: 0.52, rgb: [25, 211, 230], peak: 0.35, mid: 0.145, phase: 0.57 },
    { x: -0.04, y: 0.98, radius: 0.38, rgb: [255, 77, 141], peak: 0.2, mid: 0.07, phase: 0.83 },
  ],
  light: [
    { x: 0.06, y: 0.0, radius: 0.62, rgb: [169, 156, 242], peak: 0.62, mid: 0.28, phase: 0.0 },
    { x: 0.96, y: 0.02, radius: 0.5, rgb: [141, 184, 245], peak: 0.6, mid: 0.26, phase: 0.31 },
    { x: 0.84, y: 1.06, radius: 0.52, rgb: [127, 227, 242], peak: 0.55, mid: 0.24, phase: 0.57 },
    { x: -0.04, y: 0.98, radius: 0.38, rgb: [246, 179, 186], peak: 0.45, mid: 0.18, phase: 0.83 },
  ],
};

const FALLBACK_BASE: Record<ResolvedThemeName, readonly [number, number, number]> = {
  dark: [3, 9, 33],
  light: [243, 247, 255],
};

const VERTEX = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;

// Tiny fragment shader: four falloff orbs (same alpha ramp as the CSS radial gradients), a slow Lissajous drift, a soft
// domain warp so the edges breathe, the dark vignette and a dither to kill banding. Source-over, bottom to top = rose..violet.
const FRAGMENT = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform float u_vig;
uniform float u_gain;
uniform float u_vmax;
uniform vec3 u_col[4];
uniform vec4 u_orb[4];
uniform vec2 u_alpha[4];

float falloff(float t, vec2 a) {
  if (t >= 1.0) return 0.0;
  if (t < 0.45) return mix(a.x, a.y, t / 0.45);
  return mix(a.y, 0.0, (t - 0.45) / 0.55);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = px / u_res;
  float maxDim = max(u_res.x, u_res.y);
  vec2 q = (uv - vec2(0.5, 0.4)) / vec2(1.2, 0.9);
  float v = clamp((length(q) - 0.55) / 0.45, 0.0, 1.0) * u_vig;
  vec3 col = mix(u_base, vec3(1.0, 4.0, 25.0) / 255.0, v);
  for (int k = 3; k >= 0; k--) {
    vec4 o = u_orb[k];
    float ph = o.w;
    vec2 drift = vec2(sin(u_time * 0.045 + ph * 6.2831), cos(u_time * 0.037 + ph * 4.1)) * 0.03;
    vec2 center = (vec2(-0.12) + o.xy * 1.24 + drift) * u_res;
    float r = o.z * u_vmax * (1.0 + 0.045 * sin(u_time * 0.05 + ph * 9.0));
    vec2 warp = vec2(sin(uv.y * 3.1 + u_time * 0.06 + ph * 10.0), cos(uv.x * 2.7 - u_time * 0.05 + ph * 7.0)) * 0.04 * maxDim;
    float d = length(px + warp - center) / r;
    col = mix(col, u_col[k], falloff(d, u_alpha[k]) * u_gain);
  }
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

function parseColor(value: string): readonly [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex?.[1]) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value.trim());
  if (rgb?.[1] && rgb[2] && rgb[3]) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

interface Engine {
  setTheme: (theme: ResolvedThemeName) => void;
  setAnimated: (animated: boolean) => void;
  setVisible: (visible: boolean) => void;
  resize: () => void;
  dispose: () => void;
}

interface EngineOptions {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  fps: number;
  quality: number;
  gain: number;
  onReady: () => void;
  onLost: () => void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createEngine(options: EngineOptions): Engine | null {
  const { canvas, host, fps, quality, gain, onReady, onLost } = options;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One oversized triangle covers the viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, "a");
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  const uRes = uniform("u_res");
  const uTime = uniform("u_time");
  const uBase = uniform("u_base");
  const uVig = uniform("u_vig");
  const uGain = uniform("u_gain");
  const uVmax = uniform("u_vmax");
  const uCol = uniform("u_col[0]");
  const uOrb = uniform("u_orb[0]");
  const uAlpha = uniform("u_alpha[0]");

  let theme: ResolvedThemeName = "dark";
  let animated = true;
  let visible = true;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let ready = false;
  const startedAt = performance.now();
  const interval = 1000 / fps;

  const applyTheme = (): void => {
    const orbs = ORBS[theme];
    const base = parseColor(getComputedStyle(host).getPropertyValue("--fd-bg")) ?? FALLBACK_BASE[theme];
    gl.uniform3f(uBase, base[0] / 255, base[1] / 255, base[2] / 255);
    gl.uniform1f(uVig, theme === "dark" ? 0.55 : 0);
    gl.uniform1f(uGain, gain);
    gl.uniform3fv(uCol, new Float32Array(orbs.flatMap((o) => [o.rgb[0] / 255, o.rgb[1] / 255, o.rgb[2] / 255])));
    gl.uniform4fv(uOrb, new Float32Array(orbs.flatMap((o) => [o.x, o.y, o.radius, o.phase])));
    gl.uniform2fv(uAlpha, new Float32Array(orbs.flatMap((o) => [o.peak, o.mid])));
  };

  const draw = (time: number): void => {
    if (disposed || gl.isContextLost()) return;
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!ready) {
      ready = true;
      onReady();
    }
  };

  // A still frame is drawn at a flattering fixed time when motion is off (reduced motion, off-screen redraws).
  const STILL_TIME = 14;
  const frame = (now: number): void => {
    raf = 0;
    if (disposed) return;
    if (!visible || !animated || document.hidden) return;
    if (now - last >= interval - 1) {
      last = now;
      draw((now - startedAt) / 1000);
    }
    raf = requestAnimationFrame(frame);
  };

  const sync = (): void => {
    if (disposed) return;
    if (visible && animated && !document.hidden) {
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (visible) {
      draw(STILL_TIME);
    }
  };

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const scale = quality * Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(2, Math.round(rect.width * scale));
    const height = Math.max(2, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uRes, width, height);
    // Orb radii follow the VIEWPORT (like the CSS `min(62vmax, 1364px)`), so a contained hero looks like the page background.
    gl.uniform1f(uVmax, Math.min(Math.max(window.innerWidth, window.innerHeight), 2200) * scale);
    // Resizing clears the drawing buffer (opaque black with alpha:false): repaint at once instead of waiting for the next frame.
    if (visible) draw(animated ? (performance.now() - startedAt) / 1000 : STILL_TIME);
  };

  const onVisibility = (): void => sync();
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    ready = false;
    cancelAnimationFrame(raf);
    raf = 0;
    onLost();
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onContextLost);

  applyTheme();
  resize();
  sync();

  return {
    setTheme: (next) => {
      theme = next;
      applyTheme();
      if (!animated) draw(STILL_TIME);
    },
    setAnimated: (next) => {
      animated = next;
      sync();
    },
    setVisible: (next) => {
      visible = next;
      sync();
    },
    resize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      // Free the GPU context on a real unmount (the canvas is already detached). A StrictMode dev re-run keeps the same
      // canvas attached and would get the same, now lost, context back from getContext(), so leave it alone then.
      if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

export interface AuroraShaderProps {
  /** `fixed` page background (default) or `contained` inside a `relative isolate` hero. */
  variant?: "fixed" | "contained";
  /** Frames per second while animating (30 is plenty for slow orbs and halves GPU use). */
  fps?: 24 | 30 | 60;
  /** Render scale of the canvas (0.5 = half resolution; the orbs are soft, so this is invisible and cheap). */
  quality?: number;
  /** Orb alpha multiplier (1 = the brand values). */
  intensity?: number;
  className?: string;
}

/**
 * Optional WebGL aurora for hero backgrounds: the same four orbs as the CSS aurora, with a gently breathing edge.
 * The CSS <Aurora/> is always rendered underneath: it is the first paint, the server render and the fallback when
 * WebGL is unavailable, the context is lost or Reduce glass is on. The canvas fades in over it after the first frame.
 *
 * Pauses when off-screen, when the tab is hidden and under prefers-reduced-motion (one still frame is drawn).
 * Use for one hero surface; the page background stays the CSS Aurora.
 */
export function AuroraShader({ variant = "fixed", fps = 30, quality = 0.5, intensity = 1, className }: AuroraShaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const theme = useResolvedTheme();
  const reduceMotion = useReducedMotion();

  const themeRef = useRef(theme);
  const animatedRef = useRef(!reduceMotion);
  useEffect(() => {
    themeRef.current = theme;
    animatedRef.current = !reduceMotion;
    engineRef.current?.setTheme(theme);
    engineRef.current?.setAnimated(!reduceMotion);
  }, [theme, reduceMotion]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const engine = createEngine({
      canvas,
      host,
      fps,
      quality,
      gain: intensity,
      onReady: () => canvas.setAttribute("data-ready", ""),
      onLost: () => canvas.removeAttribute("data-ready"),
    });
    if (!engine) return; // no WebGL: the CSS aurora underneath stays visible
    engineRef.current = engine;
    engine.setTheme(themeRef.current);
    engine.setAnimated(animatedRef.current);

    const resizeObserver = new ResizeObserver(() => engine.resize());
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) engine.setVisible(entry.isIntersecting);
    });
    intersectionObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      engine.dispose();
      engineRef.current = null;
      canvas.removeAttribute("data-ready");
    };
  }, [fps, quality, intensity]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none isolate overflow-hidden",
        variant === "fixed" ? "fixed inset-0 z-[-1]" : "absolute inset-0 z-0",
        className,
      )}
    >
      {/* The CSS aurora is the first paint and the fallback; this wrapper only supplies the box. */}
      <Aurora variant="contained" drift={false} />
      <canvas ref={canvasRef} className="fd-aurora-canvas" />
      <div className="fd-aurora-grain" />
    </div>
  );
}
