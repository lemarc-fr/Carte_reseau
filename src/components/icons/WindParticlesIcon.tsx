import React from "react";

export interface WindParticlesIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

const WindParticlesIcon: React.FC<WindParticlesIconProps> = ({
  size,
  color,
  width,
  height,
  ...props
}) => (
  <svg stroke={color ?? "currentColor"} fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path></svg>
);

export default WindParticlesIcon;
