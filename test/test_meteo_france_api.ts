// test.ts
import { fetchUVTiff } from "@/lib/wind/UV_TIFF";
import { API_KEY_METEO, BOUNDS } from "@/config/mapConfig"; 
import { writeFile } from "fs/promises";

async function testFetchUVTiff() {
    const [u, v] = await fetchUVTiff(API_KEY_METEO, BOUNDS);

    console.log("U:", u.byteLength, "bytes");
    console.log("V:", v.byteLength, "bytes");

    await writeFile("wind_u.tiff", Buffer.from(u));
    await writeFile("wind_v.tiff", Buffer.from(v));
    console.log("Fichiers écrits : wind_u.tiff, wind_v.tiff");
}

testFetchUVTiff().catch(console.error);
