export const PROTOMAPS_API_KEY = "d0a95613fda80905";
export const API_KEY_METEO = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtYXJjYnJ1bmV0OTJAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJtYXJjYnJ1bmV0OTIiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjo0MDI3OSwidXVpZCI6ImVhZTc3YmQwLTk4ZjctNDNlYy1iZmFkLWM0MzFmZWExODA0OCJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9fSwia2V5dHlwZSI6IlBST0RVQ1RJT04iLCJzdWJzY3JpYmVkQVBJcyI6W3sic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJBUk9NRSIsImNvbnRleHQiOiJcL3B1YmxpY1wvYXJvbWVcLzEuMCIsInB1Ymxpc2hlciI6ImFkbWluX21mIiwidmVyc2lvbiI6IjEuMCIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9XSwiZXhwIjoxODcyMzIyMDE2LCJ0b2tlbl90eXBlIjoiYXBpS2V5IiwiaWF0IjoxNzc3NjQ5MjE2LCJqdGkiOiJkYzlkMTY2Ni00MGNiLTRkZWItYTgxNy04OGQ5YzFlNzA3NDcifQ==.RYxSy3h31aZEXdLwJTi9NRiaJzQo0MYBla0t6jyAg2DA21Mdp_b3E48lictpEU4SDPud2tuHZVWsyerR7FaBQMMsKMMF-Tb2FGL1zJqLS7f6ZwnhZQpQZM_9NsUdzjXuWwb8pCxb6vKn-p3gQlqsurj-s4eyr-5DQE4FoM7fJDtlEDMD91D848XTN4UTELlpfiGKqmyN7wSw5PeZ9pFBaD7iID2aFa6WdXu10nEidf9o2SaEBBgAG4Ux0qElKyZp5bYJd-oMBjzu_WUIQZVmq6pgvs9u4whqZtwmAekVu_Tj0MpXA_bzznwQ-grVcunUc79yVqeoWJgjClE2umIloA==";

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


// Particules blanches
export const PARTICLE_COLOR: [number, number, number, number] = [255, 255, 255, 200];

// Palette pour le fond raster (vitesse du vent)
export const WIND_PALETTE: [number, string][] = [
  [0,    '#0d47a1'],  // calme — bleu très foncé
  [0.05, '#1565c0'],
  [0.1,  '#1976d2'],
  [0.15, '#1e88e5'],
  [0.2,  '#42a5f5'],  // légère brise — bleu clair
  [0.3,  '#4db6ac'],  // vert-bleu
  [0.4,  '#66bb6a'],  // vert
  [0.5,  '#d4e157'],  // jaune-vert
  [0.6,  '#ffee58'],  // jaune
  [0.7,  '#ffa726'],  // orange
  [0.8,  '#ef5350'],  // rouge
  [0.9,  '#b71c1c'],
  [1.0,  '#4a148c'],  // violet — vents violents
];