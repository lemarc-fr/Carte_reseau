import React from "react";

export interface CoalIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

// Wagonnet de charbon
const CoalIcon: React.FC<CoalIconProps> = ({ size, color, width, height, ...props }) => (
  <svg fill={color ?? "currentColor"} viewBox="0 0 24 24" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}><path d="M7 5.5 9.5 3l2 1.5L14 3l3 2.5L18.5 4 21 7H3l1.5-2.5L7 5.5ZM2 8h20l-2 9H4L2 8Zm5 10.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Zm10 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z" /></svg>
);

export default CoalIcon;
