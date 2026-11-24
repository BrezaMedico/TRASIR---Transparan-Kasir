"use client";

import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DIORAMA_SCENES,
  DIORAMA_TIMING,
  type SceneId,
} from "./dioramaConfig";
import { ChatBubbleOverlay } from "./ChatBubbleOverlay";

const DioramaCanvas = dynamic(() => import("./DioramaCanvas"), {
  ssr: false,
  loading: () => <DioramaSkeleton />,
});

function DioramaSkeleton() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-transparent"
      role="status"
      aria-label="Memuat panggung 3D miniatur"
    >
      <div className="h-44 w-56 animate-pulse rounded-2xl bg-slate-100/80" />
    </div>
  );
}

/**
 * Fallback elegan jika browser/perangkat tidak mendukung WebGL
 */
class WebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function StaticDioramaFallback({ activeScene }: { activeScene: SceneId }) {
  const scene = DIORAMA_SCENES[activeScene];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-transparent p-6 text-center">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0F766E]">
          {scene.shortLabel}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{scene.title}</p>
        <p className="mt-2 max-w-xs text-xs text-slate-600">
          {scene.rightBubble.text}
        </p>
      </div>
    </div>
  );
}

function detectWebGLSupport(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function HeroDiorama3D({ paused = false }: { paused?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [activeScene, setActiveScene] = useState<SceneId>(0);
  const [bayAScene, setBayAScene] = useState<SceneId>(0);
  const [bayBScene, setBayBScene] = useState<SceneId>(1);
  const [bayASeed, setBayASeed] = useState<number>(1);
  const [bayBSeed, setBayBSeed] = useState<number>(1);
  // Tunggu kanvas WebGL benar-benar tampil sebelum memulai animasi item & loop rotasi
  const [canvasMounted, setCanvasMounted] = useState<boolean>(false);
  const [bayAPlayItems, setBayAPlayItems] = useState<boolean>(false);
  const [bayBPlayItems, setBayBPlayItems] = useState<boolean>(false);

  const [showRightBubble, setShowRightBubble] = useState<boolean>(false);
  const [showBottomBubble, setShowBottomBubble] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [webglReady, setWebglReady] = useState<boolean>(true);
  const [inView, setInView] = useState<boolean>(true);
  const [pageVisible, setPageVisible] = useState<boolean>(true);

  const isCanvasActive = !paused && inView && pageVisible;

  const timersRef = useRef<number[]>([]);
  const stepRef = useRef<number>(0);
  const activeSceneRef = useRef<SceneId>(0);

  stepRef.current = stepIndex;
  activeSceneRef.current = activeScene;

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    setWebglReady(detectWebGLSupport());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncVisibility = () => {
      setPageVisible(document.visibilityState !== "hidden");
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    const node = containerRef.current;
    let observer: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry) {
            setInView(entry.isIntersecting);
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(node);
    }

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      observer?.disconnect();
    };
  }, []);

  /**
   * Memicu rotasi horizontal ke kiri menuju adegan target:
   * Bilik tujuan disiapkan KOSONG total selama berputar, lalu animasi isi item berjalan setelah rotasi selesai.
   */
  const transitionToScene = useCallback(
    (targetScene: SceneId) => {
      if (targetScene === activeSceneRef.current || isRotating) return;

      clearAllTimers();
      setShowRightBubble(false);
      setShowBottomBubble(false);

      const nextStep = stepRef.current + 1;
      const nextIsBayA = nextStep % 2 === 0;

      if (nextIsBayA) {
        setBayAPlayItems(false);
        setBayAScene(targetScene);
        setBayASeed((s) => s + 1);
      } else {
        setBayBPlayItems(false);
        setBayBScene(targetScene);
        setBayBSeed((s) => s + 1);
      }

      if (!webglReady) {
        setActiveScene(targetScene);
        setStepIndex(nextStep);
        if (nextIsBayA) setBayAPlayItems(true);
        else setBayBPlayItems(true);
        return;
      }

      const startSpinId = window.setTimeout(() => {
        setIsRotating(true);
        setActiveScene(targetScene);
        setStepIndex(nextStep);
      }, reducedMotion ? 0 : DIORAMA_TIMING.chatExitLeadMs);

      timersRef.current.push(startSpinId);
    },
    [clearAllTimers, isRotating, reducedMotion, webglReady]
  );

  const handleCanvasReady = useCallback(() => {
    setCanvasMounted(true);
    setBayAPlayItems(true);
  }, []);

  /**
   * Dipanggil tepat ketika rotasi 360 derajat selesai:
   * Baru sekarang item mulai masuk satu per satu ke rak/katalog bilik yang menghadap depan.
   */
  const handleRotationComplete = useCallback(() => {
    setIsRotating(false);

    if (stepRef.current % 2 === 0) {
      setBayAPlayItems(true);
    } else {
      setBayBPlayItems(true);
    }
  }, []);

  /**
   * State machine koreografi chat + loop otomatis penuh (aktif setelah kanvas WebGL siap)
   */
  useEffect(() => {
    clearAllTimers();
    if (isRotating || !isCanvasActive) return;
    if (webglReady && !canvasMounted) return;

    const meta = DIORAMA_SCENES[activeScene];

    if (reducedMotion) {
      setShowRightBubble(true);
      setShowBottomBubble(true);
      return;
    }

    const rightTimer = window.setTimeout(() => {
      setShowRightBubble(true);
    }, meta.chatStartDelayMs);
    timersRef.current.push(rightTimer);

    const bottomTimer = window.setTimeout(() => {
      setShowBottomBubble(true);
    }, meta.chatStartDelayMs + DIORAMA_TIMING.secondBubbleDelayMs);
    timersRef.current.push(bottomTimer);

    const nextScene = ((activeScene + 1) % DIORAMA_SCENES.length) as SceneId;
    const advanceDelay =
      meta.chatStartDelayMs +
      DIORAMA_TIMING.secondBubbleDelayMs +
      meta.chatHoldDurationMs;

    const advanceTimer = window.setTimeout(() => {
      transitionToScene(nextScene);
    }, advanceDelay);

    timersRef.current.push(advanceTimer);

    return clearAllTimers;
  }, [
    activeScene,
    canvasMounted,
    isCanvasActive,
    isRotating,
    reducedMotion,
    webglReady,
    clearAllTimers,
    transitionToScene,
  ]);

  const currentMeta = DIORAMA_SCENES[activeScene];

  return (
    <div
      ref={containerRef}
      role="region"
      className="relative flex min-h-[440px] w-full flex-col overflow-visible bg-transparent sm:min-h-[520px] lg:min-h-[560px]"
      aria-label={`Visualisasi 3D miniatur operasional: ${currentMeta.title}`}
    >
      <p className="sr-only">
        {currentMeta.title}. {currentMeta.summary} {currentMeta.rightBubble.sender}:{" "}
        {currentMeta.rightBubble.text} {currentMeta.bottomBubble.sender}:{" "}
        {currentMeta.bottomBubble.text}
      </p>

      {/* Panggung 3D WebGL langsung menyatu dengan latar hero */}
      <div className="relative h-[440px] w-full sm:h-[520px] lg:h-[560px]">
        {/* Kanvas sedikit lebih lebar dari kolom agar model dan bayangan tidak terpotong di tepi kanan */}
        <div className="absolute inset-y-0 left-0 right-0 lg:-right-6 xl:-right-24">
          {webglReady ? (
            <WebGLErrorBoundary
              fallback={<StaticDioramaFallback activeScene={activeScene} />}
            >
              <DioramaCanvas
                stepIndex={stepIndex}
                bayAScene={bayAScene}
                bayBScene={bayBScene}
                bayASeed={bayASeed}
                bayBSeed={bayBSeed}
                bayAPlayItems={bayAPlayItems}
                bayBPlayItems={bayBPlayItems}
                reducedMotion={reducedMotion}
                active={isCanvasActive}
                onCanvasReady={handleCanvasReady}
                onRotationComplete={handleRotationComplete}
                onContextLost={() => setWebglReady(false)}
              />
            </WebGLErrorBoundary>
          ) : (
            <StaticDioramaFallback activeScene={activeScene} />
          )}
        </div>

        {/* Overlay Gelembung Chat Gaya WhatsApp */}
        <ChatBubbleOverlay
          scene={currentMeta}
          showRight={showRightBubble}
          showBottom={showBottomBubble}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
