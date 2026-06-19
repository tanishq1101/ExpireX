import { useRef, useEffect, useState, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  MeshReflectorMaterial,
  Sparkles,
  Trail,
  useTexture,
  Billboard,
} from "@react-three/drei";
import { EffectComposer, Bloom, DepthOfField, Vignette, ChromaticAberration, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useState as useStateR } from "react";

/* ─── GSAP-free spring/lerp utilities ─── */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInOutQuart(t) { return t < 0.5 ? 8*t*t*t*t : 1-Math.pow(-2*t+2,4)/2; }

/* ─── SCENE TIMELINE ─── */
// scene 0: black  0–1.5s
// scene 1: emerge  1.5–4.5s
// scene 2: headlights  4.5–5.5s
// scene 3: orbit  5.5–9.5s
// scene 4: platform  9.5–11.5s
// scene 5: hero shot  11.5–14.5s
// scene 6: enter btn  14.5–16s
const TIMELINE = {
  blackEnd: 1.5,
  emergeEnd: 4.5,
  headlightEnd: 5.5,
  orbitEnd: 9.5,
  platformEnd: 11.5,
  heroEnd: 14.5,
  btnEnd: 16.0,
};

/* ═══════════════════════════════════════
   PROCEDURAL SUPERCAR GEOMETRY
═══════════════════════════════════════ */
function CarBody({ lightProgress, headlightOn }) {
  const bodyRef = useRef();
  const glassRef = useRef();
  const wheelFLRef = useRef();
  const wheelFRRef = useRef();
  const wheelRLRef = useRef();
  const wheelRRRef = useRef();
  const brakeFL = useRef();
  const brakeFR = useRef();
  const grillRef = useRef();
  const headlightLRef = useRef();
  const headlightRRef = useRef();
  const tailLRef = useRef();
  const tailRRef = useRef();

  /* Paint: deep midnight blue with metallic flakes */
  const paintMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.04, 0.06, 0.18),
    metalness: 0.92,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 1.0,
    envMapIntensity: 2.2,
  }), []);

  const carbonMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.05, 0.05, 0.07),
    metalness: 0.4,
    roughness: 0.35,
    envMapIntensity: 1.0,
  }), []);

  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.15, 0.2, 0.35),
    metalness: 0.1,
    roughness: 0.0,
    transmission: 0.88,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 3.0,
  }), []);

  const chromeMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.85, 0.88, 0.92),
    metalness: 1.0,
    roughness: 0.02,
    envMapIntensity: 3.0,
  }), []);

  const tireMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.06, 0.06, 0.07),
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  const rimMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.7, 0.72, 0.78),
    metalness: 0.95,
    roughness: 0.05,
    envMapIntensity: 2.5,
  }), []);

  const brakeMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.85, 0.12, 0.06),
    metalness: 0.6,
    roughness: 0.3,
    emissive: new THREE.Color(0.3, 0.04, 0.02),
    emissiveIntensity: 0.3,
  }), []);

  const headlightMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.9, 0.95, 1.0),
    emissive: new THREE.Color(0.8, 0.9, 1.0),
    emissiveIntensity: 0.0,
    metalness: 0.1,
    roughness: 0.0,
    transmission: 0.6,
    transparent: true,
  }), []);

  const tailLightMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1.0, 0.1, 0.05),
    emissive: new THREE.Color(1.0, 0.08, 0.02),
    emissiveIntensity: 0.5,
    metalness: 0.0,
    roughness: 0.15,
    transmission: 0.4,
    transparent: true,
  }), []);

  useFrame((state, delta) => {
    if (headlightLRef.current && headlightRRef.current) {
      const hl = headlightOn ? Math.min(headlightMat.emissiveIntensity + delta * 8, 8.0) : 0;
      headlightMat.emissiveIntensity = hl;
    }
    // Subtle wheel rotation during orbit
    const t = state.clock.elapsedTime;
    if (wheelFLRef.current) wheelFLRef.current.rotation.x = t * 0.4;
    if (wheelFRRef.current) wheelFRRef.current.rotation.x = t * 0.4;
    if (wheelRLRef.current) wheelRLRef.current.rotation.x = t * 0.4;
    if (wheelRRRef.current) wheelRRRef.current.rotation.x = t * 0.4;
  });

  /* Wheel assembly helper */
  const Wheel = ({ pos, ref1 }) => (
    <group position={pos} ref={ref1}>
      {/* Tire */}
      <mesh material={tireMat} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.32, 0.13, 24, 48]} />
      </mesh>
      {/* Rim */}
      <mesh material={rimMat} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.26, 0.26, 0.22, 20]} />
      </mesh>
      {/* Spokes */}
      {[0,1,2,3,4].map(i => (
        <mesh key={i} material={rimMat} rotation={[0, 0, (i / 5) * Math.PI * 2]}
          position={[0, 0, 0]}>
          <boxGeometry args={[0.52, 0.04, 0.18]} />
        </mesh>
      ))}
      {/* Brake caliper */}
      <mesh material={brakeMat} position={[0, -0.18, 0.06]}>
        <boxGeometry args={[0.14, 0.1, 0.08]} />
      </mesh>
    </group>
  );

  return (
    <group ref={bodyRef} position={[0, 0, 0]}>

      {/* ── MAIN BODY SHELL ── */}
      {/* Lower body sill */}
      <mesh material={paintMat} position={[0, -0.08, 0]}>
        <boxGeometry args={[4.5, 0.22, 1.82]} />
      </mesh>

      {/* Upper cabin volume */}
      <mesh material={paintMat} position={[0.1, 0.32, 0]}>
        <boxGeometry args={[2.1, 0.55, 1.62]} />
      </mesh>

      {/* Front nose low */}
      <mesh material={paintMat} position={[1.85, -0.18, 0]}>
        <boxGeometry args={[0.8, 0.18, 1.6]} />
      </mesh>

      {/* Front hood slope */}
      <mesh material={paintMat} position={[1.55, 0.14, 0]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[1.1, 0.08, 1.72]} />
      </mesh>

      {/* Rear haunches */}
      <mesh material={paintMat} position={[-1.6, 0.0, 0.78]}>
        <sphereGeometry args={[0.55, 16, 16, 0, Math.PI, 0, Math.PI]} />
      </mesh>
      <mesh material={paintMat} position={[-1.6, 0.0, -0.78]}>
        <sphereGeometry args={[0.55, 16, 16, 0, Math.PI, 0, Math.PI]} />
      </mesh>

      {/* Rear diffuser */}
      <mesh material={carbonMat} position={[-2.1, -0.22, 0]}>
        <boxGeometry args={[0.4, 0.2, 1.7]} />
      </mesh>

      {/* Rear wing */}
      <mesh material={carbonMat} position={[-1.9, 0.52, 0]}>
        <boxGeometry args={[0.22, 0.06, 1.5]} />
      </mesh>
      <mesh material={carbonMat} position={[-1.9, 0.36, 0.62]}>
        <boxGeometry args={[0.12, 0.32, 0.04]} />
      </mesh>
      <mesh material={carbonMat} position={[-1.9, 0.36, -0.62]}>
        <boxGeometry args={[0.12, 0.32, 0.04]} />
      </mesh>

      {/* Side skirts */}
      <mesh material={carbonMat} position={[0, -0.24, 0.92]}>
        <boxGeometry args={[3.6, 0.1, 0.15]} />
      </mesh>
      <mesh material={carbonMat} position={[0, -0.24, -0.92]}>
        <boxGeometry args={[3.6, 0.1, 0.15]} />
      </mesh>

      {/* Front splitter */}
      <mesh material={carbonMat} position={[2.18, -0.28, 0]}>
        <boxGeometry args={[0.2, 0.06, 1.85]} />
      </mesh>

      {/* ── WINDSHIELD & GLASS ── */}
      <mesh material={glassMat} ref={glassRef} position={[0.72, 0.52, 0]} rotation={[0, 0, 0.62]}>
        <boxGeometry args={[1.0, 0.06, 1.52]} />
      </mesh>
      {/* Rear screen */}
      <mesh material={glassMat} position={[-0.72, 0.52, 0]} rotation={[0, 0, -0.55]}>
        <boxGeometry args={[0.85, 0.06, 1.42]} />
      </mesh>
      {/* Side windows */}
      <mesh material={glassMat} position={[0.1, 0.44, 0.81]}>
        <boxGeometry args={[1.6, 0.38, 0.04]} />
      </mesh>
      <mesh material={glassMat} position={[0.1, 0.44, -0.81]}>
        <boxGeometry args={[1.6, 0.38, 0.04]} />
      </mesh>

      {/* ── A-PILLARS ── */}
      <mesh material={paintMat} position={[1.1, 0.42, 0.79]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.7, 0.07, 0.08]} />
      </mesh>
      <mesh material={paintMat} position={[1.1, 0.42, -0.79]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.7, 0.07, 0.08]} />
      </mesh>

      {/* ── HEADLIGHTS ── */}
      <mesh material={headlightMat} ref={headlightLRef} position={[2.02, 0.04, 0.56]}>
        <boxGeometry args={[0.12, 0.1, 0.42]} />
      </mesh>
      <mesh material={headlightMat} ref={headlightRRef} position={[2.02, 0.04, -0.56]}>
        <boxGeometry args={[0.12, 0.1, 0.42]} />
      </mesh>
      {/* DRL strip */}
      <mesh material={headlightMat} position={[2.0, -0.04, 0.55]}>
        <boxGeometry args={[0.08, 0.04, 0.38]} />
      </mesh>
      <mesh material={headlightMat} position={[2.0, -0.04, -0.55]}>
        <boxGeometry args={[0.08, 0.04, 0.38]} />
      </mesh>

      {/* ── TAIL LIGHTS ── */}
      <mesh material={tailLightMat} position={[-2.2, 0.04, 0.56]}>
        <boxGeometry args={[0.08, 0.12, 0.4]} />
      </mesh>
      <mesh material={tailLightMat} position={[-2.2, 0.04, -0.56]}>
        <boxGeometry args={[0.08, 0.12, 0.4]} />
      </mesh>

      {/* ── GRILLE ── */}
      <mesh material={carbonMat} ref={grillRef} position={[2.22, -0.06, 0]}>
        <boxGeometry args={[0.06, 0.28, 1.3]} />
      </mesh>
      {[...Array(7)].map((_, i) => (
        <mesh key={i} material={chromeMat} position={[2.24, -0.06, -0.54 + i * 0.18]}>
          <boxGeometry args={[0.05, 0.26, 0.03]} />
        </mesh>
      ))}

      {/* ── WHEELS ── */}
      <Wheel pos={[1.3, -0.32, 1.0]} ref1={wheelFLRef} />
      <Wheel pos={[1.3, -0.32, -1.0]} ref1={wheelFRRef} />
      <Wheel pos={[-1.3, -0.32, 1.0]} ref1={wheelRLRef} />
      <Wheel pos={[-1.3, -0.32, -1.0]} ref1={wheelRRRef} />

      {/* ── EXHAUST PIPES ── */}
      <mesh material={chromeMat} position={[-2.18, -0.28, 0.35]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.065, 0.065, 0.18, 16]} />
      </mesh>
      <mesh material={chromeMat} position={[-2.18, -0.28, -0.35]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.065, 0.065, 0.18, 16]} />
      </mesh>

    </group>
  );
}

/* ═══════════════════════════════════════
   VOLUMETRIC HEADLIGHT BEAMS
═══════════════════════════════════════ */
function HeadlightBeams({ active }) {
  const leftRef = useRef();
  const rightRef = useRef();

  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.7, 0.82, 1.0),
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((state, delta) => {
    const target = active ? 0.22 : 0.0;
    beamMat.opacity = lerp(beamMat.opacity, target, delta * 4);
  });

  return (
    <group>
      {/* Left beam cone */}
      <mesh ref={leftRef} material={beamMat} position={[4.5, 0.04, 0.56]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[1.4, 5.5, 16, 1, true]} />
      </mesh>
      {/* Right beam cone */}
      <mesh ref={rightRef} material={beamMat} position={[4.5, 0.04, -0.56]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[1.4, 5.5, 16, 1, true]} />
      </mesh>
      {/* Inner bright core */}
      <mesh material={new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1),
        transparent: true,
        opacity: active ? 0.08 : 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })} position={[3.2, 0.04, 0.56]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.3, 2, 12, 1, true]} />
      </mesh>
      <mesh material={new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1),
        transparent: true,
        opacity: active ? 0.08 : 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })} position={[3.2, 0.04, -0.56]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.3, 2, 12, 1, true]} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════
   SHOWCASE PLATFORM
═══════════════════════════════════════ */
function ShowcasePlatform({ visible, rotation }) {
  const matRef = useRef();

  return (
    <group rotation={[0, rotation, 0]}>
      {/* Main disc */}
      <mesh position={[0, -0.52, 0]} receiveShadow>
        <cylinderGeometry args={[3.8, 3.8, 0.04, 80]} />
        <MeshReflectorMaterial
          blur={[512, 128]}
          resolution={1024}
          mixBlur={8}
          mixStrength={visible ? 1.8 : 0.0}
          roughness={0.03}
          depthScale={1.0}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color={visible ? "#060620" : "#000000"}
          metalness={0.85}
        />
      </mesh>
      {/* Glowing rim */}
      <mesh position={[0, -0.51, 0]}>
        <torusGeometry args={[3.78, 0.04, 16, 80]} />
        <meshBasicMaterial
          color={new THREE.Color(0.0, 0.4, 1.0)}
          transparent
          opacity={visible ? 0.8 : 0.0}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Underglow strips */}
      {visible && [0, 1, 2, 3].map(i => (
        <mesh key={i} position={[
          Math.cos((i / 4) * Math.PI * 2) * 2.2,
          -0.53,
          Math.sin((i / 4) * Math.PI * 2) * 2.2
        ]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial
            color={new THREE.Color(0.0, 0.5, 1.0)}
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════
   LIGHT SWEEP REVEAL
═══════════════════════════════════════ */
function LightSweep({ progress }) {
  const meshRef = useRef();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.6, 0.7, 1.0),
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const sweepX = lerp(-4, 6, clamp(progress * 2.5, 0, 1));
    meshRef.current.position.x = sweepX;
    const inProgress = progress > 0.05 && progress < 0.85;
    mat.opacity = lerp(mat.opacity, inProgress ? 0.18 : 0.0, delta * 3);
  });

  return (
    <mesh ref={meshRef} position={[0, 0.5, 0]} rotation={[0, 0.4, 0]}>
      <planeGeometry args={[0.8, 6]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* ═══════════════════════════════════════
   AMBIENT PARTICLES
═══════════════════════════════════════ */
function AmbientParticles() {
  return (
    <Sparkles
      count={220}
      scale={[20, 8, 20]}
      size={1.4}
      speed={0.18}
      opacity={0.55}
      color="#3060ff"
      noise={0.5}
    />
  );
}

/* ═══════════════════════════════════════
   CAMERA CONTROLLER
═══════════════════════════════════════ */
function CameraController({ sceneTime, onEnter, entering }) {
  const { camera } = useThree();
  const camPosTarget = useRef(new THREE.Vector3(-12, 2, 0));
  const camLookTarget = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    const t = sceneTime.current;
    let targetPos = new THREE.Vector3();
    let targetLook = new THREE.Vector3(0, 0, 0);

    if (t < TIMELINE.blackEnd) {
      // Approaching from far
      targetPos.set(-14, 2.5, 0);
    } else if (t < TIMELINE.emergeEnd) {
      // Still moving in, slightly above
      const p = (t - TIMELINE.blackEnd) / (TIMELINE.emergeEnd - TIMELINE.blackEnd);
      const ep = easeInOutCubic(p);
      targetPos.set(lerp(-14, -7, ep), lerp(2.5, 1.2, ep), lerp(0, 1.5, ep));
    } else if (t < TIMELINE.headlightEnd) {
      // Slow in on headlight moment
      targetPos.set(-6.5, 1.1, 1.5);
      targetLook.set(0.5, 0.05, 0);
    } else if (t < TIMELINE.orbitEnd) {
      // Cinematic orbit
      const p = (t - TIMELINE.headlightEnd) / (TIMELINE.orbitEnd - TIMELINE.headlightEnd);
      const angle = lerp(-0.3, Math.PI * 1.8, easeInOutCubic(p));
      const radius = lerp(6.5, 6.0, p * 0.5);
      const height = lerp(1.1, 0.8, Math.sin(p * Math.PI) * 0.5);
      targetPos.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    } else if (t < TIMELINE.platformEnd) {
      // Pull back slightly for platform
      const p = (t - TIMELINE.orbitEnd) / (TIMELINE.platformEnd - TIMELINE.orbitEnd);
      targetPos.set(lerp(-6.0, -8.0, easeInOutCubic(p)), lerp(0.8, 2.2, easeInOutCubic(p)), lerp(0, -0.5, easeInOutCubic(p)));
    } else if (t < TIMELINE.heroEnd) {
      // Hero front shot
      const p = (t - TIMELINE.platformEnd) / (TIMELINE.heroEnd - TIMELINE.platformEnd);
      targetPos.set(lerp(-8.0, -6.5, easeOutExpo(p)), lerp(2.2, 0.8, easeOutExpo(p)), lerp(-0.5, 0, easeOutExpo(p)));
    } else {
      // Settled hero
      targetPos.set(-6.5, 0.8, 0);
    }

    if (entering) {
      // Rush forward into car
      targetPos.set(lerp(targetPos.x, 0, easeInOutCubic(Math.min(entering * 2, 1))), 0.3, 0);
      targetLook.set(2, 0, 0);
    }

    camPosTarget.current.lerp(targetPos, delta * (entering ? 4.5 : 1.8));
    camLookTarget.current.lerp(targetLook, delta * 2.2);

    camera.position.copy(camPosTarget.current);
    camera.lookAt(camLookTarget.current);

    // FOV drift
    camera.fov = lerp(camera.fov, 42, delta * 1.5);
    camera.updateProjectionMatrix();
  });

  return null;
}

/* ═══════════════════════════════════════
   SCENE LIGHTS
═══════════════════════════════════════ */
function SceneLights({ headlightOn, sceneTime }) {
  const keyLightRef = useRef();
  const rimLightRef = useRef();
  const headLightLRef = useRef();
  const headLightRRef = useRef();
  const floorLightRef = useRef();

  useFrame((_, delta) => {
    const t = sceneTime.current;
    // Key light gradually intensifies
    if (keyLightRef.current) {
      const target = t < TIMELINE.blackEnd ? 0.0 : t < TIMELINE.emergeEnd ? 0.6 : 1.4;
      keyLightRef.current.intensity = lerp(keyLightRef.current.intensity, target, delta * 1.5);
    }
    if (rimLightRef.current) {
      const target = t < TIMELINE.emergeEnd ? 0.0 : 2.2;
      rimLightRef.current.intensity = lerp(rimLightRef.current.intensity, target, delta * 1.2);
    }
    if (headLightLRef.current && headLightRRef.current) {
      const target = headlightOn ? 6.0 : 0.0;
      headLightLRef.current.intensity = lerp(headLightLRef.current.intensity, target, delta * 5);
      headLightRRef.current.intensity = lerp(headLightRRef.current.intensity, target, delta * 5);
    }
    if (floorLightRef.current) {
      const target = t > TIMELINE.orbitEnd ? 0.8 : 0.0;
      floorLightRef.current.intensity = lerp(floorLightRef.current.intensity, target, delta * 1.0);
    }
  });

  return (
    <>
      {/* Key light — upper left */}
      <directionalLight
        ref={keyLightRef}
        position={[4, 6, 3]}
        intensity={0}
        color="#c8d8ff"
        castShadow
      />
      {/* Rim light — rear right */}
      <directionalLight
        ref={rimLightRef}
        position={[-5, 3, -4]}
        intensity={0}
        color="#4466ff"
      />
      {/* Headlight point lights */}
      <pointLight
        ref={headLightLRef}
        position={[3.5, 0.1, 0.56]}
        intensity={0}
        color="#c8e0ff"
        distance={12}
        decay={2}
      />
      <pointLight
        ref={headLightRRef}
        position={[3.5, 0.1, -0.56]}
        intensity={0}
        color="#c8e0ff"
        distance={12}
        decay={2}
      />
      {/* Floor reflect light */}
      <pointLight
        ref={floorLightRef}
        position={[0, -0.3, 0]}
        intensity={0}
        color="#0033cc"
        distance={6}
        decay={2}
      />
      {/* Ambient */}
      <ambientLight intensity={0.04} color="#050520" />
    </>
  );
}

/* ═══════════════════════════════════════
   MAIN 3D SCENE
═══════════════════════════════════════ */
function MainScene({ sceneTime, onEnter, entering }) {
  const t = sceneTime.current;
  const headlightOn = t > TIMELINE.headlightEnd - 0.2;
  const platformVisible = t > TIMELINE.platformEnd - 1;
  const platformRotRef = useRef(0);

  const emergeProgress = clamp(
    (sceneTime.current - TIMELINE.blackEnd) / (TIMELINE.emergeEnd - TIMELINE.blackEnd),
    0, 1
  );

  useFrame((state, delta) => {
    if (sceneTime.current > TIMELINE.orbitEnd) {
      platformRotRef.current += delta * 0.08;
    }
  });

  return (
    <>
      <CameraController sceneTime={sceneTime} onEnter={onEnter} entering={entering} />
      <SceneLights headlightOn={headlightOn} sceneTime={sceneTime} />
      <AmbientParticles />

      <CarBody lightProgress={emergeProgress} headlightOn={headlightOn} />
      <HeadlightBeams active={headlightOn} />
      <LightSweep progress={emergeProgress} />
      <ShowcasePlatform visible={platformVisible} rotation={platformRotRef.current} />

      {/* Floor plane for shadow/fog depth */}
      <mesh position={[0, -0.54, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#020208" roughness={0.98} metalness={0.0} />
      </mesh>

      {/* Postprocessing */}
      <EffectComposer>
        <Bloom
          intensity={1.8}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.6}
          mipmapBlur
        />
        <DepthOfField
          focusDistance={0.01}
          focalLength={0.04}
          bokehScale={headlightOn ? 4 : 2}
          height={480}
        />
        <Vignette eskil={false} offset={0.25} darkness={1.0} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.022} blendFunction={BlendFunction.ADD} />
        <ChromaticAberration
          offset={[0.0008, 0.0008]}
          blendFunction={BlendFunction.NORMAL}
          radialModulation={false}
          modulationOffset={0.5}
        />
      </EffectComposer>
    </>
  );
}

/* ═══════════════════════════════════════
   HUD / OVERLAY ELEMENTS
═══════════════════════════════════════ */
function HeroTitle({ visible }) {
  return (
    <div style={{
      position: "absolute",
      bottom: "28%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      pointerEvents: "none",
      transition: "opacity 1.2s ease, transform 1.2s ease, filter 1.2s ease",
      opacity: visible ? 1 : 0,
      filter: visible ? "blur(0px)" : "blur(12px)",
      transform: visible
        ? "translateX(-50%) translateY(0px)"
        : "translateX(-50%) translateY(20px)",
    }}>
      <p style={{
        fontFamily: "'Rajdhani', 'Orbitron', sans-serif",
        fontSize: "clamp(9px, 1.1vw, 13px)",
        letterSpacing: "0.55em",
        color: "#4488ff",
        margin: "0 0 10px 0",
        textTransform: "uppercase",
        fontWeight: 500,
      }}>
        APEX MOTORS · EST. MMXXIV
      </p>
      <h1 style={{
        fontFamily: "'Rajdhani', 'Orbitron', sans-serif",
        fontSize: "clamp(28px, 5.5vw, 72px)",
        fontWeight: 700,
        letterSpacing: "0.22em",
        color: "#e8eeff",
        margin: 0,
        textTransform: "uppercase",
        lineHeight: 1.0,
        textShadow: "0 0 40px rgba(80,140,255,0.5), 0 0 80px rgba(40,80,200,0.3)",
      }}>
        THE FUTURE<br />
        <span style={{ color: "#4488ff", textShadow: "0 0 30px rgba(68,136,255,0.9)" }}>OF PERFORMANCE</span>
      </h1>
    </div>
  );
}

function EnterButton({ visible, onEnter }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{
      position: "absolute",
      bottom: "13%",
      left: "50%",
      transform: "translateX(-50%)",
      transition: "opacity 1.0s ease 0.3s, transform 1.0s ease 0.3s",
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? "all" : "none",
      transform: visible
        ? "translateX(-50%) translateY(0px)"
        : "translateX(-50%) translateY(16px)",
    }}>
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onEnter}
        style={{
          background: hovered
            ? "rgba(30, 60, 140, 0.35)"
            : "rgba(10, 20, 60, 0.25)",
          border: `1px solid ${hovered ? "rgba(100,170,255,0.9)" : "rgba(60,110,220,0.55)"}`,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          color: "#d0e4ff",
          fontFamily: "'Rajdhani', 'Orbitron', sans-serif",
          fontSize: "clamp(11px, 1.3vw, 14px)",
          letterSpacing: "0.42em",
          fontWeight: 600,
          padding: "16px 52px",
          cursor: "pointer",
          outline: "none",
          position: "relative",
          overflow: "hidden",
          transition: "all 0.35s ease",
          transform: hovered ? "scale(1.04)" : "scale(1.0)",
          boxShadow: hovered
            ? "0 0 30px rgba(60,120,255,0.5), inset 0 0 20px rgba(60,120,255,0.12)"
            : "0 0 14px rgba(40,80,200,0.25)",
          textTransform: "uppercase",
        }}
      >
        {/* Animated light sweep on hover */}
        <span style={{
          position: "absolute",
          top: 0, left: hovered ? "110%" : "-30%",
          width: "60%", height: "100%",
          background: "linear-gradient(90deg, transparent, rgba(120,180,255,0.22), transparent)",
          transition: "left 0.6s ease",
          pointerEvents: "none",
        }} />
        ENTER EXPERIENCE
      </button>
    </div>
  );
}

function SceneLabel({ text, visible }) {
  return (
    <div style={{
      position: "absolute",
      top: "6%",
      right: "5%",
      fontFamily: "'Rajdhani', monospace",
      fontSize: "10px",
      letterSpacing: "0.3em",
      color: "rgba(80,130,220,0.55)",
      textTransform: "uppercase",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.5s",
      pointerEvents: "none",
    }}>
      {text}
    </div>
  );
}

function LoadingPulse({ visible }) {
  return (
    <div style={{
      position: "absolute",
      bottom: "8%",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      gap: "8px",
      opacity: visible ? 0.7 : 0,
      transition: "opacity 0.5s",
    }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 4, height: 4,
          borderRadius: "50%",
          background: "#3366ff",
          animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN FADE OVERLAY
═══════════════════════════════════════ */
function FadeOverlay({ opacity }) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#000000",
      opacity,
      pointerEvents: "none",
      transition: "none",
      zIndex: 2,
    }} />
  );
}

/* ═══════════════════════════════════════
   ENTER FLASH
═══════════════════════════════════════ */
function EnterFlash({ active }) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "radial-gradient(circle, rgba(120,180,255,0.9) 0%, rgba(0,0,0,0) 70%)",
      opacity: active ? 1 : 0,
      pointerEvents: "none",
      transition: "opacity 0.3s ease",
      zIndex: 5,
    }} />
  );
}

/* ═══════════════════════════════════════
   ROOT APP
═══════════════════════════════════════ */
export default function App() {
  const sceneTime = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [entering, setEntering] = useState(0);
  const [entered, setEntered] = useState(false);
  const [flash, setFlash] = useState(false);
  const animFrameRef = useRef(null);
  const startRef = useRef(null);
  const pausedRef = useRef(false);

  // Drive sceneTime forward
  useEffect(() => {
    startRef.current = performance.now();
    const tick = (now) => {
      const elapsed = (now - startRef.current) / 1000;
      sceneTime.current = elapsed;
      setDisplayTime(elapsed);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleEnter = () => {
    setFlash(true);
    setTimeout(() => {
      setEntering(0.001);
      let start = null;
      const anim = (ts) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / 1600, 1);
        setEntering(p);
        if (p < 1) requestAnimationFrame(anim);
        else setEntered(true);
      };
      requestAnimationFrame(anim);
    }, 150);
    setTimeout(() => setFlash(false), 600);
  };

  const t = displayTime;
  const fadeOpacity = t < 0.3 ? 1 : t < 1.8 ? lerp(1, 0, (t - 0.3) / 1.5) : 0;
  const heroVisible = t > TIMELINE.heroEnd - 0.5 && !entering;
  const btnVisible = t > TIMELINE.btnEnd - 0.5 && !entering;
  const isEmerging = t > TIMELINE.blackEnd && t < TIMELINE.emergeEnd;
  const isOrbit = t > TIMELINE.headlightEnd && t < TIMELINE.orbitEnd;
  const isPlatform = t > TIMELINE.orbitEnd && t < TIMELINE.heroEnd;

  const sceneLabel = t < TIMELINE.blackEnd ? "SYSTEM INIT"
    : t < TIMELINE.emergeEnd ? "VEHICLE EMERGENCE"
    : t < TIMELINE.headlightEnd ? "HEADLIGHT ACTIVATION"
    : t < TIMELINE.orbitEnd ? "CINEMATIC ORBIT"
    : t < TIMELINE.platformEnd ? "PLATFORM REVEAL"
    : t < TIMELINE.heroEnd ? "HERO SHOT"
    : "EXPERIENCE READY";

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#000000",
      overflow: "hidden",
      fontFamily: "'Rajdhani', sans-serif",
    }}>
      {/* Font imports */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
      `}</style>

      {/* Scanline atmosphere */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.6,
      }} />

      {/* Three.js Canvas */}
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        style={{ position: "absolute", inset: 0 }}
        camera={{ fov: 42, near: 0.1, far: 200 }}
      >
        <Suspense fallback={null}>
          <MainScene
            sceneTime={sceneTime}
            onEnter={handleEnter}
            entering={entering}
          />
        </Suspense>
      </Canvas>

      {/* Black fade overlay */}
      <FadeOverlay opacity={entering > 0.5 ? lerp(0, 1, (entering - 0.5) * 2) : fadeOpacity * (entering === 0 ? 1 : 0)} />

      {/* Enter flash */}
      <EnterFlash active={flash} />

      {/* UI overlays */}
      {!entered && (
        <>
          <SceneLabel text={sceneLabel} visible={t > 0.5} />
          <HeroTitle visible={heroVisible} />
          <EnterButton visible={btnVisible} onEnter={handleEnter} />
          <LoadingPulse visible={t < TIMELINE.btnEnd && !btnVisible} />

          {/* Corner accent lines */}
          {[
            { top: "4%", left: "4%", borderTop: "1px solid", borderLeft: "1px solid" },
            { top: "4%", right: "4%", borderTop: "1px solid", borderRight: "1px solid" },
            { bottom: "4%", left: "4%", borderBottom: "1px solid", borderLeft: "1px solid" },
            { bottom: "4%", right: "4%", borderBottom: "1px solid", borderRight: "1px solid" },
          ].map((style, i) => (
            <div key={i} style={{
              position: "absolute",
              width: 28, height: 28,
              borderColor: "rgba(50,100,220,0.45)",
              opacity: t > 1.0 ? 1 : 0,
              transition: "opacity 1s ease",
              pointerEvents: "none",
              zIndex: 3,
              ...style,
            }} />
          ))}

          {/* Progress ticker */}
          <div style={{
            position: "absolute",
            bottom: "4.5%",
            left: "5%",
            fontFamily: "'Rajdhani', monospace",
            fontSize: "10px",
            letterSpacing: "0.25em",
            color: "rgba(60,100,200,0.5)",
            pointerEvents: "none",
            opacity: t > 0.5 && !btnVisible ? 1 : 0,
            transition: "opacity 0.5s",
          }}>
            {String(Math.min(Math.floor((t / TIMELINE.btnEnd) * 100), 100)).padStart(3, "0")} %
          </div>

          {/* Wordmark */}
          <div style={{
            position: "absolute",
            top: "5.5%",
            left: "5%",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "clamp(14px, 1.6vw, 18px)",
            letterSpacing: "0.38em",
            fontWeight: 700,
            color: "#d0deff",
            textTransform: "uppercase",
            opacity: t > 1.5 ? 1 : 0,
            transition: "opacity 1.2s ease",
            textShadow: "0 0 20px rgba(80,140,255,0.4)",
          }}>
            APEX <span style={{ color: "#3366ff" }}>·</span> MOTORS
          </div>
        </>
      )}

      {/* Entered state */}
      {entered && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000008",
          flexDirection: "column",
          gap: 16,
        }}>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "clamp(16px, 2vw, 22px)",
            letterSpacing: "0.5em",
            color: "#4488ff",
            textTransform: "uppercase",
            animation: "pulse 2s ease-in-out infinite",
          }}>
            LOADING EXPERIENCE
          </div>
          <div style={{
            width: 220,
            height: 1,
            background: "rgba(40,80,200,0.25)",
            overflow: "hidden",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, transparent, #4488ff, transparent)",
              animation: "scanline 1.2s linear infinite",
              width: "50%",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
