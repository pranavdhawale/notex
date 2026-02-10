import React, { useEffect, useState } from "react";
import "./StartupAnimation.css";

interface StartupAnimationProps {
  onComplete: () => void;
}

export const StartupAnimation: React.FC<StartupAnimationProps> = ({
  onComplete,
}) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Simplified Sequence:
    // 0ms: Initial (Big Red X)
    // 200ms: Morph to NoteX (Center) with color change
    // 1000ms: Fade Out
    // 1500ms: Complete

    const timer1 = setTimeout(() => setStep(1), 200); // Morph to NoteX
    const timer2 = setTimeout(() => setStep(2), 1000); // Fade out
    const timer3 = setTimeout(() => onComplete(), 1500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  return (
    <div className={`startup-container ${step >= 2 ? "fade-out" : ""}`}>
      <div className="logo-wrapper">
        <span className={`logo-part prefix ${step >= 1 ? "visible" : ""}`}>
          Note
        </span>
        <span
          className={`logo-part x-mark ${step >= 1 ? "shrink finalize" : ""}`}
        >
          X
        </span>
      </div>
    </div>
  );
};
