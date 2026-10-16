import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Colors come from the Surco tokens in @agro/shared/styles.css (single source of truth).
function token(name: string) {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

// furrows run toward the horizon (along z); the sprout rows draw them
const ROW_GAP = 0.9;
const ROWS = 45;
const PER_ROW = 130;
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

function Sprouts() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pointer = useMemo(() => new THREE.Vector3(999, 0, 999), []);
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
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
    const g = new THREE.ConeGeometry(0.045, 0.55, 4);
    g.translate(0, 0.275, 0); // pivot at the base so blades bend from the ground
    return g;
  }, []);

  useLayoutEffect(() => {
    const palette = [token("--ink"), token("--success-text"), token("--lime-deep")];
    blades.forEach((_, i) => mesh.current!.setColorAt(i, palette[i % palette.length]));
    mesh.current!.instanceColor!.needsUpdate = true;
  }, [blades]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(ground, pointer);

    blades.forEach((b, i) => {
      const grow = THREE.MathUtils.smoothstep(t, b.delay, b.delay + 0.9);
      let bendX = 0.12 * Math.sin(t * 1.4 + b.phase + b.z * 0.3);
      let bendZ = 0.08 * Math.sin(t * 1.1 + b.phase);

      // blades lean away from the cursor
      const dx = b.x - pointer.x;
      const dz = b.z - pointer.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2) {
        const f = (1 - d / 2.2) * 0.9;
        bendZ -= (dx / (d || 1)) * f;
        bendX += (dz / (d || 1)) * f;
      }

      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(bendX, 0, bendZ);
      dummy.scale.setScalar(b.scale * grow);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, blades.length]}>
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
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
