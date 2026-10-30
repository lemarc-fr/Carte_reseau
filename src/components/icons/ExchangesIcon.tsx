import React from "react";

export interface ExchangesIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

// ⇄ : échanges aux frontières
const ExchangesIcon: React.FC<ExchangesIconProps> = ({ size, color, width, height, ...props }) => (
  <svg stroke={color ?? "currentColor"} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />
  </svg>
);

export default ExchangesIcon;
