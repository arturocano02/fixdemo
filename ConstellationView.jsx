import { useState, useEffect, useRef } from "react";
import * as THREE from "three";

// ─── Mock data (replace with real Supabase fetches in integration) ──────────

const ISSUES = [
  { id: "1",  name: "Housing Affordability",  energy: 0.90, consensus: 0.28, members: 847,  stance: "Most users support increased social housing and rent controls, with strong opposition to speculative investment." },
  { id: "2",  name: "AI Regulation",           energy: 0.72, consensus: 0.52, members: 623,  stance: "Split between industry-led standards and government-mandated oversight frameworks." },
  { id: "3",  name: "Immigration Policy",       energy: 0.85, consensus: 0.18, members: 912,  stance: "High disagreement — ranges from open borders advocacy to strict enforcement positions." },
  { id: "4",  name: "Climate Action",           energy: 0.78, consensus: 0.62, members: 789,  stance: "Broad agreement on urgency, significant disagreement on speed and economic trade-offs." },
  { id: "5",  name: "Healthcare Access",        energy: 0.74, consensus: 0.48, members: 701,  stance: "Majority favour universal coverage; debate centres on public vs. mixed delivery models." },
  { id: "6",  name: "Economic Inequality",      energy: 0.66, consensus: 0.38, members: 534,  stance: "Agreement on the problem; deep division on redistribution mechanisms and tax policy." },
  { id: "7",  name: "Free Speech Online",       energy: 0.61, consensus: 0.22, members: 445,  stance: "Deep disagreement on platform moderation, algorithmic curation, and government intervention." },
  { id: "8",  name: "Drug Policy",              energy: 0.49, consensus: 0.58, members: 312,  stance: "Lean toward decriminalisation and harm-reduction approaches over punitive enforcement." },
  { id: "9",  name: "Education Funding",        energy: 0.69, consensus: 0.67, members: 598,  stance: "Strong consensus for increased public school investment and teacher pay reform." },
  { id: "10", name: "Criminal Justice",         energy: 0.59, consensus: 0.31, members: 467,  stance: "Reform-leaning majority with significant disagreement on policing, sentencing, and rehabilitation." },
];

const CONNECTIONS = [
  { a: "1", b: "3", weight: 0.80, type: "causal",       label: "Users argue immigration drives housing demand" },
  { a: "1", b: "6", weight: 0.70, type: "co_occurrence", label: "Both tied to cost-of-living conversations" },
  { a: "3", b: "6", weight: 0.60, type: "co_occurrence", label: "Often raised together in inequality discussions" },
  { a: "2", b: "7", weight: 0.75, type: "co_occurrence", label: "Platform power raised in both contexts" },
  { a: "4", b: "6", weight: 0.65, type: "causal",       label: "Climate transition seen as affecting low-income workers" },
  { a: "5", b: "6", weight: 0.80, type: "co_occurrence", label: "Healthcare cost is the top inequality concern" },
  { a: "5", b: "9", weight: 0.70, type: "co_occurrence", label: "Often bundled as 'public services' spending" },
  { a: "8", b: "10", weight: 0.85, type: "causal",      label: "Drug offences are seen as criminal justice driver" },
  { a: "10", b: "3", weight: 0.60, type: "co_occurrence", label: "Linked in border enforcement discussions" },
  { a: "4", b: "2", weight: 0.50, type: "co_occurrence", label: "AI and climate intersect in energy/efficiency debates" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeColor(consensus) {
  if (consensus > 0.6) return new THREE.Color(0x4ade80);
  if (consensus > 0.4) return new THREE.Color(0xfbbf24);
  return new THREE.Color(0xf87171);
}

function consensusLabel(c) {
  if (c > 0.6) return "High consensus";
  if (c > 0.4) return "Mixed views";
  return "Deep division";
}

function consensusStyle(c) {
  if (c > 0.6) return { color: "#4ade80", bg: "rgba(74,222,128,0.12)", bar: "#4ade80" };
  if (c > 0.4) return { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", bar: "#fbbf24" };
  return { color: "#f87171", bg: "rgba(248,113,113,0.12)", bar: "#f87171" };
}

// ─── Force-directed 3D layout ────────────────────────────────────────────────

function forceLayout(issues, connections, iterations = 250) {
  const pos = issues.map(() => ({
    x: (Math.random() - 0.5) * 5,
    y: (Math.random() - 0.5) * 5,
    z: (Math.random() - 0.5) * 5,
    vx: 0, vy: 0, vz: 0,
  }));

  const idx = {};
  issues.forEach((iss, i) => { idx[iss.id] = i; });

  const REPULSION = 3.0;
  const SPRING    = 0.06;
  const REST      = 2.2;
  const DAMPING   = 0.82;
  const GRAVITY   = 0.025;

  for (let t = 0; t < iterations; t++) {
    const alpha = 1 - t / iterations;

    // Repulsion between all pairs
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dz = pos[j].z - pos[i].z;
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.01;
        const f  = (REPULSION * alpha) / (d * d);
        pos[i].vx -= (dx/d)*f;  pos[i].vy -= (dy/d)*f;  pos[i].vz -= (dz/d)*f;
        pos[j].vx += (dx/d)*f;  pos[j].vy += (dy/d)*f;  pos[j].vz += (dz/d)*f;
      }
    }

    // Spring attraction along edges
    connections.forEach(c => {
      const ai = idx[c.a], bi = idx[c.b];
      if (ai == null || bi == null) return;
      const dx = pos[bi].x - pos[ai].x;
      const dy = pos[bi].y - pos[ai].y;
      const dz = pos[bi].z - pos[ai].z;
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.01;
      const stretch = d - REST * (1 - c.weight * 0.4);
      const f = SPRING * stretch * c.weight;
      pos[ai].vx += (dx/d)*f;  pos[ai].vy += (dy/d)*f;  pos[ai].vz += (dz/d)*f;
      pos[bi].vx -= (dx/d)*f;  pos[bi].vy -= (dy/d)*f;  pos[bi].vz -= (dz/d)*f;
    });

    // Gravity toward centre
    pos.forEach(p => {
      p.vx -= p.x * GRAVITY;
      p.vy -= p.y * GRAVITY;
      p.vz -= p.z * GRAVITY;
    });

    // Integrate
    pos.forEach(p => {
      p.vx *= DAMPING; p.vy *= DAMPING; p.vz *= DAMPING;
      p.x += p.vx;    p.y += p.vy;    p.z += p.vz;
    });
  }

  return pos.map(p => new THREE.Vector3(p.x, p.y, p.z));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConstellationView() {
  const mountRef    = useRef(null);
  const pivotRef    = useRef(null);
  const meshesRef   = useRef([]);
  const animRef     = useRef(null);
  const dragging    = useRef(false);
  const prevMouse   = useRef({ x: 0, y: 0 });
  const dragDelta   = useRef(0);      // track movement to distinguish click vs drag
  const autoRotate  = useRef(true);
  const autoTimer   = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);

  const [selected,  setSelected]  = useState(null);
  const [ready,     setReady]     = useState(false);
  const [activeTab, setActiveTab] = useState("constellation");

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // Scene
    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x07090f);
    scene.fog = new THREE.FogExp2(0x07090f, 0.04);

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
    camera.position.set(0, 0, 13);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.PointLight(0x818cf8, 3, 25);
    key.position.set(3, 6, 6);
    scene.add(key);
    const fill = new THREE.PointLight(0xffffff, 0.8, 40);
    fill.position.set(-6, -4, -4);
    scene.add(fill);

    // Pivot (all constellation objects live here for rotation)
    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    // Starfield
    const starPos = new Float32Array(2000 * 3);
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 120;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.35 })));

    // Layout
    const positions = forceLayout(ISSUES, CONNECTIONS);
    const idxMap    = {};
    ISSUES.forEach((iss, i) => { idxMap[iss.id] = i; });

    // Edges
    CONNECTIONS.forEach(conn => {
      const ai = idxMap[conn.a], bi = idxMap[conn.b];
      if (ai == null || bi == null) return;
      const pts = [positions[ai], positions[bi]];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: conn.weight * 0.4,
      });
      pivot.add(new THREE.Line(geo, mat));
    });

    // Nodes + halos
    const meshes = [];
    ISSUES.forEach((issue, i) => {
      const r   = 0.22 + issue.energy * 0.22;
      const col = nodeColor(issue.consensus);

      // Main sphere
      const geo  = new THREE.SphereGeometry(r, 40, 40);
      const mat  = new THREE.MeshPhongMaterial({
        color:            col,
        emissive:         col,
        emissiveIntensity: 0.35,
        transparent:      true,
        opacity:          0.92,
        shininess:        120,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(positions[i]);
      mesh.userData = { issue, index: i };
      pivot.add(mesh);
      meshes.push(mesh);

      // Halo (outer glow via BackSide sphere)
      const haloGeo = new THREE.SphereGeometry(r * 1.55, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color:       col,
        transparent: true,
        opacity:     0.06,
        side:        THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(positions[i]);
      pivot.add(halo);
    });
    meshesRef.current = meshes;

    setReady(true);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse2    = new THREE.Vector2();

    // Animate
    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      if (autoRotate.current && !dragging.current) {
        pivot.rotation.y += 0.0015;
      }
      renderer.render(scene, camera);
    };
    tick();

    // ── Mouse / touch events ──────────────────────────────────────────────
    const startDrag = (x, y) => {
      dragging.current = true;
      dragDelta.current = 0;
      prevMouse.current = { x, y };
      clearTimeout(autoTimer.current);
      autoRotate.current = false;
    };
    const moveDrag = (x, y) => {
      if (!dragging.current) return;
      const dx = x - prevMouse.current.x;
      const dy = y - prevMouse.current.y;
      dragDelta.current += Math.abs(dx) + Math.abs(dy);
      pivot.rotation.y += dx * 0.005;
      pivot.rotation.x += dy * 0.005;
      prevMouse.current = { x, y };
    };
    const endDrag = () => {
      dragging.current = false;
      autoTimer.current = setTimeout(() => { autoRotate.current = true; }, 2500);
    };

    const onMouseDown  = (e) => startDrag(e.clientX, e.clientY);
    const onMouseMove  = (e) => moveDrag(e.clientX, e.clientY);
    const onMouseUp    = ()  => endDrag();

    const onTouchStart = (e) => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchMove  = (e) => { if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchEnd   = ()  => endDrag();

    const onClick = (e) => {
      // Only fire if barely moved (not a drag)
      if (dragDelta.current > 8) return;
      const rect = mount.getBoundingClientRect();
      mouse2.x = ((e.clientX - rect.left) / W) * 2 - 1;
      mouse2.y = -((e.clientY - rect.top)  / H) * 2 + 1;
      raycaster.setFromCamera(mouse2, camera);
      const hits = raycaster.intersectObjects(meshesRef.current);
      setSelected(hits.length > 0 ? hits[0].object.userData.issue : null);
    };

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    mount.addEventListener("mousedown",  onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    mount.addEventListener("click",      onClick);
    mount.addEventListener("touchstart", onTouchStart, { passive: true });
    mount.addEventListener("touchmove",  onTouchMove,  { passive: true });
    mount.addEventListener("touchend",   onTouchEnd);
    window.addEventListener("resize",    onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(autoTimer.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      mount.removeEventListener("mousedown",  onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
      mount.removeEventListener("click",      onClick);
      mount.removeEventListener("touchstart", onTouchStart);
      mount.removeEventListener("touchmove",  onTouchMove);
      mount.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("resize",    onResize);
    };
  }, []);

  // Highlight selected node
  useEffect(() => {
    meshesRef.current.forEach(mesh => {
      const isSel = selected && mesh.userData.issue.id === selected.id;
      mesh.material.emissiveIntensity = isSel ? 0.85 : 0.35;
      mesh.material.opacity           = isSel ? 1.0  : (selected ? 0.45 : 0.92);
    });
  }, [selected]);

  const getConns = (issue) =>
    CONNECTIONS
      .filter(c => c.a === issue.id || c.b === issue.id)
      .map(c => ({
        ...c,
        otherName: ISSUES.find(i => i.id === (c.a === issue.id ? c.b : c.a))?.name ?? "Unknown",
      }));

  const tabs = [
    { id: "chat",          icon: "💬", label: "Chat" },
    { id: "mine",          icon: "👤", label: "Mine" },
    { id: "shared",        icon: "🌐", label: "Shared" },
    { id: "constellation", icon: "✦",  label: "Constellation" },
  ];

  return (
    <div style={{ width: "100%", height: "100vh", background: "#07090f", position: "relative", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflow: "hidden", userSelect: "none" }}>

      {/* Header */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "18px 20px 40px", background: "linear-gradient(to bottom, rgba(7,9,15,0.98) 40%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ color: "white", fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>Your Constellation</h1>
            <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 11, margin: "4px 0 0", letterSpacing: "0.01em" }}>
              {ISSUES.length} issues · {CONNECTIONS.length} connections
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 2 }}>
            {[
              { col: "#4ade80", label: "Consensus" },
              { col: "#fbbf24", label: "Mixed" },
              { col: "#f87171", label: "Divided" },
            ].map(({ col, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />
                <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3D canvas */}
      <div
        ref={mountRef}
        style={{ width: "100%", height: "100%", cursor: "grab" }}
      />

      {/* Loading */}
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, letterSpacing: "0.05em" }}>Building constellation…</span>
        </div>
      )}

      {/* Drag hint */}
      {ready && !selected && (
        <div style={{ position: "absolute", bottom: 90, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, letterSpacing: "0.04em" }}>Drag to rotate · tap a node to explore</span>
        </div>
      )}

      {/* Issue detail panel */}
      {selected && (() => {
        const cs = consensusStyle(selected.consensus);
        const conns = getConns(selected);
        return (
          <div
            key={selected.id}
            style={{
              position: "absolute", bottom: 80, left: 14, right: 14,
              background: "rgba(12,16,28,0.97)",
              borderRadius: 18,
              border: "1px solid rgba(99,102,241,0.25)",
              padding: "18px 18px 20px",
              backdropFilter: "blur(24px)",
              animation: "panelUp 0.22s cubic-bezier(0.22,1,0.36,1)",
              zIndex: 25,
              maxHeight: "55vh",
              overflowY: "auto",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ flex: 1, paddingRight: 10 }}>
                <h2 style={{ color: "white", fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                  {selected.name}
                </h2>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 3, display: "block" }}>
                  {selected.members.toLocaleString()} members
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "rgba(255,255,255,0.5)", width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >×</button>
            </div>

            {/* Stance */}
            <p style={{ color: "rgba(255,255,255,0.58)", fontSize: 13, lineHeight: 1.65, margin: "0 0 14px" }}>
              {selected.stance}
            </p>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {/* Energy */}
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Energy</div>
                <div style={{ background: "rgba(255,255,255,0.09)", borderRadius: 3, height: 3, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ background: "#6366f1", height: "100%", width: `${selected.energy * 100}%`, borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ color: "white", fontSize: 14, fontWeight: 500 }}>{Math.round(selected.energy * 100)}<span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>%</span></div>
              </div>

              {/* Consensus */}
              <div style={{ background: cs.bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${cs.color}22` }}>
                <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Agreement</div>
                <div style={{ background: "rgba(255,255,255,0.09)", borderRadius: 3, height: 3, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ background: cs.bar, height: "100%", width: `${selected.consensus * 100}%`, borderRadius: 3 }} />
                </div>
                <div style={{ color: cs.color, fontSize: 12, fontWeight: 500 }}>{consensusLabel(selected.consensus)}</div>
              </div>
            </div>

            {/* Connections */}
            {conns.length > 0 && (
              <div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  Connected issues
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {conns.slice(0, 4).map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{
                        fontSize: 9, padding: "3px 7px", borderRadius: 5, flexShrink: 0, marginTop: 1,
                        background: c.type === "causal" ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.06)",
                        color:      c.type === "causal" ? "#a5b4fc"               : "rgba(255,255,255,0.35)",
                        letterSpacing: "0.05em", textTransform: "uppercase",
                      }}>
                        {c.type === "causal" ? "causes" : "linked"}
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{c.otherName}</div>
                        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, marginTop: 1 }}>{c.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Bottom tab bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "rgba(7,9,15,0.97)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "10px 0 22px",
        display: "flex", justifyContent: "space-around",
        zIndex: 30,
      }}>
        {tabs.map(({ id, icon, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "0 12px" }}
            >
              <span style={{ fontSize: id === "constellation" ? 17 : 20 }}>{icon}</span>
              <span style={{ fontSize: 10, color: active ? "#818cf8" : "rgba(255,255,255,0.28)", fontWeight: active ? 600 : 400, letterSpacing: "0.01em" }}>
                {label}
              </span>
              {active && <div style={{ width: 16, height: 2, background: "#6366f1", borderRadius: 1, marginTop: 1 }} />}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes panelUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
