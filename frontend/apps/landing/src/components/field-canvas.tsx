import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Colors come from the Surco tokens in @agro/shared/styles.css (single source of truth).
function token(name: string) {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

// furrows run toward the horizon (along z); the sprout rows draw them
const ROW_GAP = 0.6;
const ROWS = 71;
const PER_ROW = 260;
const Z_NEAR = 10;
const Z_FAR = -45;

function height(x: number, z: number) {
  return 0.5 * Math.sin(z * 0.12 + x * 0.08) + 0.3 * Math.cos(x * 0.15);
}

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(90, 90, 180, 180);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, -15]}>
      <meshStandardMaterial color={token("--lime")} roughness={1} />
    </mesh>
  );
}

type Blade = { x: number; y: number; z: number; scale: number; phase: number; delay: number };

// Grow, sway and cursor push all run in the vertex shader: the CPU only raycasts the pointer once per frame.
const SPROUT_VERTEX = /* glsl */ `
  float gT = position.y / BLADE_H;                       // 0 at root, 1 at tip
  vec3 gBase = instanceMatrix[3].xyz;
  float gGrow = smoothstep(aBlade.y, aBlade.y + 0.9, uTime);
  vec2 gBend = vec2(
    0.08 * sin(uTime * 1.1 + aBlade.x),
    0.12 * sin(uTime * 1.4 + aBlade.x + gBase.z * 0.3)
  );
  vec2 gAway = gBase.xz - uPointer.xz;                   // lean away from the cursor
  float gDist = length(gAway);
  gBend += gDist > 0.001 ? normalize(gAway) * (1.0 - clamp(gDist / 2.2, 0.0, 1.0)) * 0.9 : vec2(0.0);
  transformed.xz += gBend * gT * gT * BLADE_H;
  transformed *= gGrow;
`;

const BLADE_H = 0.55;

function Sprouts() {
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPointer: { value: new THREE.Vector3(999, 0, 999) } }), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
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
        });
      }
    }
    return list;
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.045, BLADE_H, 4);
    g.translate(0, BLADE_H / 2, 0); // pivot at the base so blades bend from the ground
    g.setAttribute(
      "aBlade",
      new THREE.InstancedBufferAttribute(new Float32Array(blades.flatMap((b) => [b.phase, b.delay])), 2),
    );
    return g;
  }, [blades]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        `uniform float uTime;\nuniform vec3 uPointer;\nattribute vec2 aBlade;\n#define BLADE_H ${BLADE_H.toFixed(2)}\n` +
        shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n${SPROUT_VERTEX}`);
    };
    m.customProgramCacheKey = () => "surco-sprouts";
    return m;
  }, [uniforms]);

  // Instances are static: placed and tinted once.
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const palette = [token("--ink"), token("--success-text"), token("--lime-deep")];
    blades.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
      mesh.current!.setColorAt(i, palette[i % palette.length]);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.instanceColor!.needsUpdate = true;
  }, [blades]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(ground, uniforms.uPointer.value);
  });

  // ponytail: frustumCulled off because instances span the whole field around the camera
  return <instancedMesh ref={mesh} args={[geometry, material, blades.length]} frustumCulled={false} />;
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

function Sun() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const rise = THREE.MathUtils.smoothstep(clock.elapsedTime, 0, 2.2);
    ref.current!.position.y = -2 + rise * 7;
  });
  return (
    <mesh ref={ref} position={[9, -2, -48]}>
      <sphereGeometry args={[3.2, 48, 48]} />
      <meshBasicMaterial color={token("--gold")} fog={false} />
    </mesh>
  );
}

export default function FieldCanvas() {
  const fog = useMemo(() => token("--fog"), []);
  return (
    <Canvas
      camera={{ position: [0, 1.6, 8], fov: 45 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      // the canvas sits behind the page; listen on body so the cursor still moves the sprouts
      eventSource={document.body}
      eventPrefix="client"
    >
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, 12, 50]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[9, 6, -40]} intensity={1.6} color={token("--gold")} />
      <directionalLight position={[-5, 10, 10]} intensity={0.8} />
      <Sun />
      <Terrain />
      <Sprouts />
      <CameraRig />
    </Canvas>
  );
}
