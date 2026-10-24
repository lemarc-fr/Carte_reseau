import React, { useState } from 'react';

interface MapIconButtonProps {
  icon: React.ReactNode;
  active?: boolean;
  title: string;
  onClick: () => void;
}

const BUTTON_SIZE = 29;

/**
 * Bouton icône au format des contrôles MapLibre :
 * voile semi-transparent au survol, icône grisée quand `active` est faux.
 */
export default function MapIconButton({ icon, active = true, title, onClick }: MapIconButtonProps) {
  const [hovered, setHovered] = useState(false);

  const buttonStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
    color: active ? '#333' : '#aaa',
    transition: 'color 0.15s',
  };

  const veilStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.08)',
    borderRadius: 4,
    opacity: hovered ? 1 : 0,
    transition: 'opacity 0.15s',
    pointerEvents: 'none',
  };

  return (
    <button
      type="button"
      style={buttonStyle}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={veilStyle} />
      {icon}
    </button>
  );
}

export const DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: 'rgba(0,0,0,0.1)',
  margin: '0 4px',
};
