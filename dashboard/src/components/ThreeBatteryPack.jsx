import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ThreeBatteryPack({ activeCellIndex = null, onSelectCell = null }) {
  const mountRef = useRef(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [viewMode, setViewMode] = useState("iso"); // "iso", "top", "front"
  const [coolingFlow, setCoolingFlow] = useState(true);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const cellsRef = useRef([]);
  const flowParticlesRef = useRef(null);
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
    camera.position.set(16, 12, 20);
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

    // 4. Lighting (Crisp Monochromatic Studio)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(15, 25, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa0a0a0, 0.6);
    fillLight.position.set(-15, 10, -10);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xffffff, 0.8, 40);
    rimLight.position.set(0, -6, 0);
    scene.add(rimLight);

    // 5. Battery Pack Group
    const packGroup = new THREE.Group();
    scene.add(packGroup);

    // Casing / Chassis Plate (Base plate)
    const baseGeo = new THREE.BoxGeometry(14, 0.5, 7);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.3,
      metalness: 0.8,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -2.2;
    baseMesh.receiveShadow = true;
    packGroup.add(baseMesh);

    // Chassis wireframe outline
    const baseEdges = new THREE.EdgesGeometry(baseGeo);
    const baseLine = new THREE.LineSegments(
      baseEdges,
      new THREE.LineBasicMaterial({ color: 0x444444, linewidth: 1 })
    );
    baseLine.position.y = -2.2;
    packGroup.add(baseLine);

    // Cooling Plate (Sandwiched beneath cells)
    const coolPlateGeo = new THREE.BoxGeometry(13.4, 0.3, 6.4);
    const coolPlateMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.15,
      metalness: 0.9,
    });
    const coolPlate = new THREE.Mesh(coolPlateGeo, coolPlateMat);
    coolPlate.position.y = -1.8;
    packGroup.add(coolPlate);

    // Cooling Channel Micro-lines (represents microchannels)
    for (let c = -6; c <= 6; c += 1.2) {
      const tubeGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.2, 8);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(c, -1.8, 0);
      packGroup.add(tube);
    }

    // 6. Build 10 Lithium Cylindrical Cells (2 rows of 5)
    // Arrangement: x: -4.8, -2.4, 0, 2.4, 4.8; z: -1.6, 1.6
    const cellMeshes = [];
    const cellRadius = 0.95;
    const cellHeight = 3.6;
    const cellGeometry = new THREE.CylinderGeometry(cellRadius, cellRadius, cellHeight, 32);
    const capGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 24);

    let cellIndex = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const x = (col - 2) * 2.5;
        const z = (row - 0.5) * 3.2;

        const cellGroup = new THREE.Group();
        cellGroup.position.set(x, 0, z);

        // Body
        const cellMat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.25,
          metalness: 0.7,
        });
        const cellMesh = new THREE.Mesh(cellGeometry, cellMat);
        cellMesh.castShadow = true;
        cellMesh.receiveShadow = true;
        cellGroup.add(cellMesh);

        // Wireframe edges
        const cellEdges = new THREE.EdgesGeometry(cellGeometry);
        const cellLine = new THREE.LineSegments(
          cellEdges,
          new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.3 })
        );
        cellGroup.add(cellLine);

        // Positive Terminal Cap
        const capMat = new THREE.MeshStandardMaterial({
          color: 0xdddddd,
          metalness: 0.95,
          roughness: 0.1,
        });
        const cap = new THREE.Mesh(capGeometry, capMat);
        cap.position.y = cellHeight / 2 + 0.12;
        cellGroup.add(cap);

        // Ring indicator at bottom
        const ringGeo = new THREE.TorusGeometry(cellRadius * 0.98, 0.05, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -cellHeight / 2 + 0.3;
        cellGroup.add(ring);

        cellGroup.userData = {
          cellId: cellIndex,
          baseColor: 0x2a2a2a,
          isHovered: false,
          isSelected: false,
          mesh: cellMesh,
          cap: cap,
        };

        packGroup.add(cellGroup);
        cellMeshes.push(cellGroup);
        cellIndex++;
      }
    }
    cellsRef.current = cellMeshes;

    // 7. Nanofluid Flow Particles (Simulating Al2O3 Coolant Stream)
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 13;
      particlePositions[i * 3 + 1] = -1.8 + (Math.random() - 0.5) * 0.2;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      transparent: true,
      opacity: 0.65,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    packGroup.add(particleSystem);
    flowParticlesRef.current = { sys: particleSystem, geo: particleGeo, count: particleCount };

    // 8. Interactive Dragging / Orbiting
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotY = 0.4;
    let targetRotX = 0.25;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotY += deltaX * 0.008;
        targetRotX += deltaY * 0.008;
        targetRotX = Math.max(-0.4, Math.min(1.0, targetRotX));
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }

      // Raycasting for cell hover
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const hitCandidates = cellMeshes.map((g) => g.userData.mesh);
      const intersects = raycaster.intersectObjects(hitCandidates);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const hitGroup = hitMesh.parent;
        const id = hitGroup.userData.cellId;
        setHoveredCell(id);
        container.style.cursor = "pointer";
      } else {
        setHoveredCell(null);
        container.style.cursor = isDragging ? "grabbing" : "grab";
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hitCandidates = cellMeshes.map((g) => g.userData.mesh);
      const intersects = raycaster.intersectObjects(hitCandidates);

      if (intersects.length > 0) {
        const id = intersects[0].object.parent.userData.cellId;
        if (onSelectCell) onSelectCell(id);
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("click", onClick);

    // 9. Render Loop
    let lastTime = performance.now();

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      // Auto slow rotation if not dragging
      if (!isDragging) {
        targetRotY += 0.003;
      }

      // Smooth damping
      packGroup.rotation.y += (targetRotY - packGroup.rotation.y) * 0.06;
      packGroup.rotation.x += (targetRotX - packGroup.rotation.x) * 0.06;

      // Pulse and update cell colors
      cellMeshes.forEach((group) => {
        const id = group.userData.cellId;
        const isSelected = activeCellIndex === id;
        const isHov = hoveredCell === id;
        const mesh = group.userData.mesh;

        if (isSelected) {
          mesh.material.color.setHex(0xffffff);
          mesh.material.emissive.setHex(0x333333);
        } else if (isHov) {
          mesh.material.color.setHex(0x888888);
          mesh.material.emissive.setHex(0x111111);
        } else {
          // Subtle breathing effect on cells
          mesh.material.color.setHex(0x242424);
          mesh.material.emissive.setHex(0x000000);
        }
      });

      // Flow particles animation (Nanofluid circulation)
      if (coolingFlow && flowParticlesRef.current) {
        const positions = flowParticlesRef.current.geo.attributes.position.array;
        const count = flowParticlesRef.current.count;
        for (let i = 0; i < count; i++) {
          positions[i * 3] += 0.08; // move along x
          if (positions[i * 3] > 6.5) {
            positions[i * 3] = -6.5;
          }
        }
        flowParticlesRef.current.geo.attributes.position.needsUpdate = true;
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
      dom.removeEventListener("click", onClick);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [coolingFlow, hoveredCell, activeCellIndex, onSelectCell]);

  const handleSetView = (mode) => {
    setViewMode(mode);
    if (!cameraRef.current) return;
    if (mode === "top") {
      cameraRef.current.position.set(0, 24, 0.1);
      cameraRef.current.lookAt(0, 0, 0);
    } else if (mode === "front") {
      cameraRef.current.position.set(0, 2, 22);
      cameraRef.current.lookAt(0, 0, 0);
    } else {
      cameraRef.current.position.set(16, 12, 20);
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
          minHeight: "420px",
          background: "radial-gradient(circle at 50% 50%, #151515 0%, #080808 100%)",
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
          className={`btn-tag ${viewMode === "iso" ? "active" : ""}`}
          style={{
            background: viewMode === "iso" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "iso" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 10px",
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
          className={`btn-tag ${viewMode === "top" ? "active" : ""}`}
          style={{
            background: viewMode === "top" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "top" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 10px",
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
          onClick={() => handleSetView("front")}
          className={`btn-tag ${viewMode === "front" ? "active" : ""}`}
          style={{
            background: viewMode === "front" ? "#fff" : "rgba(10,10,10,0.8)",
            color: viewMode === "front" ? "#000" : "#aaa",
            border: "1px solid #333",
            padding: "4px 10px",
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

      {/* Coolant Toggle & Info */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          right: "14px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setCoolingFlow(!coolingFlow)}
          style={{
            background: coolingFlow ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.8)",
            color: coolingFlow ? "#fff" : "#666",
            border: "1px solid #444",
            padding: "4px 10px",
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
              background: coolingFlow ? "#fff" : "#444",
              display: "inline-block",
            }}
          />
          {coolingFlow ? "NANOFLUID FLOW: ON" : "FLOW: PAUSED"}
        </button>
      </div>

      {/* Hover / Active Badge HUD */}
      <div
        style={{
          position: "absolute",
          bottom: "14px",
          left: "14px",
          background: "rgba(10, 10, 10, 0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid #333",
          padding: "8px 14px",
          borderRadius: "6px",
          fontSize: "12px",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div>
          <span style={{ color: "#777", textTransform: "uppercase", fontSize: "10px", display: "block" }}>
            MODULE CONFIG
          </span>
          <strong style={{ color: "#fff", letterSpacing: "0.04em" }}>10-CELL 2P5S CYLINDRICAL</strong>
        </div>
        <div style={{ height: "20px", width: "1px", background: "#333" }} />
        <div>
          <span style={{ color: "#777", textTransform: "uppercase", fontSize: "10px", display: "block" }}>
            STATUS
          </span>
          <span style={{ color: hoveredCell !== null ? "#fff" : "#aaa", fontWeight: "600" }}>
            {hoveredCell !== null
              ? `Cell C0${hoveredCell} [Hovered]`
              : activeCellIndex !== null
              ? `Cell C0${activeCellIndex} [Selected]`
              : "Drag to Rotate • Click Cell"}
          </span>
        </div>
      </div>
    </div>
  );
}
