"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Particles({ count = 200 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null!);
  const light = useRef<THREE.PointLight>(null!);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      vel[i * 3] = (Math.random() - 0.5) * 0.005;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.005;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    }
    return [pos, vel];
  }, [count]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const posArray = mesh.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      posArray[i * 3] += velocities[i * 3];
      posArray[i * 3 + 1] += velocities[i * 3 + 1];
      posArray[i * 3 + 2] += velocities[i * 3 + 2];

      for (let j = 0; j < 3; j++) {
        if (Math.abs(posArray[i * 3 + j]) > 5) {
          velocities[i * 3 + j] *= -1;
        }
      }
    }

    mesh.current.geometry.attributes.position.needsUpdate = true;
    mesh.current.rotation.y = time * 0.03;
    mesh.current.rotation.x = Math.sin(time * 0.02) * 0.1;

    light.current.position.x = Math.sin(time * 0.5) * 3;
    light.current.position.z = Math.cos(time * 0.5) * 3;
  });

  return (
    <>
      <pointLight ref={light} intensity={2} color="#7c3aed" distance={15} />
      <pointLight position={[3, 3, 3]} intensity={1} color="#06b6d4" distance={12} />
      <pointLight position={[-3, -2, 2]} intensity={0.8} color="#f59e0b" distance={10} />
      <points ref={mesh}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.04}
          color="#a78bfa"
          transparent
          opacity={0.8}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </>
  );
}

function Connections({ count = 60 }: { count?: number }) {
  const linesRef = useRef<THREE.Group>(null!);

  const lines = useMemo(() => {
    const result: { start: THREE.Vector3; end: THREE.Vector3; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      result.push({
        start: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        ),
        end: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        ),
        speed: 0.3 + Math.random() * 0.7,
      });
    }
    return result;
  }, [count]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    linesRef.current.rotation.y = time * 0.02;
    linesRef.current.rotation.z = Math.sin(time * 0.01) * 0.05;
  });

  return (
    <group ref={linesRef}>
      {lines.map((line, i) => {
        const points = [line.start, line.end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: "#7c3aed",
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
        });
        return (
          <primitive key={i} object={new THREE.Line(geometry, material)} />
        );
      })}
    </group>
  );
}

function FloatingOrbs() {
  const group = useRef<THREE.Group>(null!);

  const orbs = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      position: [
        Math.sin(i * Math.PI * 2 / 6) * 3,
        Math.cos(i * Math.PI * 2 / 6) * 2,
        Math.sin(i * 1.5) * 2,
      ] as [number, number, number],
      scale: 0.08 + Math.random() * 0.12,
      speed: 0.5 + Math.random() * 0.5,
      color: ["#7c3aed", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#6366f1"][i],
    }));
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const orb = orbs[i];
      child.position.y += Math.sin(time * orb.speed + i) * 0.002;
      child.position.x += Math.cos(time * orb.speed * 0.7 + i) * 0.001;
    });
  });

  return (
    <group ref={group}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position}>
          <sphereGeometry args={[orb.scale, 16, 16]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={2}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function NeuralScene() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.1} />
        <Particles count={300} />
        <Connections count={80} />
        <FloatingOrbs />
      </Canvas>
    </div>
  );
}
