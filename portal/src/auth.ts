import { AppwriteException, type Models } from 'appwrite'
import { account } from './appwrite'

export interface Player {
  id: string
  email: string
  // accounts are created by the admin with the `player` label; anyone else has no access
  is_player: boolean
}

// `player` is an Appwrite user label. Labels can only be set from the console or
// a server key, so nobody can give it to themselves.
function toPlayer(user: Models.User<Models.Preferences>): Player {
  return {
    id: user.$id,
    email: user.email,
    is_player: user.labels.includes('player'),
  }
}

// Appwrite's own messages are fine for most failures (bad email, short
// password); only the ones a player commonly hits get friendlier wording.
function friendly(err: unknown): Error {
  if (err instanceof AppwriteException) {
    if (err.type === 'user_invalid_credentials') return new Error('Invalid email or password')
    if (err.code === 429) return new Error('Too many attempts - wait a minute and try again')
    return new Error(err.message)
  }
  if (err instanceof TypeError) return new Error('Cannot reach Appwrite - check your connection')
  return err instanceof Error ? err : new Error('Something went wrong')
}

// null when nobody is signed in; any other failure (network, bad config) throws.
export async function getCurrentPlayer(): Promise<Player | null> {
  try {
    return toPlayer(await account.get())
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 401) return null
    throw friendly(err)
  }
}

async function endSession(): Promise<void> {
  try {
    await account.deleteSession({ sessionId: 'current' })
  } catch {
    // no session to end
  }
}

export async function login(email: string, password: string): Promise<Player> {
  try {
    // creating a session while one is active is rejected, so clear it first
    await endSession()
    await account.createEmailPasswordSession({ email: email.trim(), password })
    const player = await getCurrentPlayer()
    if (!player) throw new Error('Sign-in did not start a session')
    return player
  } catch (err) {
    throw friendly(err)
  }
}

export async function logout(): Promise<void> {
  await endSession()
}
