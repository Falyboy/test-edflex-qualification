import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'

export interface User {
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

function redis() {
  return Redis.fromEnv()
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const db = redis()
  const passwordHash = await bcrypt.hash(password, 10)
  const user: User = { email, name, passwordHash, createdAt: new Date().toISOString() }
  // SET NX — atomic: fails if key already exists
  const result = await db.set(`user:${email}`, user, { nx: true })
  if (result === null) throw new Error(`User already exists`)
  return user
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return redis().get<User>(`user:${email}`)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
