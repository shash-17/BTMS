import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ThreeAestheticSculpture() {
  const mountRef = useRef(null);
  const [activeForm, setActiveForm] = useState("gyro"); // "gyro", "torus", "geodesic"
  const [wireframeOnly, setWireframeOnly] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const coreGroupRef = useRef(null);
  const ringMeshesRef = useRef([]);
  const coreMeshRef = useRef(null);
  const torusMeshRef = useRef(null);
  const geodesicMeshRef = useRef(null);
  const particlesRef = useRef(null);
  const reqIdRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 460;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 15);
    cameraRef.current = camera;

    // 3. Renderer with high-end pixel ratio & antialiasing
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Monochromatic Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    // Front high-key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(12, 18, 15);
    scene.add(keyLight);

    // Subtle side fill
    const fillLight = new THREE.DirectionalLight(0x888888, 1.2);
    fillLight.position.set(-15, 10, -10);
    scene.add(fillLight);

    // Rim / Back light for crisp specular edges
    const rimLight = new THREE.DirectionalLight(0xffffff, 2.5);
    rimLight.position.set(0, -12, -15);
    scene.add(rimLight);

    // 5. Main Center Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    coreGroupRef.current = rootGroup;

    // Materials
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.95,
      roughness: 0.12,
      wireframe: wireframeOnly,
    });

    const matteDarkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.85,
      roughness: 0.25,
      wireframe: wireframeOnly,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.82,
      opacity: 0.45,
      transparent: true,
      roughness: 0.08,
      ior: 1.6,
      thickness: 1.2,
      wireframe: wireframeOnly,
    });

    const edgeLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });

    // --- FORM 1: Kinetic Gyroscope Assembly ---
    const gyroGroup = new THREE.Group();
    rootGroup.add(gyroGroup);

    // Central faceted crystal (Icosahedron)
    const coreGeo = new THREE.IcosahedronGeometry(2.4, 1);
    const coreMesh = new THREE.Mesh(coreGeo, chromeMat);
    const coreEdges = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeo), edgeLineMat);
    coreMesh.add(coreEdges);
    gyroGroup.add(coreMesh);
    coreMeshRef.current = coreMesh;

    // Floating outer glass octahedron cage
    const cageGeo = new THREE.OctahedronGeometry(3.6, 0);
    const cageMesh = new THREE.Mesh(cageGeo, glassMat);
    const cageEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cageGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    );
    cageMesh.add(cageEdges);
    gyroGroup.add(cageMesh);

    // 3 Concentric Gimbal Gyroscope Rings
    const ringMeshes = [];
    const ringConfigs = [
      { radius: 4.5, tube: 0.07, rotAxis: "x", speed: 0.012 },
      { radius: 5.4, tube: 0.07, rotAxis: "y", speed: 0.018 },
      { radius: 6.3, tube: 0.07, rotAxis: "z", speed: 0.009 },
    ];

    ringConfigs.forEach((cfg) => {
      const ringGeo = new THREE.TorusGeometry(cfg.radius, cfg.tube, 24, 100);
      const ringMesh = new THREE.Mesh(ringGeo, matteDarkMat);

      // Edge glow highlight ring
      const ringEdgeGeo = new THREE.TorusGeometry(cfg.radius, cfg.tube * 1.05, 12, 100);
      const ringEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(ringEdgeGeo),
        new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 })
      );
      ringMesh.add(ringEdge);

      gyroGroup.add(ringMesh);
      ringMeshes.push({ mesh: ringMesh, ...cfg });
    });
    ringMeshesRef.current = ringMeshes;

    // --- FORM 2: Chrome Torus Knot ---
    const knotGeo = new THREE.TorusKnotGeometry(2.9, 0.85, 140, 24, 2, 3);
    const knotMesh = new THREE.Mesh(knotGeo, chromeMat);
    const knotEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(knotGeo),
      new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 })
    );
    knotMesh.add(knotEdges);
    knotMesh.visible = false;
    rootGroup.add(knotMesh);
    torusMeshRef.current = knotMesh;

    // --- FORM 3: Geodesic Dual Sphere ---
    const geoGroup = new THREE.Group();
    const geoInner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.8, 3),
      new THREE.MeshStandardMaterial({ color: 0x0f0f0f, metalness: 0.9, roughness: 0.1 })
    );
    const geoOuter = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.2, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 })
    );
    geoGroup.add(geoInner);
    geoGroup.add(geoOuter);
    geoGroup.visible = false;
    rootGroup.add(geoGroup);
    geodesicMeshRef.current = geoGroup;

    // --- Ambient Floating Particles Constellation ---
    const particleCount = 260;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 5.0 + Math.random() * 4.5;
      particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = r * Math.cos(phi);
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

    // 6. Interactive Drag & Cursor Parallax
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotY = 0;
    let targetRotX = 0;
    let mouseNormX = 0;
    let mouseNormY = 0;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseNormX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNormY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotY += deltaX * 0.008;
        targetRotX += deltaY * 0.008;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // 7. Smooth Animation Loop
    let time = 0;
    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      time += 0.015 * speedMultiplier;

      // Auto rotation
      if (!isDragging) {
        targetRotY += 0.003 * speedMultiplier;
      }

      // Parallax tilt from cursor
      const parallaxX = mouseNormY * 0.35;
      const parallaxY = mouseNormX * 0.45;

      rootGroup.rotation.y += (targetRotY + parallaxY - rootGroup.rotation.y) * 0.05;
      rootGroup.rotation.x += (targetRotX + parallaxX - rootGroup.rotation.x) * 0.05;

      // Rotate central core
      if (coreMeshRef.current) {
        coreMeshRef.current.rotation.x = time * 0.5;
        coreMeshRef.current.rotation.y = time * 0.7;
      }

      // Cage counter-rotation
      if (cageMesh) {
        cageMesh.rotation.y = -time * 0.3;
        cageMesh.rotation.z = time * 0.2;
      }

      // Independent Gimbal Ring Orbits
      ringMeshesRef.current.forEach((r, idx) => {
        if (r.rotAxis === "x") {
          r.mesh.rotation.x = time * 0.7;
          r.mesh.rotation.y = Math.sin(time * 0.5) * 0.3;
        } else if (r.rotAxis === "y") {
          r.mesh.rotation.y = time * 0.9;
          r.mesh.rotation.z = Math.cos(time * 0.6) * 0.4;
        } else {
          r.mesh.rotation.z = time * 0.6;
          r.mesh.rotation.x = Math.sin(time * 0.4) * 0.5;
        }
      });

      // Torus Knot animation
      if (torusMeshRef.current && torusMeshRef.current.visible) {
        torusMeshRef.current.rotation.x = time * 0.4;
        torusMeshRef.current.rotation.y = time * 0.6;
        torusMeshRef.current.rotation.z = time * 0.2;
      }

      // Geodesic animation
      if (geodesicMeshRef.current && geodesicMeshRef.current.visible) {
        geoInner.rotation.y = time * 0.6;
        geoOuter.rotation.y = -time * 0.4;
        geoOuter.rotation.x = time * 0.3;
      }

      // Orbiting particles
      if (particlesRef.current) {
        particlesRef.current.rotation.y = time * 0.1;
        particlesRef.current.rotation.x = time * 0.05;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [speedMultiplier, wireframeOnly]);

  // Handle switching forms
  const handleSwitchForm = (form) => {
    setActiveForm(form);
    if (!coreGroupRef.current) return;

    const gyro = coreGroupRef.current.children[0];
    const torus = torusMeshRef.current;
    const geodesic = geodesicMeshRef.current;

    if (gyro) gyro.visible = form === "gyro";
    if (torus) torus.visible = form === "torus";
    if (geodesic) geodesic.visible = form === "geodesic";
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "460px",
          background: "radial-gradient(circle at 50% 50%, #151515 0%, #050505 100%)",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #222",
          cursor: "grab",
        }}
      />
    </div>
  );
}

