import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ThreeColdPlate() {
  const mountRef = useRef(null);
  const [viewMode, setViewMode] = useState("iso"); // "iso", "slice", "top"
  const [flowSpeedMode, setFlowSpeedMode] = useState("spike"); // "normal" (Re 450) or "spike" (Re 680)
  const [coolingFlow, setCoolingFlow] = useState(true);
  const [hoveredPart, setHoveredPart] = useState(null);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const groupRef = useRef(null);
  const particlesRef = useRef(null);
  const waveRingsRef = useRef([]);
  const reqIdRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 420;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(15, 14, 18);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(16, 24, 16);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x888888, 0.9);
    rimLight.position.set(-16, -8, -16);
    scene.add(rimLight);

    const blueAccent = new THREE.PointLight(0xffffff, 1.2, 30);
    blueAccent.position.set(0, 4, 0);
    scene.add(blueAccent);

    // 5. Main Cold Plate Assembly
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);
    groupRef.current = mainGroup;

    // A. Heavy Substrate Base (Cold Plate Heat Sink Block)
    const baseGeo = new THREE.BoxGeometry(16, 1.2, 10);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      metalness: 0.85,
      roughness: 0.2,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -1.2;
    baseMesh.receiveShadow = true;
    mainGroup.add(baseMesh);

    // Edges on base
    const baseEdges = new THREE.EdgesGeometry(baseGeo);
    const baseLines = new THREE.LineSegments(
      baseEdges,
      new THREE.LineBasicMaterial({ color: 0x444444 })
    );
    baseLines.position.y = -1.2;
    mainGroup.add(baseLines);

    // B. Microchannel Heat Sink Cavity Bed
    const bedGeo = new THREE.BoxGeometry(14, 0.4, 8);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f1f,
      metalness: 0.9,
      roughness: 0.15,
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.position.y = -0.4;
    mainGroup.add(bedMesh);

    // C. Microchannel Fins Array (Dh = 1mm simulated fins)
    const finGroup = new THREE.Group();
    const finGeo = new THREE.BoxGeometry(0.18, 1.1, 7.2);
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.25,
    });
    const finEdgeMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.35 });

    const numFins = 24;
    for (let i = 0; i < numFins; i++) {
      const x = -5.8 + i * 0.5;
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(x, 0.35, 0);
      fin.castShadow = true;
      fin.receiveShadow = true;

      const edges = new THREE.EdgesGeometry(finGeo);
      const lines = new THREE.LineSegments(edges, finEdgeMat);
      fin.add(lines);

      finGroup.add(fin);
    }
    mainGroup.add(finGroup);

    // D. Inlet Port & Manifold Nozzle (Left side intake)
    const portGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.5, 32);
    const portMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.95,
      roughness: 0.1,
    });

    const inletPort = new THREE.Mesh(portGeo, portMat);
    inletPort.position.set(-6.2, 1.5, 2.2);
    mainGroup.add(inletPort);

    // Inlet flange ring
    const ringGeo = new THREE.TorusGeometry(0.85, 0.12, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 });
    const inletRing = new THREE.Mesh(ringGeo, ringMat);
    inletRing.rotation.x = Math.PI / 2;
    inletRing.position.set(-6.2, 2.6, 2.2);
    mainGroup.add(inletRing);

    // E. Outlet Port & Manifold Nozzle (Right side exit)
    const outletPort = new THREE.Mesh(portGeo, portMat);
    outletPort.position.set(6.2, 1.5, -2.2);
    mainGroup.add(outletPort);

    const outletRing = new THREE.Mesh(ringGeo, ringMat);
    outletRing.rotation.x = Math.PI / 2;
    outletRing.position.set(6.2, 2.6, -2.2);
    mainGroup.add(outletRing);

    // F. Transparent Inspection Top Cover (Acrylic / Borosilicate Glass Cover)
    const glassGeo = new THREE.BoxGeometry(14.8, 0.25, 8.8);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.85,
      opacity: 0.4,
      transparent: true,
      roughness: 0.05,
      ior: 1.5,
      thickness: 0.5,
    });
    const glassCover = new THREE.Mesh(glassGeo, glassMat);
    glassCover.position.y = 1.05;
    mainGroup.add(glassCover);

    const glassEdges = new THREE.EdgesGeometry(glassGeo);
    const glassLines = new THREE.LineSegments(
      glassEdges,
      new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 })
    );
    glassLines.position.y = 1.05;
    mainGroup.add(glassLines);

    // G. Thermal Dissipation Concentric Pulse Rings
    const waveRings = [];
    for (let r = 0; r < 3; r++) {
      const ringMeshGeo = new THREE.RingGeometry(2 + r * 1.6, 2.15 + r * 1.6, 48);
      const ringMeshMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15 - r * 0.04,
        side: THREE.DoubleSide,
      });
      const waveMesh = new THREE.Mesh(ringMeshGeo, ringMeshMat);
      waveMesh.rotation.x = Math.PI / 2;
      waveMesh.position.y = 1.25;
      mainGroup.add(waveMesh);
      waveRings.push({ mesh: waveMesh, baseRadius: 2 + r * 1.6, offset: r * 0.7 });
    }
    waveRingsRef.current = waveRings;

    // H. Nanofluid Coolant Stream Particles (Al2O3 + H2O stream lines)
    const particleCount = 380;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    for (let p = 0; p < particleCount; p++) {
      particlePositions[p * 3] = -6.0 + Math.random() * 12.0; // X: from inlet to outlet
      particlePositions[p * 3 + 1] = 0.15 + (Math.random() - 0.5) * 0.6; // Y: between fins
      particlePositions[p * 3 + 2] = (Math.random() - 0.5) * 6.8; // Z: span
      particleSpeeds[p * 3] = 0.04 + Math.random() * 0.06;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.22,
      transparent: true,
      opacity: 0.85,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    mainGroup.add(particleSystem);
    particlesRef.current = { sys: particleSystem, geo: particleGeo, count: particleCount, speeds: particleSpeeds };

    // 6. Interactive Drag & Orbit
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotY = 0.5;
    let targetRotX = 0.35;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotY += deltaX * 0.007;
        targetRotX += deltaY * 0.007;
        targetRotX = Math.max(-0.4, Math.min(1.1, targetRotX));
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

    // 7. Render Loop
    let time = 0;
    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      time += 0.016;

      // Auto rotation if user is not dragging
      if (!isDragging) {
        targetRotY += 0.0025;
      }

      // Smooth damping
      mainGroup.rotation.y += (targetRotY - mainGroup.rotation.y) * 0.06;
      mainGroup.rotation.x += (targetRotX - mainGroup.rotation.x) * 0.06;

      // Fluid particles flow animation
      if (coolingFlow && particlesRef.current) {
        const pos = particlesRef.current.geo.attributes.position.array;
        const count = particlesRef.current.count;
        const velocityMultiplier = flowSpeedMode === "spike" ? 2.2 : 1.0;

        for (let i = 0; i < count; i++) {
          const speed = particlesRef.current.speeds[i * 3] * velocityMultiplier;
          pos[i * 3] += speed; // move along X through microchannels
          // subtle wave in Z
          pos[i * 3 + 2] += Math.sin(time * 3 + i) * 0.008;

          if (pos[i * 3] > 6.2) {
            pos[i * 3] = -6.2;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 6.8;
          }
        }
        particlesRef.current.geo.attributes.position.needsUpdate = true;
      }

      // Wave ripple expansion
      waveRingsRef.current.forEach((item, idx) => {
        const scale = 1 + ((time * 0.8 + item.offset) % 2.0) * 0.3;
        item.mesh.scale.set(scale, scale, 1);
        const alpha = Math.max(0, 0.25 - (((time * 0.8 + item.offset) % 2.0) / 2.0) * 0.25);
        item.mesh.material.opacity = alpha;
      });

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
  }, [coolingFlow, flowSpeedMode]);

  const handleSetView = (mode) => {
    setViewMode(mode);
    if (!cameraRef.current) return;
    if (mode === "top") {
      cameraRef.current.position.set(0, 22, 0.1);
      cameraRef.current.lookAt(0, 0, 0);
    } else if (mode === "slice") {
      cameraRef.current.position.set(0, 3, 20);
      cameraRef.current.lookAt(0, 0, 0);
    } else {
      cameraRef.current.position.set(15, 14, 18);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "440px",
          background: "radial-gradient(circle at 50% 50%, #151515 0%, #060606 100%)",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #222",
        }}
      />

      {/* 3D Viewport Controls HUD */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          left: "14px",
          display: "flex",
          gap: "6px",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => handleSetView("iso")}
          style={{
            background: viewMode === "iso" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "iso" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          ISO 3D
        </button>
        <button
          onClick={() => handleSetView("top")}
          style={{
            background: viewMode === "top" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "top" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          TOP VIEW
        </button>
        <button
          onClick={() => handleSetView("slice")}
          style={{
            background: viewMode === "slice" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "slice" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          SECTION
        </button>
      </div>

      {/* Speed & Flow Controls HUD */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          right: "14px",
          display: "flex",
          gap: "6px",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setFlowSpeedMode(flowSpeedMode === "spike" ? "normal" : "spike")}
          style={{
            background: "rgba(10,10,10,0.85)",
            color: flowSpeedMode === "spike" ? "#fff" : "#888",
            border: flowSpeedMode === "spike" ? "1px solid #fff" : "1px solid #444",
            padding: "4px 8px",
            fontSize: "11px",
            borderRadius: "4px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          {flowSpeedMode === "spike" ? "Re 680 (SPIKE)" : "Re 450 (NORMAL)"}
        </button>

        <button
          onClick={() => setCoolingFlow(!coolingFlow)}
          style={{
            background: coolingFlow ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.8)",
            color: coolingFlow ? "#fff" : "#666",
            border: "1px solid #444",
            padding: "4px 8px",
            fontSize: "11px",
            borderRadius: "4px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: coolingFlow ? "#4ade80" : "#444",
              display: "inline-block",
            }}
          />
          {coolingFlow ? "FLOW: ON" : "PAUSED"}
        </button>
      </div>

      {/* Assembly Specs Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "14px",
          left: "14px",
          background: "rgba(10, 10, 10, 0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid #333",
          padding: "10px 16px",
          borderRadius: "6px",
          fontSize: "12px",
          display: "flex",
          gap: "18px",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div>
          <span style={{ color: "#777", textTransform: "uppercase", fontSize: "10px", display: "block" }}>
            THERMAL CORE ELEMENT
          </span>
          <strong style={{ color: "#fff", letterSpacing: "0.04em" }}>
            MICROCHANNEL COLD PLATE (D_h=1mm)
          </strong>
        </div>
        <div style={{ height: "22px", width: "1px", background: "#333" }} />
        <div>
          <span style={{ color: "#777", textTransform: "uppercase", fontSize: "10px", display: "block" }}>
            COOLANT DYNAMICS
          </span>
          <span style={{ color: "#fff", fontWeight: "700" }}>
            {flowSpeedMode === "spike" ? "Al₂O₃ Nanofluid 3.0% Vol • v=0.60 m/s" : "Al₂O₃ Nanofluid 0.5% Vol • v=0.38 m/s"}
          </span>
        </div>
        <div style={{ height: "22px", width: "1px", background: "#333" }} />
        <div style={{ color: "#888", fontSize: "11px" }}>
          Drag to Rotate • 24 Microchannel Fins
        </div>
      </div>
    </div>
  );
}
