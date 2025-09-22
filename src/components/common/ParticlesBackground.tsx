import React, { useMemo } from 'react';

// Function to generate multiple box shadows for stars
const generateStars = (count: number, maxSize: number = 3000) => {
  const stars = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * maxSize);
    const y = Math.floor(Math.random() * maxSize);
    stars.push(`${x}px ${y}px #FFC700`);
  }
  return stars.join(', ');
};

const ParticlesBackground: React.FC = () => {
  // Generate star patterns with golden casino colors
  const smallStars = useMemo(() => generateStars(700), []);
  const mediumStars = useMemo(() => generateStars(200), []);
  const bigStars = useMemo(() => generateStars(100), []);

  return (
    <div 
      className="pointer-events-none"
      style={{
        position: 'fixed',
        zIndex: 1,
        background: 'radial-gradient(ellipse at bottom, #2D2149 0%, #1E1733 100%)',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      {/* Small stars */}
      <div
        className="absolute w-px h-px bg-transparent"
        style={{
          boxShadow: smallStars,
          animation: 'animStar 50s linear infinite',
        }}
      >
        <div
          className="absolute w-px h-px bg-transparent"
          style={{
            top: '2000px',
            boxShadow: smallStars,
          }}
        />
      </div>

      {/* Medium stars */}
      <div
        className="absolute w-0.5 h-0.5 bg-transparent"
        style={{
          boxShadow: mediumStars,
          animation: 'animStar 100s linear infinite',
        }}
      >
        <div
          className="absolute w-0.5 h-0.5 bg-transparent"
          style={{
            top: '2000px',
            boxShadow: mediumStars,
          }}
        />
      </div>

      {/* Large stars */}
      <div
        className="absolute w-1 h-1 bg-transparent"
        style={{
          boxShadow: bigStars,
          animation: 'animStar 150s linear infinite',
        }}
      >
        <div
          className="absolute w-1 h-1 bg-transparent"
          style={{
            top: '2000px',
            boxShadow: bigStars,
          }}
        />
      </div>
    </div>
  );
};

export default ParticlesBackground; 