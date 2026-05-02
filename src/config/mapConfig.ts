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
  minLon: -10, maxLon: 15,
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
  [0,  '#f8f9fa'],  // calme — blanc cassé
  [1,  '#c8e6f5'],  // quasi-calme — bleu très pâle
  [3,  '#7ec8e3'],  // petite brise
  [5,  '#0099cc'],  // brise légère
  [8,  '#00b386'],  // brise modérée — vert-cyan
  [10, '#44cc44'],  // brise fraîche
  [13, '#aadd00'],  // brise forte — jaune-vert
  [16, '#ffdd00'],  // grand frais — jaune
  [20, '#ff8800'],  // coup de vent — orange
  [24, '#ff2200'],  // fort coup de vent — rouge
  [28, '#cc0044'],  // tempête — rouge foncé
  [32, '#880088'],  // violente tempête — violet
  [36, '#330055'],  // ouragan — violet très foncé
];