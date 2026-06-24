interface TokenCache {
    token: string;
    expiresAt: number;
}

let cache: TokenCache | null = null;

export async function getRteToken(): Promise<string> {
    if (cache && Date.now() < cache.expiresAt - 60_000) {
        return cache.token;
    }

    const clientId = process.env.RTE_CLIENT_ID;
    const clientSecret = process.env.RTE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("RTE_CLIENT_ID ou RTE_CLIENT_SECRET manquant dans .env");
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(
        "https://digital.iservices.rte-france.com/token/oauth/",
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        }
    );

    if (!response.ok) {
        throw new Error(`RTE auth failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    cache = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };

    return cache.token;
}