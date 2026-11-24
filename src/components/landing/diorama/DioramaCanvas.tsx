"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Color, SRGBColorSpace } from "three";
import type { Group, MeshStandardMaterial } from "three";
import { DIORAMA_TIMING, type SceneId } from "./dioramaConfig";
import { RoomShell, SCENE_SHELL_COLORS, SceneInterior } from "./DioramaScenes";

export interface DioramaCanvasProps {
  /** Total langkah transisi (0, 1, 2, ...) -> sudut target = -stepIndex * 2PI (putaran penuh 360 deg) */
  stepIndex: number;
  /** Interior di slot A (aktif saat stepIndex genap) */
  bayAScene: SceneId;
  /** Interior di slot B (aktif saat stepIndex ganjil) */
  bayBScene: SceneId;
  bayASeed: number;
  bayBSeed: number;
  bayAPlayItems: boolean;
  bayBPlayItems: boolean;
  reducedMotion: boolean;
  active?: boolean;
  onCanvasReady?: () => void;
  onRotationComplete?: () => void;
  onContextLost?: () => void;
}

/** Kurva putar halus: akselerasi lembut, meluncur mulus, berhenti mantap tanpa sentakan */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothStep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Interior menyusut halus ke lantai saat tersembunyi di balik dinding belakang
 * dan naik utuh sebelum muka terbuka menghadap kamera lagi.
 */
function setInteriorReveal(group: Group, s: number): void {
  group.visible = s > 0.002;
  const xz = 0.96 + 0.04 * s;
  group.scale.set(xz, Math.max(0.001, s), xz);
}

function ResponsiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    if (aspect < 0.95) {
      camera.zoom = Math.max(0.62, aspect * 0.82);
      camera.lookAt(0, 0.24, 0);
    } else {
      camera.zoom = Math.min(0.94, aspect * 0.82);
      camera.lookAt(-0.1, 0.24, 0);
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

/**
 * Bayangan tanah statis lembut berbentuk lingkaran di bawah kubik 1:1 (tidak terpotong di tepi manapun).
 */
function SoftGroundShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(15,23,42,0.26)");
      g.addColorStop(0.48, "rgba(15,23,42,0.14)");
      g.addColorStop(0.8, "rgba(15,23,42,0.03)");
      g.addColorStop(1, "rgba(15,23,42,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]}>
      <planeGeometry args={[4.8, 4.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function RotatingDioramaRig({
  stepIndex,
  bayAScene,
  bayBScene,
  bayASeed,
  bayBSeed,
  bayAPlayItems,
  bayBPlayItems,
  reducedMotion,
  onRotationComplete,
}: DioramaCanvasProps) {
  const rigRef = useRef<Group>(null);
  const bayARef = useRef<Group>(null);
  const bayBRef = useRef<Group>(null);
  const floorMatRef = useRef<MeshStandardMaterial>(null);
  const accentMatRef = useRef<MeshStandardMaterial>(null);

  const startAngleRef = useRef<number>(0);
  const targetAngleRef = useRef<number>(0);
  const progressRef = useRef<number>(1);
  const isAnimatingRef = useRef<boolean>(false);
  const appliedStepRef = useRef<number>(stepIndex);

  const latestRef = useRef({
    stepIndex,
    a: bayAScene,
    b: bayBScene,
    reducedMotion,
    onRotationComplete,
  });
  latestRef.current = {
    stepIndex,
    a: bayAScene,
    b: bayBScene,
    reducedMotion,
    onRotationComplete,
  };

  const palette = useMemo(
    () => ({
      floor: {
        0: new Color(SCENE_SHELL_COLORS[0].floor),
        1: new Color(SCENE_SHELL_COLORS[1].floor),
        2: new Color(SCENE_SHELL_COLORS[2].floor),
      } as Record<SceneId, Color>,
      accent: {
        0: new Color(SCENE_SHELL_COLORS[0].accent),
        1: new Color(SCENE_SHELL_COLORS[1].accent),
        2: new Color(SCENE_SHELL_COLORS[2].accent),
      } as Record<SceneId, Color>,
    }),
    []
  );

  /**
   * e = fraksi sudut putaran 360 deg (0..1).
   * Dinding padat belakang & kiri sepenuhnya menutup pandangan kamera pada e = 0.42..0.67:
   * - e 0.00..0.34: interior lama tetap 100% utuh saat berputar menjauh
   * - e 0.34..0.51: interior lama turun rapi saat terlindung dinding luar
   * - e 0.53..0.71: interior baru (rak kosong) muncul rapi dari balik dinding luar
   * - e 0.71..1.00: interior baru sudah 100% utuh saat memutar kembali menghadap kamera
   */
  const applyTransition = (e: number, animating: boolean, step: number) => {
    const a = bayARef.current;
    const b = bayBRef.current;
    if (!a || !b) return;

    const { a: sceneA, b: sceneB } = latestRef.current;
    const activeIsA = step % 2 === 0;
    const incoming = activeIsA ? a : b;
    const outgoing = activeIsA ? b : a;
    const sceneIn = activeIsA ? sceneA : sceneB;
    const sceneOut = activeIsA ? sceneB : sceneA;

    const outS = animating ? 1 - smoothStep((e - 0.34) / 0.17) : 0;
    const inS = animating ? smoothStep((e - 0.53) / 0.18) : 1;
    setInteriorReveal(outgoing, outS);
    setInteriorReveal(incoming, inS);

    const mix = animating ? smoothStep((e - 0.44) / 0.16) : 1;
    floorMatRef.current?.color.copy(palette.floor[sceneOut]).lerp(palette.floor[sceneIn], mix);
    accentMatRef.current?.color.copy(palette.accent[sceneOut]).lerp(palette.accent[sceneIn], mix);
  };

  useFrame(({ clock }, delta) => {
    const rig = rigRef.current;
    if (!rig) return;

    const {
      stepIndex: nextStep,
      reducedMotion: rm,
      onRotationComplete: doneCb,
    } = latestRef.current;

    // Deteksi transisi atomik langsung di dalam render loop (nol kedipan 1-frame)
    if (nextStep !== appliedStepRef.current) {
      appliedStepRef.current = nextStep;
      const nextTarget = -nextStep * Math.PI * 2;
      if (rm) {
        startAngleRef.current = nextTarget;
        targetAngleRef.current = nextTarget;
        progressRef.current = 1;
        isAnimatingRef.current = false;
        rig.rotation.y = nextTarget;
        applyTransition(1, false, nextStep);
        doneCb?.();
        return;
      }
      startAngleRef.current = rig.rotation.y;
      targetAngleRef.current = nextTarget;
      progressRef.current = 0;
      isAnimatingRef.current = true;
    }

    const bob = rm ? 0 : Math.sin(clock.getElapsedTime() * 1.4) * 0.03;

    if (!isAnimatingRef.current) {
      rig.position.y = bob;
      applyTransition(1, false, appliedStepRef.current);
      return;
    }

    progressRef.current = Math.min(
      progressRef.current + Math.min(delta, 0.05) / DIORAMA_TIMING.rotationDurationSec,
      1
    );
    const p = progressRef.current;
    const e = easeInOutCubic(p);

    rig.rotation.y = startAngleRef.current + (targetAngleRef.current - startAngleRef.current) * e;
    // Angkat lembut di tengah putaran lalu mendarat tenang
    rig.position.y = bob + Math.sin(Math.PI * p) * 0.075;
    applyTransition(e, true, appliedStepRef.current);

    if (p >= 1) {
      rig.rotation.y = targetAngleRef.current;
      isAnimatingRef.current = false;
      applyTransition(1, false, appliedStepRef.current);
      doneCb?.();
    }
  });

  return (
    <group ref={rigRef}>
      <group position={[0, -0.58, 0]}>
        <RoomShell floorMatRef={floorMatRef} accentMatRef={accentMatRef} />

        <group ref={bayARef}>
          <SceneInterior
            sceneId={bayAScene}
            animSeed={bayASeed}
            playItems={bayAPlayItems}
            reducedMotion={reducedMotion}
          />
        </group>

        <group ref={bayBRef} visible={false} scale={[0.96, 0.001, 0.96]}>
          <SceneInterior
            sceneId={bayBScene}
            animSeed={bayBSeed}
            playItems={bayBPlayItems}
            reducedMotion={reducedMotion}
          />
        </group>
      </group>
    </group>
  );
}

export default function DioramaCanvas(props: DioramaCanvasProps) {
  const { active = true, onCanvasReady, onContextLost } = props;

  return (
    <Canvas
      shadows
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.25]}
      camera={{
        position: [3.45, 3.05, 6.45],
        fov: 30,
        near: 0.1,
        far: 45,
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(-0.1, 0.24, 0);
        const handleLost = (event: Event) => {
          event.preventDefault();
          onContextLost?.();
        };
        gl.domElement.addEventListener("webglcontextlost", handleLost, { once: true });
        onCanvasReady?.();
      }}
      className="h-full w-full touch-pan-y"
    >
      <ambientLight intensity={0.95} color="#FFFFFF" />
      <hemisphereLight args={["#FFFFFF", "#E2E8F0", 0.55]} />

      <directionalLight
        position={[5.5, 8.5, 6.0]}
        intensity={1.25}
        color="#FFFDF8"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-near={1}
        shadow-camera-far={22}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-bias={-0.0005}
      />

      <directionalLight position={[-5, 3.5, -3]} intensity={0.45} color="#E6FFFA" />

      <ResponsiveCamera />
      <RotatingDioramaRig {...props} />
      <SoftGroundShadow />
    </Canvas>
  );
}
