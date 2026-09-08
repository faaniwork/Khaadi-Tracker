"use client";

import { useEffect, useRef } from "react";
import { onConfettiBurst } from "@/lib/confetti-bus";

function reduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ConfettiCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function burst({ x, y, count }) {
      if (reduceMotion() || !ctx) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cs = getComputedStyle(document.documentElement);
      const palette = ["--primary", "--warn", "--good", "--info"].map((v) =>
        cs.getPropertyValue(v).trim() || "#7C6EF0"
      );
      const particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 9,
          vy: Math.random() * -9 - 4,
          g: 0.28 + Math.random() * 0.14,
          size: 4 + Math.random() * 4,
          color: palette[Math.floor(Math.random() * palette.length)],
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.35,
          life: 0,
          maxLife: 65 + Math.random() * 40,
          shape: Math.random() < 0.5 ? "rect" : "circle",
        });
      }
      function tick() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach((p) => {
          if (p.life > p.maxLife) return;
          alive = true;
          p.vy += p.g;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          p.life++;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });
        if (alive) requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      tick();
    }

    return onConfettiBurst(burst);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[60]"
      aria-hidden="true"
    />
  );
}
