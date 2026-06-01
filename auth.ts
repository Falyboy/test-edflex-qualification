import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { getUserByEmail, verifyPassword } from '@/lib/auth/users'
import { Redis } from '@upstash/redis'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await getUserByEmail(email)
        if (!user) return null

        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null

        return { id: email, email: user.email, name: user.name }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const redis = Redis.fromEnv()
        const [existing, existingProfile] = await Promise.all([
          redis.get(`user:${user.email}`),
          redis.get(`profile:${user.email}`),
        ])
        const nameParts = (user.name ?? '').trim().split(/\s+/)
        const prenom = nameParts[0] ?? ''
        const nom = nameParts.slice(1).join(' ')
        if (!existing) {
          await redis.set(`user:${user.email}`, {
            email: user.email,
            name: user.name ?? '',
            authProvider: 'google',
            createdAt: new Date().toISOString(),
          }, { ex: 60 * 60 * 24 * 365 })
        }
        if (!existingProfile && (prenom || nom)) {
          await redis.set(`profile:${user.email}`, { prenom, nom }, { ex: 60 * 60 * 24 * 365 })
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) token.email = user.email
      return token
    },
    async session({ session, token }) {
      if (token.email) session.user.email = token.email as string
      return session
    },
  },
})
