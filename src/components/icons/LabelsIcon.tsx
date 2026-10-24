import React from "react";

export interface LabelsIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

// « Aa » : noms des centrales
const LabelsIcon: React.FC<LabelsIconProps> = ({ size, color, width, height, ...props }) => (
  <svg fill={color ?? "currentColor"} viewBox="0 0 24 24" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}>
    <text x="12" y="17" fontSize="14" fontWeight="700" textAnchor="middle" fontFamily="system-ui, sans-serif">Aa</text>
  </svg>
);

export default LabelsIcon;
