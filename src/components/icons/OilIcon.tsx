import React from "react";

export interface OilIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

// Baril de fioul
const OilIcon: React.FC<OilIconProps> = ({ size, color, width, height, ...props }) => (
  <svg fill={color ?? "currentColor"} viewBox="0 0 24 24" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}><path d="M6 2h12v2H6V2Zm-1 3h14v4h-1v6h1v4H5v-4h1V9H5V5Zm3 4v6h8V9H8Zm-2 11h12v2H6v-2Z" /></svg>
);

export default OilIcon;
