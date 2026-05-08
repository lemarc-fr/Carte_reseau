const WindParticlesIcon = ({ width = 18, height = 18, stroke = '#000000' }: {
  width?: number;
  height?: number;
  stroke?: string;
}) => (
  <svg stroke={stroke} fill="none" strokeWidth="2" viewBox="0 0 24 24"
    strokeLinecap="round" strokeLinejoin="round"
    width={width} height={height} xmlns="http://www.w3.org/2000/svg">
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  </svg>
);

export default WindParticlesIcon;