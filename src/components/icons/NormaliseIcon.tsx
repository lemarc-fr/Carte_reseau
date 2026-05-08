import React from "react";

export interface NormaliseIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

const NormaliseIcon: React.FC<NormaliseIconProps> = ({
  size,
  color,
  width,
  height,
  ...props
}) => (
  <svg stroke={color ?? "currentColor"} fill={color ?? "currentColor"} strokeWidth="0" viewBox="0 0 448 512" focusable="false" height={height ?? size ?? "1em"} width={width ?? size ?? "1em"} xmlns="http://www.w3.org/2000/svg" {...props}><path d="M416 304H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32zm0-192H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"></path></svg>
);

export default NormaliseIcon;
