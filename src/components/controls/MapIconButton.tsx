import React, { useState } from 'react';

interface MapIconButtonProps {
  icon: React.ReactNode;
  active?: boolean;
  title?: string;
  onClick?: () => void;
}

const BUTTON_SIZE = 29;

/**
 * A styled icon button matching the MapLibre control button appearance.
 * - Shows a semi-transparent veil on hover.
 * - Renders icon in grey when `active` is false.
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
      style={buttonStyle}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={veilStyle} />
      {icon}
    </button>
  );
}
