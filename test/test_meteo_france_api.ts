// test.ts
import { fetchUVTiff } from "@/lib/wind/UV_TIFF";
import "dotenv/config";
import { BOUNDS } from "@/config/mapConfig";
import { writeFile } from "fs/promises";

async function testFetchUVTiff() {
    const { u, v, runTime, validTime } = await fetchUVTiff(process.env.METEO_FRANCE_API_KEY!, BOUNDS);
    console.log("Run :", runTime?.toISOString(), "échéance :", validTime.toISOString());

    console.log("U:", u.byteLength, "bytes");
    console.log("V:", v.byteLength, "bytes");

    await writeFile("wind_u.tiff", Buffer.from(u));
    await writeFile("wind_v.tiff", Buffer.from(v));
    console.log("Fichiers écrits : wind_u.tiff, wind_v.tiff");
}

testFetchUVTiff().catch(console.error);
