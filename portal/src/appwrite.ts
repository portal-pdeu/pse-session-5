import { Client, Account, ID } from 'appwrite'

// Both values come from the environment (copy env.sample to .env). The project
// id is public - it ships in every browser bundle - but it is not committed, so
// a clone does not point at someone else's Appwrite project.
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID
if (!PROJECT_ID) {
  throw new Error('VITE_APPWRITE_PROJECT_ID is not set. Copy portal/env.sample to portal/.env and fill it in.')
}

export const PROJECT_ID_IN_USE = PROJECT_ID

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID)
const account = new Account(client)

export { client, account, ID }

// One ping when the app starts, so the Appwrite console's "Connect your app"
// step turns green and the browser console confirms the setup works.
client
  .ping()
  .then(() => console.info(`[appwrite] ping ok (${ENDPOINT}, project ${PROJECT_ID})`))
  .catch((err: unknown) => console.error('[appwrite] ping failed:', err))
