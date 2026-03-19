const SALESFORCE_INSTANCE_URL = process.env.SALESFORCE_INSTANCE_URL!;
const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;
const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET!;

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const tokenUrl = `${SALESFORCE_INSTANCE_URL}/services/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SALESFORCE_CLIENT_ID,
    client_secret: SALESFORCE_CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Salesforce auth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Salesforce tokens typically last ~2 hours; set expiry accordingly
  tokenExpiresAt = Date.now() + 2 * 60 * 60 * 1000;

  return cachedToken!;
}

function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

interface SOQLResponse<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export async function querySOQL<T>(soql: string): Promise<T[]> {
  const token = await getAccessToken();
  const url = `${SALESFORCE_INSTANCE_URL}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`;

  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once on 401 with a fresh token
  if (response.status === 401) {
    invalidateToken();
    const freshToken = await getAccessToken();
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SOQL query failed (${response.status}): ${errorText}`);
  }

  const data: SOQLResponse<T> = await response.json();
  return data.records;
}

export async function queryAllSOQL<T>(soql: string): Promise<T[]> {
  const token = await getAccessToken();
  const firstUrl = `${SALESFORCE_INSTANCE_URL}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`;

  let response = await fetch(firstUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once on 401
  if (response.status === 401) {
    invalidateToken();
    const freshToken = await getAccessToken();
    response = await fetch(firstUrl, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SOQL query failed (${response.status}): ${errorText}`);
  }

  let data: SOQLResponse<T> = await response.json();
  const allRecords: T[] = [...data.records];

  // Handle pagination
  while (!data.done && data.nextRecordsUrl) {
    const currentToken = await getAccessToken();
    const nextUrl = `${SALESFORCE_INSTANCE_URL}${data.nextRecordsUrl}`;
    const nextResponse = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (!nextResponse.ok) {
      const errorText = await nextResponse.text();
      throw new Error(`SOQL pagination failed (${nextResponse.status}): ${errorText}`);
    }

    data = await nextResponse.json();
    allRecords.push(...data.records);
  }

  return allRecords;
}
