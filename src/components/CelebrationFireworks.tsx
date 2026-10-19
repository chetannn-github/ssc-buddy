import type { CSSProperties } from "react";
import "./celebration-fireworks.css";

const bursts = [{ left: 17, top: 20 }, { left: 82, top: 27 }, { left: 27, top: 72 }, { left: 76, top: 77 }];
const colors = ["#fcd34d", "#a78bfa", "#67e8f9", "#fb7185", "#86efac"];

export function CelebrationFireworks() {
  return <div className="celebration-fireworks" aria-hidden="true">
    {bursts.map((burst, index) => <div key={index} className="celebration-firework" style={{ left: `${burst.left}%`, top: `${burst.top}%` }}>
      {Array.from({ length: 12 }, (_, spark) => {
        const angle = spark * Math.PI / 6;
        const distance = 65 + spark % 3 * 18;
        return <span key={spark} className="celebration-firework-spark" style={{
          "--spark-x": `${Math.cos(angle) * distance}px`, "--spark-y": `${Math.sin(angle) * distance}px`,
          backgroundColor: colors[(index + spark) % colors.length], animationDelay: `${index * 0.55}s`,
        } as CSSProperties} />;
      })}
    </div>)}
  </div>;
}
