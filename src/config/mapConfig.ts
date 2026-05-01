export const PROTOMAPS_API_KEY = "d0a95613fda80905";
const arome_api_key = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtYXJjYnJ1bmV0OTJAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJtYXJjYnJ1bmV0OTIiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjo0MDI3OSwidXVpZCI6ImVhZTc3YmQwLTk4ZjctNDNlYy1iZmFkLWM0MzFmZWExODA0OCJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9fSwia2V5dHlwZSI6IlBST0RVQ1RJT04iLCJzdWJzY3JpYmVkQVBJcyI6W3sic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJBUk9NRSIsImNvbnRleHQiOiJcL3B1YmxpY1wvYXJvbWVcLzEuMCIsInB1Ymxpc2hlciI6ImFkbWluX21mIiwidmVyc2lvbiI6IjEuMCIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9XSwiZXhwIjoxODcyMjQ1MzE1LCJ0b2tlbl90eXBlIjoiYXBpS2V5IiwiaWF0IjoxNzc3NTcyNTE1LCJqdGkiOiIxYjRiNzhlYy1iNGVkLTQ0Y2QtOWI3Yi04OWRlMDViMjJjZTcifQ==.LRuTKVa0HJyFbKyJZP-NF56-6G6XBD_n464n9EijKEyI4P-EBuDzY2hjaTyLcPsdi_ksi-L0gXObpYK42bRK0n8hVmVBTKWshxMeCTmkYismW2mrpg278qwLjqIuoKuNpNsBv_MdzLaAvhaMwIFD22FOJuww64BqIwqZ4H1AJdv_PNaRpHAemPbnpufix8r972B28iN9eIGyWtxGMtPqsKgI4G3lvSQTxhVCpfurP9T72CNvcctfttbHU0G4nRZI8VPeYXAeQiEslF_FVPej8ra0UdwDxj0L0T02WR8k7YI_xAmBPygRdpL_QdtainyHzQofh2r30LIak8Ls4hLwvA==";

export const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 50,
  zoom: 4.2,
  minZoom: 3,
  maxZoom: 7,
  pitch: 0,
  bearing: 0
};

export const BOUNDS = {
  minLon: -8, maxLon: 10,
  minLat: 40, maxLat: 52,
};

export const EUROPE_BOUNDS: [[number, number], [number, number]] = [
  [BOUNDS.minLon, BOUNDS.minLat],
  [BOUNDS.maxLon, BOUNDS.maxLat]
];

export const GRID_COLS = 32;
export const GRID_ROWS = 20;

export const UV_MAX = 30;

export const WIND_PALETTE: [number, string][] = [
  [0,   '#1a6faf'],
  [0.2, '#36a9e1'],
  [0.4, '#7ecba1'],
  [0.6, '#f6d155'],
  [0.8, '#f4833d'],
  [1.0, '#c8102e'],
];