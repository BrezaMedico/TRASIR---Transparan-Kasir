"use client";

import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group, MeshStandardMaterial } from "three";
import {
  DIORAMA_PALETTE as P,
  DIORAMA_TIMING,
  type SceneId,
} from "./dioramaConfig";

/**
 * Ukuran bilik kubik dengan alas persegi 1:1.
 * Lantai: X [-1.47..1.47], Z [-1.47..1.47]. Ruang dalam: X/Z [-1.35..1.35].
 */
export const ROOM_SIZE = 2.94;
const HALF = ROOM_SIZE / 2;
const WALL_T = 0.12;
const WALL_H = 2.24;
/** Permukaan dalam dinding belakang (Z) dan dinding kiri (X) */
const INNER = -(HALF - WALL_T);

export const SCENE_SHELL_COLORS: Record<SceneId, { floor: string; accent: string }> = {
  0: { floor: P.floorWarm, accent: P.tealPrimary },
  1: { floor: P.floorWarehouse, accent: P.tealDeep },
  2: { floor: P.floorCafe, accent: P.woodMedium },
};

interface PopInItemProps {
  delay: number;
  animSeed: number;
  playItems: boolean;
  reducedMotion: boolean;
  position: [number, number, number];
  children: React.ReactNode;
}

/**
 * Kurva overshoot halus 0 -> 1.08 -> 1.0 tanpa re-render React per frame
 */
function evaluateOvershoot(t: number): number {
  if (t <= 0) return 0.001;
  if (t >= 1) return 1;
  if (t < 0.72) {
    const p = t / 0.72;
    const eased = 1 - Math.pow(1 - p, 3);
    return 0.001 + eased * 1.079;
  }
  const p = (t - 0.72) / 0.28;
  const eased = 1 - Math.pow(1 - p, 2);
  return 1.08 - eased * 0.08;
}

function PopInItem({
  delay,
  animSeed,
  playItems,
  reducedMotion,
  position,
  children,
}: PopInItemProps) {
  const groupRef = useRef<Group>(null);
  const elapsedRef = useRef<number>(0);
  const doneRef = useRef<boolean>(reducedMotion);

  useEffect(() => {
    elapsedRef.current = 0;
    doneRef.current = reducedMotion;
    const node = groupRef.current;
    if (!node) return;
    if (reducedMotion) {
      node.visible = true;
      node.scale.setScalar(1);
      return;
    }
    node.visible = false;
    node.scale.setScalar(0.001);
  }, [animSeed, playItems, reducedMotion]);

  useFrame((_, delta) => {
    const node = groupRef.current;
    if (!node) return;

    if (reducedMotion) {
      node.visible = true;
      node.scale.setScalar(1);
      return;
    }

    if (!playItems) {
      node.visible = false;
      node.scale.setScalar(0.001);
      return;
    }

    if (doneRef.current) return;

    elapsedRef.current += Math.min(delta, 0.05);
    const localTime = elapsedRef.current - delay;
    if (localTime <= 0) {
      node.visible = false;
      node.scale.setScalar(0.001);
      return;
    }

    node.visible = true;
    const progress = Math.min(localTime / 0.36, 1);
    node.scale.setScalar(evaluateOvershoot(progress));

    if (progress >= 1) {
      node.scale.setScalar(1);
      doneRef.current = true;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      visible={reducedMotion}
      scale={reducedMotion ? 1 : 0.001}
    >
      {children}
    </group>
  );
}

/**
 * Cangkang bilik kubik bersama (lantai persegi + dinding belakang + dinding kiri + lis rendah depan/kanan).
 * Warna lantai dan lis aksen dikendalikan dari luar lewat ref agar dapat berganti halus saat transisi.
 */
export function RoomShell({
  floorMatRef,
  accentMatRef,
}: {
  floorMatRef: React.RefObject<MeshStandardMaterial | null>;
  accentMatRef: React.RefObject<MeshStandardMaterial | null>;
}) {
  return (
    <group>
      <RoundedBox
        args={[ROOM_SIZE, 0.16, ROOM_SIZE]}
        radius={0.04}
        smoothness={3}
        position={[0, -0.08, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial ref={floorMatRef} color={P.floorWarm} roughness={0.86} />
      </RoundedBox>

      {/* Dinding belakang */}
      <RoundedBox
        args={[ROOM_SIZE, WALL_H, WALL_T]}
        radius={0.03}
        smoothness={3}
        position={[0, WALL_H / 2 - 0.05, -HALF + WALL_T / 2]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={P.wallBase} roughness={0.9} />
      </RoundedBox>

      {/* Lis aksen tipis di dinding belakang */}
      <mesh position={[0.06, 2.08, INNER + 0.008]} receiveShadow>
        <boxGeometry args={[ROOM_SIZE - 0.32, 0.05, 0.015]} />
        <meshStandardMaterial ref={accentMatRef} color={P.tealPrimary} roughness={0.65} />
      </mesh>

      {/* Dinding kiri (menyambung rapat di muka dalam dinding belakang tanpa tumpang tindih Z-fighting) */}
      <RoundedBox
        args={[WALL_T, WALL_H, ROOM_SIZE - WALL_T]}
        radius={0.03}
        smoothness={3}
        position={[-HALF + WALL_T / 2, WALL_H / 2 - 0.05, WALL_T / 2]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={P.wallOuter} roughness={0.9} />
      </RoundedBox>

      {/* Lis rendah sisi kanan dan depan (bebas tumpang tindih sudut) */}
      <RoundedBox
        args={[0.08, 0.2, ROOM_SIZE - WALL_T]}
        radius={0.025}
        smoothness={2}
        position={[HALF - 0.04, 0.1, WALL_T / 2]}
        receiveShadow
      >
        <meshStandardMaterial color={P.wallTrim} roughness={0.85} />
      </RoundedBox>
      <RoundedBox
        args={[ROOM_SIZE - WALL_T - 0.08, 0.2, 0.08]}
        radius={0.025}
        smoothness={2}
        position={[(WALL_T - 0.08) / 2, 0.1, HALF - 0.04]}
        receiveShadow
      >
        <meshStandardMaterial color={P.wallTrim} roughness={0.85} />
      </RoundedBox>
    </group>
  );
}

interface SceneProps {
  animSeed: number;
  playItems: boolean;
  reducedMotion: boolean;
}

/* ============================================================================
 * ADEGAN 1: KASIR TOKO BAHAN BAKU
 * ========================================================================== */
function RetailSupplyScene({ animSeed, playItems, reducedMotion }: SceneProps) {
  const stagger = DIORAMA_TIMING.catalogStaggerSec;
  const shelfZ = INNER + 0.2;

  const catalogItems: Array<{
    pos: [number, number, number];
    kind: "box" | "bottle" | "jar" | "sack";
    color: string;
    lidColor?: string;
  }> = [
    { pos: [-0.88, 1.44, shelfZ], kind: "jar", color: P.cream, lidColor: P.tealPrimary },
    { pos: [-0.52, 1.44, shelfZ], kind: "jar", color: "#FDE68A", lidColor: P.woodDark },
    { pos: [-0.14, 1.45, shelfZ], kind: "box", color: P.tealPrimary },
    { pos: [0.24, 1.45, shelfZ], kind: "box", color: P.terracotta },
    { pos: [0.62, 1.46, shelfZ], kind: "bottle", color: "#F59E0B", lidColor: P.cream },
    { pos: [0.92, 1.46, shelfZ], kind: "bottle", color: "#F59E0B", lidColor: P.cream },
    { pos: [-0.86, 0.99, shelfZ], kind: "box", color: P.cardboard },
    { pos: [-0.46, 1.0, shelfZ], kind: "bottle", color: P.tealSoft, lidColor: P.tealDeep },
    { pos: [-0.1, 0.99, shelfZ], kind: "box", color: P.slateLight },
    { pos: [0.3, 0.99, shelfZ], kind: "jar", color: "#FDBA74", lidColor: P.slateDark },
    { pos: [0.74, 0.99, shelfZ], kind: "box", color: P.tealDeep },
    { pos: [-0.74, 0.3, shelfZ + 0.08], kind: "sack", color: "#E7DFD3" },
    { pos: [-0.28, 0.3, shelfZ + 0.08], kind: "sack", color: "#DDD2C0" },
    { pos: [0.18, 0.3, shelfZ + 0.08], kind: "sack", color: "#E7DFD3" },
    // Karung di atas peti kayu depan kiri
    { pos: [-0.86, 0.5, 0.42], kind: "sack", color: "#DDD2C0" },
    { pos: [-0.86, 0.5, 0.86], kind: "sack", color: "#E7DFD3" },
  ];

  return (
    <group>
      {/* Rak katalog utama di dinding belakang */}
      <group position={[0.02, 0, shelfZ]}>
        <RoundedBox args={[0.07, 1.62, 0.34]} radius={0.015} position={[-1.12, 0.81, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={P.woodMedium} roughness={0.78} />
        </RoundedBox>
        <RoundedBox args={[0.07, 1.62, 0.34]} radius={0.015} position={[1.12, 0.81, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={P.woodMedium} roughness={0.78} />
        </RoundedBox>
        {[0.14, 0.85, 1.3].map((y, idx) => (
          <RoundedBox key={idx} args={[2.24, 0.06, 0.34]} radius={0.015} position={[0, y, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={P.woodLight} roughness={0.75} />
          </RoundedBox>
        ))}
      </group>

      {/* Rak dinding kiri */}
      <group position={[INNER + 0.17, 0, -0.35]}>
        <RoundedBox args={[0.28, 0.05, 0.82]} radius={0.015} position={[0, 1.12, 0]} castShadow>
          <meshStandardMaterial color={P.woodLight} roughness={0.75} />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.05, 0.82]} radius={0.015} position={[0, 0.68, 0]} castShadow>
          <meshStandardMaterial color={P.woodLight} roughness={0.75} />
        </RoundedBox>
        <RoundedBox args={[0.04, 0.24, 0.62]} radius={0.015} position={[-0.14, 1.54, 0]}>
          <meshStandardMaterial color={P.tealPrimary} roughness={0.6} />
        </RoundedBox>
      </group>

      {/* Peti kayu bahan baku depan kiri */}
      {[0.42, 0.86].map((z, idx) => (
        <RoundedBox key={idx} args={[0.42, 0.32, 0.38]} radius={0.025} position={[-0.86, 0.16, z]} castShadow receiveShadow>
          <meshStandardMaterial color={P.woodMedium} roughness={0.82} />
        </RoundedBox>
      ))}

      {catalogItems.map((item, idx) => (
        <PopInItem
          key={idx}
          delay={0.08 + idx * stagger}
          animSeed={animSeed}
          playItems={playItems}
          reducedMotion={reducedMotion}
          position={item.pos}
        >
          {item.kind === "box" && (
            <RoundedBox args={[0.24, 0.22, 0.2]} radius={0.03} smoothness={2} castShadow>
              <meshStandardMaterial color={item.color} roughness={0.75} />
            </RoundedBox>
          )}
          {item.kind === "bottle" && (
            <group>
              <mesh castShadow>
                <cylinderGeometry args={[0.065, 0.075, 0.24, 16]} />
                <meshStandardMaterial color={item.color} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.14, 0]} castShadow>
                <cylinderGeometry args={[0.035, 0.04, 0.05, 14]} />
                <meshStandardMaterial color={item.lidColor ?? P.cream} roughness={0.6} />
              </mesh>
            </group>
          )}
          {item.kind === "jar" && (
            <group>
              <mesh castShadow>
                <cylinderGeometry args={[0.085, 0.085, 0.19, 16]} />
                <meshStandardMaterial color={item.color} roughness={0.55} />
              </mesh>
              <mesh position={[0, 0.11, 0]} castShadow>
                <cylinderGeometry args={[0.09, 0.09, 0.04, 16]} />
                <meshStandardMaterial color={item.lidColor ?? P.tealPrimary} roughness={0.6} />
              </mesh>
            </group>
          )}
          {item.kind === "sack" && (
            <group>
              <RoundedBox args={[0.32, 0.34, 0.24]} radius={0.09} smoothness={3} castShadow>
                <meshStandardMaterial color={item.color} roughness={0.92} />
              </RoundedBox>
              <mesh position={[0, 0.17, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 0.06, 12]} />
                <meshStandardMaterial color={P.terracotta} roughness={0.85} />
              </mesh>
            </group>
          )}
        </PopInItem>
      ))}

      {/* Meja kasir + monitor POS + QRIS/EDC */}
      <group position={[0.42, 0, 0.5]}>
        <RoundedBox args={[1.38, 0.66, 0.52]} radius={0.04} smoothness={3} position={[0, 0.33, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#FFFFFF" roughness={0.78} />
        </RoundedBox>
        <RoundedBox args={[1.22, 0.44, 0.03]} radius={0.02} position={[0, 0.33, 0.255]}>
          <meshStandardMaterial color={P.tealPrimary} roughness={0.65} />
        </RoundedBox>
        <RoundedBox args={[1.44, 0.06, 0.58]} radius={0.025} smoothness={2} position={[0, 0.69, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={P.woodLight} roughness={0.7} />
        </RoundedBox>

        <group position={[-0.2, 0.72, -0.02]} rotation={[0, -0.18, 0]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.08, 0.1, 0.08]} />
            <meshStandardMaterial color={P.slateDark} roughness={0.5} />
          </mesh>
          <RoundedBox args={[0.38, 0.26, 0.04]} radius={0.02} position={[0, 0.2, 0.02]} rotation={[-0.14, 0, 0]} castShadow>
            <meshStandardMaterial color={P.slateDark} roughness={0.45} />
          </RoundedBox>
          <mesh position={[0, 0.2, 0.042]} rotation={[-0.14, 0, 0]}>
            <planeGeometry args={[0.32, 0.2]} />
            <meshStandardMaterial color={P.tealSoft} emissive={P.tealPrimary} emissiveIntensity={0.22} roughness={0.3} />
          </mesh>
        </group>

        <group position={[0.36, 0.72, 0.06]}>
          <RoundedBox args={[0.14, 0.19, 0.03]} radius={0.015} position={[0, 0.1, 0]} rotation={[-0.12, -0.25, 0]} castShadow>
            <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.11, 0.018]} rotation={[-0.12, -0.25, 0]}>
            <planeGeometry args={[0.09, 0.09]} />
            <meshStandardMaterial color={P.slateDark} roughness={0.8} />
          </mesh>
          <RoundedBox args={[0.1, 0.05, 0.15]} radius={0.015} position={[0.18, 0.03, 0.04]} rotation={[0.15, 0.1, 0]} castShadow>
            <meshStandardMaterial color={P.slateDark} roughness={0.5} />
          </RoundedBox>
        </group>
      </group>
    </group>
  );
}

/* ============================================================================
 * ADEGAN 2: GUDANG & AUDIT STOK
 * ========================================================================== */
function WarehouseAuditScene({ animSeed, playItems, reducedMotion }: SceneProps) {
  const pulseMatRef = useRef<MeshStandardMaterial>(null);
  const rackZ = INNER + 0.24;

  useFrame(({ clock }) => {
    if (!pulseMatRef.current || reducedMotion) return;
    const wave = (Math.sin(clock.getElapsedTime() * 3.2) + 1) * 0.5;
    pulseMatRef.current.emissiveIntensity = 0.15 + wave * 0.45;
  });

  const warehouseBoxes: Array<{
    pos: [number, number, number];
    size: [number, number, number];
    color: string;
  }> = [
    { pos: [-0.82, 1.46, rackZ], size: [0.42, 0.28, 0.32], color: P.cardboard },
    { pos: [-0.28, 1.44, rackZ], size: [0.36, 0.24, 0.3], color: P.cardboardDark },
    { pos: [0.28, 1.48, rackZ], size: [0.44, 0.32, 0.32], color: P.cardboard },
    { pos: [0.84, 1.44, rackZ], size: [0.38, 0.24, 0.3], color: "#E2C299" },
    { pos: [-0.74, 0.94, rackZ], size: [0.48, 0.3, 0.34], color: P.cardboardDark },
    { pos: [-0.14, 0.92, rackZ], size: [0.42, 0.26, 0.32], color: P.cardboard },
    { pos: [0.48, 0.95, rackZ], size: [0.46, 0.32, 0.34], color: "#E2C299" },
    { pos: [-0.72, 0.32, 0.3], size: [0.46, 0.34, 0.4], color: P.cardboard },
    { pos: [-0.22, 0.28, 0.32], size: [0.4, 0.26, 0.36], color: P.cardboardDark },
    { pos: [-0.52, 0.62, 0.3], size: [0.36, 0.26, 0.32], color: "#E2C299" },
  ];

  return (
    <group>
      {/* Garis zona gudang tertutup di lantai depan */}
      <mesh position={[0, 0.005, 1.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.56, 0.06]} />
        <meshStandardMaterial color={P.amberSoft} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.006, 0.96]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.56, 0.03]} />
        <meshStandardMaterial color={P.tealPrimary} roughness={0.7} />
      </mesh>

      {/* Rak besi industrial */}
      <group position={[0, 0, rackZ]}>
        {[-1.16, 0, 1.16].map((x, idx) => (
          <group key={idx} position={[x, 0.86, 0]}>
            <mesh position={[0, 0, -0.18]} castShadow>
              <boxGeometry args={[0.055, 1.72, 0.055]} />
              <meshStandardMaterial color={P.metalDark} roughness={0.55} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0, 0.18]} castShadow>
              <boxGeometry args={[0.055, 1.72, 0.055]} />
              <meshStandardMaterial color={P.metalDark} roughness={0.55} metalness={0.2} />
            </mesh>
          </group>
        ))}
        {[0.18, 0.76, 1.29].map((y, idx) => (
          <RoundedBox key={idx} args={[2.38, 0.05, 0.42]} radius={0.01} position={[0, y, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={P.metalLight} roughness={0.6} metalness={0.15} />
          </RoundedBox>
        ))}
      </group>

      {/* Palet kayu */}
      <RoundedBox args={[1.08, 0.09, 0.56]} radius={0.015} position={[-0.5, 0.06, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={P.woodMedium} roughness={0.85} />
      </RoundedBox>

      {warehouseBoxes.map((b, idx) => (
        <PopInItem
          key={idx}
          delay={0.05 + idx * 0.055}
          animSeed={animSeed}
          playItems={playItems}
          reducedMotion={reducedMotion}
          position={b.pos}
        >
          <RoundedBox args={b.size} radius={0.025} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color={b.color} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, b.size[1] / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[b.size[0] * 0.85, 0.05]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
          </mesh>
        </PopInItem>
      ))}

      {/* Stasiun audit stok */}
      <group position={[0.74, 0, 0.36]}>
        <RoundedBox args={[0.62, 0.72, 0.48]} radius={0.035} position={[0, 0.36, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={P.slateDark} roughness={0.65} />
        </RoundedBox>
        <RoundedBox args={[0.68, 0.05, 0.54]} radius={0.02} position={[0, 0.74, 0]} castShadow>
          <meshStandardMaterial color="#FFFFFF" roughness={0.7} />
        </RoundedBox>

        <group position={[-0.12, 0.78, 0.02]} rotation={[0, 0.22, 0]}>
          <RoundedBox args={[0.24, 0.025, 0.3]} radius={0.01} castShadow>
            <meshStandardMaterial color={P.woodMedium} roughness={0.75} />
          </RoundedBox>
          <mesh position={[0, 0.015, 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.18, 0.23]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
          </mesh>
        </group>

        <group position={[0.16, 0.82, 0.05]} rotation={[0, -0.35, 0]}>
          <RoundedBox args={[0.09, 0.14, 0.14]} radius={0.025} castShadow>
            <meshStandardMaterial color={P.tealPrimary} roughness={0.45} />
          </RoundedBox>
          <mesh position={[0, 0.03, 0.075]}>
            <boxGeometry args={[0.06, 0.025, 0.01]} />
            <meshStandardMaterial
              ref={pulseMatRef}
              color={P.tealSoft}
              emissive={P.tealPrimary}
              emissiveIntensity={0.35}
              roughness={0.25}
            />
          </mesh>
        </group>
      </group>

      {/* Papan status zona di dinding kiri */}
      <RoundedBox args={[0.04, 0.34, 0.74]} radius={0.02} position={[INNER + 0.02, 1.38, -0.2]}>
        <meshStandardMaterial color={P.tealDeep} roughness={0.6} />
      </RoundedBox>
    </group>
  );
}

/* ============================================================================
 * ADEGAN 3: KASIR KAFE
 * ========================================================================== */
function CafeCashierScene({ animSeed, playItems, reducedMotion }: SceneProps) {
  const barZ = 0.2;
  const cups: Array<{ pos: [number, number, number]; height: number }> = [
    { pos: [0.36, 0.88, barZ + 0.02], height: 0.17 },
    { pos: [0.54, 0.895, barZ], height: 0.2 },
    { pos: [0.72, 0.88, barZ + 0.04], height: 0.17 },
  ];

  const syrups: Array<{ x: number; color: string }> = [
    { x: -0.78, color: "#92400E" },
    { x: -0.58, color: "#D97706" },
    { x: -0.38, color: P.tealPrimary },
    { x: -0.18, color: "#FAF7F2" },
  ];

  return (
    <group>
      {/* Papan menu */}
      <RoundedBox args={[1.18, 0.54, 0.05]} radius={0.03} position={[0.42, 1.46, INNER + 0.03]} castShadow>
        <meshStandardMaterial color={P.slateDark} roughness={0.75} />
      </RoundedBox>
      {[1.56, 1.46, 1.36].map((y, idx) => (
        <mesh key={idx} position={[0.38, y, INNER + 0.06]}>
          <boxGeometry args={[0.78 - idx * 0.12, 0.035, 0.01]} />
          <meshStandardMaterial color={idx === 0 ? P.tealSoft : P.cream} roughness={0.7} />
        </mesh>
      ))}

      {/* Rak sirup */}
      <RoundedBox args={[1.02, 0.055, 0.24]} radius={0.015} position={[-0.48, 1.14, INNER + 0.12]} castShadow>
        <meshStandardMaterial color={P.woodLight} roughness={0.72} />
      </RoundedBox>
      {syrups.map((s, idx) => (
        <PopInItem
          key={idx}
          delay={0.06 + idx * 0.07}
          animSeed={animSeed}
          playItems={playItems}
          reducedMotion={reducedMotion}
          position={[s.x, 1.29, INNER + 0.12]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.055, 0.06, 0.24, 16]} />
            <meshStandardMaterial color={s.color} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.145, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.05, 12]} />
            <meshStandardMaterial color={P.slateDark} roughness={0.5} />
          </mesh>
        </PopInItem>
      ))}

      {/* Kabinet belakang */}
      <RoundedBox args={[2.16, 0.62, 0.34]} radius={0.03} position={[0, 0.31, INNER + 0.17]} castShadow receiveShadow>
        <meshStandardMaterial color={P.woodLight} roughness={0.8} />
      </RoundedBox>

      {/* Meja bar */}
      <group position={[0.08, 0, barZ]}>
        <RoundedBox args={[1.92, 0.72, 0.56]} radius={0.04} smoothness={3} position={[0, 0.36, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={P.woodMedium} roughness={0.78} />
        </RoundedBox>
        {[-0.72, -0.36, 0, 0.36, 0.72].map((x, idx) => (
          <mesh key={idx} position={[x, 0.36, 0.285]}>
            <boxGeometry args={[0.035, 0.62, 0.015]} />
            <meshStandardMaterial color={P.woodDark} roughness={0.82} />
          </mesh>
        ))}
        <RoundedBox args={[1.98, 0.06, 0.62]} radius={0.025} position={[0, 0.75, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#FAF9F6" roughness={0.55} />
        </RoundedBox>

        <group position={[-0.58, 0.78, -0.02]}>
          <RoundedBox args={[0.48, 0.36, 0.34]} radius={0.035} position={[0, 0.18, 0]} castShadow>
            <meshStandardMaterial color={P.slateDark} roughness={0.38} metalness={0.25} />
          </RoundedBox>
          <RoundedBox args={[0.42, 0.12, 0.04]} radius={0.015} position={[0, 0.28, 0.165]}>
            <meshStandardMaterial color={P.tealPrimary} roughness={0.45} />
          </RoundedBox>
          <RoundedBox args={[0.44, 0.04, 0.16]} radius={0.01} position={[0, 0.02, 0.19]}>
            <meshStandardMaterial color={P.metalLight} roughness={0.4} metalness={0.35} />
          </RoundedBox>
          <mesh position={[-0.08, 0.16, 0.19]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.05, 14]} />
            <meshStandardMaterial color={P.metalLight} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>

        <group position={[-0.14, 0.78, -0.05]}>
          <RoundedBox args={[0.16, 0.22, 0.16]} radius={0.025} position={[0, 0.11, 0]} castShadow>
            <meshStandardMaterial color={P.slateMid} roughness={0.5} />
          </RoundedBox>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.075, 0.035, 0.14, 16]} />
            <meshStandardMaterial color={P.woodDark} roughness={0.5} />
          </mesh>
        </group>

        <group position={[0.14, 0.78, 0.06]} rotation={[0, -0.24, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color={P.slateDark} roughness={0.5} />
          </mesh>
          <RoundedBox args={[0.3, 0.21, 0.03]} radius={0.018} position={[0, 0.19, 0.02]} rotation={[-0.18, 0, 0]} castShadow>
            <meshStandardMaterial color={P.slateDark} roughness={0.45} />
          </RoundedBox>
          <mesh position={[0, 0.19, 0.038]} rotation={[-0.18, 0, 0]}>
            <planeGeometry args={[0.25, 0.16]} />
            <meshStandardMaterial color={P.tealSoft} emissive={P.tealPrimary} emissiveIntensity={0.2} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Kursi bar di depan meja */}
      {[-0.5, 0.1, 0.7].map((x, idx) => (
        <group key={idx} position={[x, 0, 0.85]}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.48, 10]} />
            <meshStandardMaterial color={P.metalDark} roughness={0.5} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.12, 0.05, 18]} />
            <meshStandardMaterial color={P.woodDark} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.02, 16]} />
            <meshStandardMaterial color={P.metalDark} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {cups.map((c, idx) => (
        <PopInItem
          key={idx}
          delay={0.14 + idx * 0.1}
          animSeed={animSeed}
          playItems={playItems}
          reducedMotion={reducedMotion}
          position={c.pos}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.044, c.height, 16]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.056, 0.05, 0.065, 16]} />
            <meshStandardMaterial color={idx === 1 ? P.tealPrimary : P.woodLight} roughness={0.75} />
          </mesh>
          <mesh position={[0, c.height / 2 + 0.012, 0]}>
            <cylinderGeometry args={[0.064, 0.064, 0.024, 16]} />
            <meshStandardMaterial color={P.slateDark} roughness={0.6} />
          </mesh>
        </PopInItem>
      ))}
    </group>
  );
}

/**
 * Isi interior satu adegan (tanpa cangkang bilik).
 */
export function SceneInterior({
  sceneId,
  animSeed,
  playItems,
  reducedMotion,
}: {
  sceneId: SceneId;
  animSeed: number;
  playItems: boolean;
  reducedMotion: boolean;
}) {
  const props = { animSeed, playItems, reducedMotion };
  switch (sceneId) {
    case 0:
      return <RetailSupplyScene {...props} />;
    case 1:
      return <WarehouseAuditScene {...props} />;
    case 2:
      return <CafeCashierScene {...props} />;
  }
}
