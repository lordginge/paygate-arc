// Living fibre-field background. WebGPU via three.js TSL with automatic
// WebGL2 fallback (WebGPURenderer selects the backend). Fullscreen QuadMesh
// runs the shader; a uniform clock drives the drift so motion can pause.
// Palette: deep navy #050617, USDC blue #2775CA, ice highlight.

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  uv,
  uniform,
  vec2,
  vec3,
  sin,
  smoothstep,
  mix,
  mx_noise_float,
} from "three/tsl";

export interface FibresHandle {
  setPlaying: (playing: boolean) => void;
}

export function Fibres({
  playing,
  onReady,
}: {
  playing: boolean;
  onReady?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    uTime: { value: number };
    playing: boolean;
    last: number;
    renderedOnce: boolean;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    const mount = mountRef.current;
    if (!mount) return;

    const uTime = uniform(0);
    const uAspect = uniform(1);

    const st = { uTime: uTime as unknown as { value: number }, playing, last: performance.now(), renderedOnce: false, t0: performance.now() };
    stateRef.current = st;

    // WebGPU driver errors surface as unhandled rejections, not throws.
    // If one arrives before the first good frame, restart on WebGL2.
    let fallbackFired = false;
    const onFailure = (reason: unknown) => {
      // WebGPU driver errors can arrive asynchronously after the first frames
      // render black. Accept failure signals within a grace window from init.
      if (fallbackFired || performance.now() - st.t0 > 4000) return;
      fallbackFired = true;
      console.warn("fibres: webgpu failed, falling back to webgl2:", reason);
      cleanupRef.current?.();
      cleanupRef.current = null;
      renderer = null;
      init(true).catch((err) => console.error("fibres webgl fallback failed:", err));
    };
    const onRejection = (ev: PromiseRejectionEvent) => onFailure(ev.reason);
    const onError = (ev: ErrorEvent) => onFailure(ev.error ?? ev.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    async function init(forceWebGL = false) {
      renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      await renderer.init();
      if (disposed || !mount) return;
      mount.appendChild(renderer.domElement);

      const uvNode = uv().toVar();
      // Domain-warped vertical fibre strands with fine horizontal thread grain
      const p = uvNode.sub(0.5).mul(vec2(uAspect, 1.0)).mul(2.4).toVar();
      const w1 = mx_noise_float(vec3(p.mul(1.1), uTime.mul(0.06)));
      const w2 = mx_noise_float(vec3(p.mul(1.1).add(37.7), uTime.mul(0.06)));
      const wp = p.add(vec2(w1, w2).mul(0.85)).toVar();

      const strand = sin(wp.x.mul(13.0).add(uTime.mul(0.22)));
      const filament = smoothstep(0.975, 1.0, strand.abs());
      const glow = mx_noise_float(vec3(p.mul(2.3), uTime.mul(0.09)))
        .mul(0.5)
        .add(0.5);
      const thread = sin(wp.y.mul(260.0).add(w1.mul(7.0)))
        .mul(0.5)
        .add(0.5);

      const navy = vec3(0.02, 0.024, 0.09);
      const usdc = vec3(0.153, 0.459, 0.792);
      const ice = vec3(0.56, 0.76, 1.0);
      const fibreCol = mix(usdc, ice, thread.mul(0.55));

      // Legibility vignette: fibres breathe at the edges, near-calm centre
      const r = uvNode.sub(vec2(0.5, 0.52)).mul(vec2(uAspect, 1.0)).length();
      const vig = smoothstep(0.12, 0.95, r);

      material.colorNode = navy.add(
        fibreCol
          .mul(filament)
          .mul(glow.mul(0.85).add(0.15))
          .mul(vig.mul(0.94).add(0.06))
          .mul(0.8),
      );

      const quad = new THREE.QuadMesh(material);

      const onResize = () => {
        uAspect.value = window.innerWidth / window.innerHeight;
        renderer!.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);
      onResize();

      renderer.setAnimationLoop(() => {
        try {
          const now = performance.now();
          const dt = (now - st.last) / 1000;
          st.last = now;
          if (st.playing) uTime.value += dt;
          quad.render(renderer!);
          st.renderedOnce = true;
        } catch (e) {
          if (!st.renderedOnce && !forceWebGL) {
            // WebGPU present but broken (e.g. software driver) — retry on WebGL2
            renderer?.setAnimationLoop(null);
            cleanupRef.current?.();
            cleanupRef.current = null;
            renderer = null;
            init(true).catch((err) => console.error("fibres webgl fallback failed:", err));
          } else {
            console.error("fibres frame failed:", e);
          }
        }
      });

      onReady?.();

      cleanupRef.current = () => {
        window.removeEventListener("resize", onResize);
        renderer?.setAnimationLoop(null);
        renderer?.dispose();
        if (renderer?.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    }

    const material = new THREE.NodeMaterial();
    const cleanupRef: { current: (() => void) | null } = { current: null };
    init().catch((e) => {
      console.error("fibres init failed:", e);
      if (mount) {
        const el = document.createElement("div");
        el.style.cssText =
          "position:fixed;bottom:8px;left:8px;z-index:9999;color:#f66;font:11px monospace;max-width:60ch;white-space:pre-wrap";
        el.textContent = "fibres: " + String(e?.message ?? e);
        mount.appendChild(el);
      }
    });

    return () => {
      disposed = true;
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stateRef.current) {
      stateRef.current.playing = playing;
      stateRef.current.last = performance.now();
    }
  }, [playing]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="fixed inset-0 -z-10 [&>canvas]:h-full [&>canvas]:w-full"
      style={{ background: "#050617" }}
    />
  );
}
