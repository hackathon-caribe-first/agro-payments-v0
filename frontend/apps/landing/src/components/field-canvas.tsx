import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Colors come from the Surco tokens in @agro/shared/styles.css (single source of truth).
function token(name: string) {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

// furrows run toward the horizon (along z); the corn rows draw them
const ROW_GAP = 0.6;
const ROWS = 71;
const PER_ROW = 260;
const Z_NEAR = 10;
const Z_FAR = -45;

// the sun sits far behind the ridges and climbs above them as the page loads
const SUN_POS = new THREE.Vector3(16, 0, -110);
const SUN_RISE_FROM = -5;
const SUN_RISE_TO = 17;

function height(x: number, z: number) {
  return 0.5 * Math.sin(z * 0.12 + x * 0.08) + 0.3 * Math.cos(x * 0.15);
}

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(90, 90, 180, 180);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const low = token("--lime-deep");
    const high = token("--lime");
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const h = height(p.getX(i), p.getZ(i));
      p.setY(i, h);
      c.copy(low).lerp(high, THREE.MathUtils.clamp((h + 0.5) / 1.0, 0, 1)); // furrow valleys read darker
      c.toArray(colors, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, -15]}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

type Blade = {
  x: number;
  y: number;
  z: number;
  scale: number;
  phase: number;
  delay: number;
  ear: boolean;
  tassel: boolean;
};

// Grow, sway, wind gusts and cursor push all run in the vertex shader: the CPU only raycasts the pointer once per frame.
const ACCESSORY_YAW = /* glsl */ `
  float gYaw = aBlade.x;                                 // accessories face a random direction around the stalk
  transformed.xz = mat2(cos(gYaw), -sin(gYaw), sin(gYaw), cos(gYaw)) * transformed.xz;
`;

const SPROUT_VERTEX = /* glsl */ `
  float gT = position.y / BLADE_H;                       // 0 at root, 1 at tip
  vec3 gBase = instanceMatrix[3].xyz;
  float gGrow = smoothstep(aBlade.y + GROW_OFFSET, aBlade.y + GROW_OFFSET + 0.9, uTime);
  vec2 gBend = vec2(
    0.08 * sin(uTime * 1.1 + aBlade.x),
    0.12 * sin(uTime * 1.4 + aBlade.x + gBase.z * 0.3)
  );
  float gGust = pow(max(sin(gBase.z * 0.16 + gBase.x * 0.05 - uTime * 1.2), 0.0), 2.0); // a wave of wind rolling across the rows
  gBend += vec2(0.16, 0.06) * gGust;
  vec2 gAway = gBase.xz - uPointer.xz;                   // lean away from the cursor
  float gDist = length(gAway);
  gBend += gDist > 0.001 ? normalize(gAway) * (1.0 - clamp(gDist / 2.2, 0.0, 1.0)) * 0.9 : vec2(0.0);
  transformed.xz += gBend * gT * gT * BLADE_H;
  transformed *= gGrow;
`;

const BLADE_H = 0.55;

// One arching, tapered leaf ribbon growing out of the stalk at `baseY`, facing `angle` (radians around y).
function createLeaf(baseY: number, angle: number, length: number, width: number) {
  const SEGMENTS = 3;
  const positions: number[] = [];
  const index: number[] = [];
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const out = length * 0.75 * t;
    const y = baseY + length * (0.55 * t - 0.45 * t * t); // rises, then droops at the tip
    const half = width * Math.sin(Math.PI * Math.pow(t, 0.6)) * 0.5 + 0.002; // widest near the base, pointed tip
    positions.push(
      dirX * out - dirZ * half, y, dirZ * out + dirX * half,
      dirX * out + dirZ * half, y, dirZ * out - dirX * half,
    );
    if (i < SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Stalk + alternating arching leaves + a small tassel on top, merged into one low-poly geometry.
function createCornGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const stalk = new THREE.CylinderGeometry(0.008, 0.015, BLADE_H * 0.9, 5, 1, true);
  stalk.translate(0, (BLADE_H * 0.9) / 2, 0);
  parts.push(stalk);

  const LEAVES = 6;
  for (let i = 0; i < LEAVES; i++) {
    const t = i / (LEAVES - 1);
    const baseY = 0.08 + t * BLADE_H * 0.62;
    const angle = i * 2.4; // ~golden angle so leaves alternate around the stalk
    parts.push(createLeaf(baseY, angle, 0.34 - t * 0.12, 0.05 - t * 0.015));
  }

  const tassel = new THREE.CylinderGeometry(0.002, 0.012, 0.12, 4, 1, true);
  tassel.translate(0, BLADE_H - 0.06, 0);
  parts.push(tassel);

  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function paint(g: THREE.BufferGeometry, color: THREE.Color) {
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

// An ear of corn (green husk, golden silk tuft) hanging off the stalk, pointing +x until the shader yaws it.
function createEarGeometry() {
  const husk = paint(new THREE.SphereGeometry(0.03, 6, 5), token("--success-text").lerp(token("--lime-deep"), 0.25));
  husk.scale(1, 2.8, 1);
  const silk = paint(new THREE.ConeGeometry(0.014, 0.08, 4), token("--gold"));
  silk.translate(0, 0.11, 0);
  const g = mergeGeometries([husk, silk])!;
  g.rotateZ(-0.4);
  g.translate(0.035, BLADE_H * 0.5, 0);
  husk.dispose();
  silk.dispose();
  return g;
}

// A full tassel (the corn flower): a central spike with spikelets fanning out and drooping.
function createTasselGeometry() {
  const gold = token("--gold");
  const parts: THREE.BufferGeometry[] = [];
  const spike = paint(new THREE.ConeGeometry(0.008, 0.18, 4), gold);
  spike.translate(0, BLADE_H + 0.02, 0);
  parts.push(spike);
  const BRANCHES = 6;
  for (let k = 0; k < BRANCHES; k++) {
    const b = paint(new THREE.ConeGeometry(0.006, 0.13, 3), gold.clone().lerp(token("--fog"), 0.25));
    b.translate(0, 0.065, 0);
    b.rotateZ(-1.0);
    b.rotateY((k / BRANCHES) * Math.PI * 2);
    b.translate(0, BLADE_H - 0.02, 0);
    parts.push(b);
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

function withBladeAttribute(g: THREE.BufferGeometry, list: Blade[]) {
  g.setAttribute(
    "aBlade",
    new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((b) => [b.phase, b.delay])), 2),
  );
  return g;
}

type Uniforms = { uTime: { value: number }; uPointer: { value: THREE.Vector3 } };

function createBendMaterial(uniforms: Uniforms, accessory: boolean) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, vertexColors: accessory });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const defines = `#define BLADE_H ${BLADE_H.toFixed(2)}\n#define GROW_OFFSET ${accessory ? "0.7" : "0.0"}\n`;
    shader.vertexShader =
      `uniform float uTime;\nuniform vec3 uPointer;\nattribute vec2 aBlade;\n${defines}` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${accessory ? ACCESSORY_YAW : ""}${SPROUT_VERTEX}`,
      );
  };
  m.customProgramCacheKey = () => (accessory ? "surco-corn-accessory" : "surco-corn");
  return m;
}

function Cornfield() {
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const uniforms = useMemo<Uniforms>(
    () => ({ uTime: { value: 0 }, uPointer: { value: new THREE.Vector3(999, 0, 999) } }),
    [],
  );
  const plants = useRef<THREE.InstancedMesh>(null);
  const ears = useRef<THREE.InstancedMesh>(null);
  const tassels = useRef<THREE.InstancedMesh>(null);
  const { raycaster, pointer: ndc, camera } = useThree();

  const blades = useMemo<Blade[]>(() => {
    const list: Blade[] = [];
    for (let r = 0; r < ROWS; r++) {
      const x = (r - (ROWS - 1) / 2) * ROW_GAP;
      for (let k = 0; k < PER_ROW; k++) {
        const z = Z_NEAR - (k / PER_ROW) * (Z_NEAR - Z_FAR) + (Math.random() - 0.5) * 0.3;
        const xj = x + (Math.random() - 0.5) * 0.15;
        list.push({
          x: xj,
          y: height(xj, z + 15) - 0.02,
          z,
          scale: 0.7 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
          delay: 0.2 + ((Z_NEAR - z) / (Z_NEAR - Z_FAR)) * 1.6 + Math.random() * 0.2,
          ear: Math.random() < 0.25,
          tassel: Math.random() < 0.3,
        });
      }
    }
    return list;
  }, []);

  const earBlades = useMemo(() => blades.filter((b) => b.ear), [blades]);
  const tasselBlades = useMemo(() => blades.filter((b) => b.tassel), [blades]);

  const plantGeometry = useMemo(() => withBladeAttribute(createCornGeometry(), blades), [blades]);
  const earGeometry = useMemo(() => withBladeAttribute(createEarGeometry(), earBlades), [earBlades]);
  const tasselGeometry = useMemo(() => withBladeAttribute(createTasselGeometry(), tasselBlades), [tasselBlades]);

  const plantMaterial = useMemo(() => createBendMaterial(uniforms, false), [uniforms]);
  const accessoryMaterial = useMemo(() => createBendMaterial(uniforms, true), [uniforms]);

  // Instances are static: placed and tinted once.
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const place = (mesh: THREE.InstancedMesh, list: Blade[]) => {
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.scale.setScalar(b.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    const palette = [token("--ink"), token("--success-text"), token("--lime-deep")];
    place(plants.current!, blades);
    blades.forEach((_, i) => plants.current!.setColorAt(i, palette[i % palette.length]));
    plants.current!.instanceColor!.needsUpdate = true;
    place(ears.current!, earBlades);
    place(tassels.current!, tasselBlades);
  }, [blades, earBlades, tasselBlades]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(ground, uniforms.uPointer.value);
  });

  // ponytail: frustumCulled off because instances span the whole field around the camera
  return (
    <>
      <instancedMesh ref={plants} args={[plantGeometry, plantMaterial, blades.length]} frustumCulled={false} />
      <instancedMesh ref={ears} args={[earGeometry, accessoryMaterial, earBlades.length]} frustumCulled={false} />
      <instancedMesh
        ref={tassels}
        args={[tasselGeometry, accessoryMaterial, tasselBlades.length]}
        frustumCulled={false}
      />
    </>
  );
}

// Golden pollen drifting up over the field, animated entirely in the vertex shader.
function Pollen() {
  const COUNT = 420;
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 4;
      pos[i * 3 + 2] = Z_NEAR - Math.random() * 38;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: token("--gold") } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.35 + aSeed * 40.0) * 0.8 + uTime * 0.12;
          p.y = 0.25 + mod(position.y + uTime * (0.08 + aSeed * 0.1), 4.0);
          p.z += cos(uTime * 0.3 + aSeed * 30.0) * 0.6;
          p.x = mod(p.x + 15.0, 30.0) - 15.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 3.0) * (14.0 / -mv.z);
          vAlpha = 0.35 + 0.65 * smoothstep(0.0, 0.5, sin(uTime * 0.8 + aSeed * 20.0) * 0.5 + 0.5);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    return { geometry: g, material: m };
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function CameraRig() {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer }) => {
    // fly forward over the first two screens of scroll, with a little pointer parallax
    const progress = Math.min(window.scrollY / window.innerHeight, 2);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.8, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.6 + progress * 0.9 + pointer.y * 0.3, 0.05);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 8 - progress * 7, 0.08);
    // fixed aim height: at rest the horizon sits low (headline over sky); as the camera rises it looks down at the field
    camera.lookAt(target.set(camera.position.x * 0.5, 2.3, -12));
  });
  return null;
}

// Vertical gradient dome with a warm glow centred on where the sun ends up.
function Sky() {
  const material = useMemo(() => {
    const horizon = token("--fog");
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: horizon },
        uTop: { value: horizon.clone().lerp(token("--lime"), 0.55) },
        uGlow: { value: token("--gold") },
        uSun: { value: new THREE.Vector3(SUN_POS.x, SUN_RISE_TO, SUN_POS.z).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uTop;
        uniform vec3 uGlow;
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = mix(uHorizon, uTop, pow(clamp(d.y * 1.6, 0.0, 1.0), 0.7));
          float s = max(dot(d, uSun), 0.0);
          c += uGlow * (pow(s, 40.0) * 0.5 + pow(s, 6.0) * 0.22);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }, []);
  return <mesh material={material} renderOrder={-10} scale={400} frustumCulled={false}>
    <sphereGeometry args={[1, 32, 16]} />
  </mesh>;
}

function ridgeHeight(x: number, seed: number) {
  const n = 0.55 * Math.sin(x * 0.035 + seed) + 0.3 * Math.sin(x * 0.09 + seed * 2.1) + 0.15 * Math.sin(x * 0.21 + seed * 3.7);
  return 0.65 * (1 - Math.abs(n)) + 0.35 * (0.5 + 0.5 * n); // sharp peaks, soft valleys
}

// A ridge silhouette that hazes into the fog at its base; farther layers are paler.
function Ridge({ z, amp, baseY, seed, haze }: { z: number; amp: number; baseY: number; seed: number; haze: number }) {
  const geometry = useMemo(() => {
    const COLS = 140;
    const WIDTH = 260;
    const fog = token("--fog");
    const rock = token("--ink").lerp(token("--success-text"), 0.5).lerp(fog, haze);
    const lit = rock.clone().lerp(token("--gold"), 0.18); // sunlit crest
    const mist = rock.clone().lerp(fog, 0.85);
    const positions: number[] = [];
    const colors: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= COLS; i++) {
      const x = (i / COLS - 0.5) * WIDTH;
      const top = baseY + amp * ridgeHeight(x, seed);
      positions.push(x, -6, 0, x, baseY, 0, x, top, 0);
      colors.push(...fog.toArray(), ...mist.toArray(), ...lit.toArray());
      if (i < COLS) {
        for (let row = 0; row < 2; row++) {
          const a = i * 3 + row;
          index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(index);
    return g;
  }, [amp, baseY, seed, haze]);

  return (
    <mesh geometry={geometry} position={[0, 0, z]}>
      <meshBasicMaterial vertexColors fog={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Mountains() {
  return (
    <>
      <Ridge z={-98} amp={16} baseY={0.5} seed={1.3} haze={0.72} />
      <Ridge z={-80} amp={11} baseY={0.2} seed={4.1} haze={0.5} />
      <Ridge z={-64} amp={6} baseY={0.0} seed={7.9} haze={0.3} />
    </>
  );
}

function radialTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Sun() {
  const group = useRef<THREE.Group>(null);
  const halo = useMemo(() => radialTexture(), []);
  const gold = useMemo(() => token("--gold"), []);
  useFrame(({ clock }) => {
    const rise = THREE.MathUtils.smootherstep(clock.elapsedTime, 0, 3.2);
    group.current!.position.y = THREE.MathUtils.lerp(SUN_RISE_FROM, SUN_RISE_TO, rise);
  });
  return (
    <group ref={group} position={[SUN_POS.x, SUN_RISE_FROM, SUN_POS.z]}>
      <mesh>
        <sphereGeometry args={[7, 48, 48]} />
        <meshBasicMaterial color={gold} fog={false} />
      </mesh>
      <sprite scale={[70, 70, 1]}>
        <spriteMaterial map={halo} color={gold} blending={THREE.AdditiveBlending} transparent opacity={0.55} depthWrite={false} fog={false} />
      </sprite>
      <sprite scale={[160, 160, 1]}>
        <spriteMaterial map={halo} color={gold} blending={THREE.AdditiveBlending} transparent opacity={0.22} depthWrite={false} fog={false} />
      </sprite>
    </group>
  );
}

export default function FieldCanvas() {
  const fog = useMemo(() => token("--fog"), []);
  return (
    <Canvas
      camera={{ position: [0, 1.6, 8], fov: 45 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      // the canvas sits behind the page; listen on body so the cursor still moves the corn
      eventSource={document.body}
      eventPrefix="client"
    >
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, 12, 50]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[9, 6, -40]} intensity={1.6} color={token("--gold")} />
      <directionalLight position={[-5, 10, 10]} intensity={0.8} />
      <Sky />
      <Sun />
      <Mountains />
      <Terrain />
      <Cornfield />
      <Pollen />
      <CameraRig />
    </Canvas>
  );
}
