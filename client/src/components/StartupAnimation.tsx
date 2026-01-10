import React, { useEffect, useState } from 'react';
import './StartupAnimation.css';

interface StartupAnimationProps {
  onComplete: () => void;
}

export const StartupAnimation: React.FC<StartupAnimationProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Sequence (Total ~1.5s):
    // 0ms: Initial (Big Red X)
    // 400ms: Morph to NoteX (Center)
    // 1000ms: Move Up + Color Change
    // 1500ms: Fade Out / Complete
    
    const timer1 = setTimeout(() => setStep(1), 200);
    const timer2 = setTimeout(() => setStep(2), 900); // Move Up phase
    const timer3 = setTimeout(() => setStep(3), 1500); // Fade out (900 + 600ms transition)
    const timer4 = setTimeout(() => onComplete(), 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onComplete]);

  return (
    <div className={`startup-container ${step >= 3 ? 'fade-out' : ''}`}>
      {/* Add 'move' class for the lift up animation */}
      <div className={`logo-wrapper ${step >= 2 ? 'move' : ''}`}>
        <span className={`logo-part prefix ${step >= 1 ? 'visible' : ''}`}>Note</span>
        {/* Add 'finalize' class for color change */}
        <span className={`logo-part x-mark ${step >= 1 ? 'shrink' : ''} ${step >= 2 ? 'finalize' : ''}`}>X</span>
      </div>
    </div>
  );
};
