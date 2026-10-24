import React from "react";

export interface LargeUnitsIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

// « 100 MW » : uniquement les sites dotés d'un groupe de 100 MW ou plus
const LargeUnitsIcon: React.FC<LargeUnitsIconProps> = ({ size, color, width, height, ...props }) => (
  <svg fill={color ?? "currentColor"} viewBox="0 0 24 24" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}>
    <text x="12" y="11" fontSize="10" fontWeight="700" textAnchor="middle" fontFamily="system-ui, sans-serif">100</text>
    <text x="12" y="21" fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">MW</text>
  </svg>
);

export default LargeUnitsIcon;
