# GetStrong Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first bouldering training SPA where users can log in, record sessions with problems and exercises, and view progress on a dashboard.

**Architecture:** React + Vite SPA with Tailwind CSS. Supabase provides auth, PostgreSQL, and Row Level Security. TanStack Query owns all server state; Zustand owns active-session UI state. Recharts renders the dashboard charts.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS 3, React Router v7, TanStack Query v5, Zustand v5, Recharts 2, Supabase JS v2, react-hook-form, date-fns, react-hot-toast, Vitest.

---

## File Structure

```
getstrong/
├── index.html
├── vite.config.ts                              — Vite + Vitest config
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── .env.example
├── supabase/
│   ├── migrations/001_initial_schema.sql       — all Phase 1 tables + RLS
│   └── seed.sql                                — grade_mappings data
└── src/
    ├── main.tsx
    ├── App.tsx                                 — router + providers
    ├── index.css
    ├── types/
    │   └── index.ts                            — Session, Problem, Exercise, GradeMapping
    ├── lib/
    │   ├── supabase.ts                         — Supabase client singleton
    │   └── queryClient.ts                      — TanStack Query client config
    ├── providers/
    │   └── AuthProvider.tsx                    — auth context + useAuth export
    ├── store/
    │   └── sessionStore.ts                     — Zustand: active session id
    ├── hooks/
    │   ├── useSessions.ts                      — CRUD hooks for sessions
    │   ├── useProblems.ts                      — CRUD hooks for problems
    │   ├── useExercises.ts                     — CRUD hooks for exercises
    │   └── useDashboard.ts                     — combined dashboard data fetch
    │   (useAuth is exported from providers/AuthProvider.tsx, no separate file needed)
    ├── utils/
    │   ├── grades.ts                           — V ↔ Font conversion logic
    │   ├── stats.ts                            — send rate, weekly buckets, chart data
    │   └── __tests__/
    │       ├── grades.test.ts
    │       └── stats.test.ts
    ├── components/
    │   ├── ProtectedRoute.tsx                  — redirects to /login if no user
    │   ├── BottomNav.tsx                       — Dashboard / Sessions / Log tab bar
    │   ├── BottomSheet.tsx                     — reusable slide-up modal
    │   ├── FAB.tsx                             — floating action button
    │   ├── StatCard.tsx                        — dashboard stat card
    │   ├── SessionCard.tsx                     — session list row
    │   ├── ProblemForm.tsx                     — grade + color + attempts form
    │   ├── ExerciseForm.tsx                    — name + type + sets form
    │   ├── GradeProgressionChart.tsx           — Recharts line chart
    │   └── SessionFrequencyChart.tsx           — Recharts bar chart
    └── pages/
        ├── LoginPage.tsx
        ├── DashboardPage.tsx
        ├── SessionsPage.tsx
        ├── NewSessionPage.tsx
        ├── SessionDetailPage.tsx
        └── EditSessionPage.tsx
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `index.html` (by Vite scaffold)
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/index.css`
- Create: `src/main.tsx`
- Create: `.env.example`

- [ ] **Step 1: Scaffold Vite project inside the existing repo**

Run in the project root (`c:/work/getstrong/getstrong`):

```powershell
npm create vite@latest .
```

When prompted:
- "Current directory is not empty. Please choose how to proceed" → select **Ignore files and continue**
- Framework → **React**
- Variant → **TypeScript**

- [ ] **Step 2: Install all dependencies**

```powershell
npm install
npm install react-router-dom @tanstack/react-query zustand recharts @supabase/supabase-js react-hook-form date-fns react-hot-toast
npm install -D tailwindcss postcss autoprefixer vitest jsdom
npx tailwindcss init -p --ts
```

- [ ] **Step 3: Update `vite.config.ts` to add Vitest config**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 4: Update `tailwind.config.ts` to scan src files**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 5: Replace `src/index.css` with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Replace `src/main.tsx` with clean entry point**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Create `.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 8: Create `.env.local` with your real Supabase values**

Copy `.env.example` to `.env.local` and fill in the values from your Supabase project dashboard (Settings → API).

- [ ] **Step 9: Add `.env.local` to `.gitignore`**

The Vite scaffold creates `.gitignore` with `*.local` already excluded. Verify it contains `.env.local`.

- [ ] **Step 10: Verify the dev server starts**

```powershell
npm run dev
```

Expected: Vite prints a localhost URL. Open it — should show the default Vite+React page.

- [ ] **Step 11: Delete boilerplate Vite files**

```powershell
Remove-Item src/App.css
Remove-Item src/App.tsx
Remove-Item public/vite.svg
Remove-Item src/assets/react.svg
```

- [ ] **Step 12: Commit**

```powershell
git add -A
git commit -m "feat: scaffold React+Vite+Tailwind project"
```

---

## Task 2: Supabase Database Setup

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create the migration SQL file**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  location text not null,
  duration_minutes integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;
create policy "users manage own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Problems
create table problems (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_system text not null check (grade_system in ('v_scale', 'font', 'color')),
  grade_value text,
  color text,
  attempts integer not null default 1,
  sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table problems enable row level security;
create policy "users manage own problems"
  on problems for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exercises
create table exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('reps', 'time')),
  sets integer,
  reps integer,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;
create policy "users manage own exercises"
  on exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grade mappings (static lookup, readable by all authenticated users)
create table grade_mappings (
  v_scale text primary key,
  font_equivalent text not null
);

alter table grade_mappings enable row level security;
create policy "grade_mappings readable by authenticated users"
  on grade_mappings for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Create the seed SQL file**

Create `supabase/seed.sql`:

```sql
insert into grade_mappings (v_scale, font_equivalent) values
  ('VB', '3'),
  ('V0', '4'),
  ('V1', '5'),
  ('V2', '5+'),
  ('V3', '6A'),
  ('V4', '6B+'),
  ('V5', '6C+'),
  ('V6', '7A'),
  ('V7', '7A+'),
  ('V8', '7B+'),
  ('V9', '7C'),
  ('V10', '7C+'),
  ('V11', '8A'),
  ('V12', '8A+'),
  ('V13', '8B'),
  ('V14', '8B+'),
  ('V15', '8C'),
  ('V16', '8C+'),
  ('V17', '9A');
```

- [ ] **Step 3: Run the migration in Supabase**

Go to your Supabase project dashboard → **SQL Editor** → paste the contents of `001_initial_schema.sql` → click **Run**.

Expected: No errors. Tables appear in the Table Editor.

- [ ] **Step 4: Run the seed in Supabase**

In the SQL Editor → paste the contents of `seed.sql` → click **Run**.

Expected: 19 rows inserted into `grade_mappings`.

- [ ] **Step 5: Verify RLS is active**

In the Supabase dashboard → Table Editor → select `sessions` → click the **RLS** button. Confirm "Row Level Security is enabled" and the policy is listed.

Repeat for `problems` and `exercises`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/
git commit -m "feat: add Supabase schema migration and grade seed data"
```

---

## Task 3: Types and Lib Setup

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/queryClient.ts`

- [ ] **Step 1: Create shared TypeScript types**

Create `src/types/index.ts`:

```typescript
export type GradeSystem = 'v_scale' | 'font' | 'color'
export type ExerciseType = 'reps' | 'time'

export interface Session {
  id: string
  user_id: string
  date: string
  location: string
  duration_minutes: number | null
  notes: string | null
  created_at: string
}

export interface Problem {
  id: string
  session_id: string
  user_id: string
  grade_system: GradeSystem
  grade_value: string | null
  color: string | null
  attempts: number
  sent: boolean
  notes: string | null
  created_at: string
}

export interface Exercise {
  id: string
  session_id: string
  user_id: string
  name: string
  type: ExerciseType
  sets: number | null
  reps: number | null
  duration_seconds: number | null
  notes: string | null
  created_at: string
}

export interface GradeMapping {
  v_scale: string
  font_equivalent: string
}
```

- [ ] **Step 2: Create the Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 3: Create the TanStack Query client**

Create `src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60,
    },
  },
})
```

- [ ] **Step 4: Commit**

```powershell
git add src/types/ src/lib/
git commit -m "feat: add shared types and lib clients"
```

---

## Task 4: Auth, Routing, and App Shell

**Files:**
- Create: `src/providers/AuthProvider.tsx`
- Create: `src/components/ProtectedRoute.tsx`
- Create: `src/components/BottomNav.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Create AuthProvider**

Create `src/providers/AuthProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Create ProtectedRoute**

Create `src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { BottomNav } from './BottomNav'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen pb-16">
      <Outlet />
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 3: Create BottomNav**

Create `src/components/BottomNav.tsx`:

```tsx
import { NavLink, useNavigate } from 'react-router-dom'

export function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-30 flex safe-area-inset-bottom">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Dashboard
      </NavLink>
      <NavLink
        to="/sessions"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Sessions
      </NavLink>
      <button
        onClick={() => navigate('/sessions/new')}
        className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-indigo-600"
      >
        <span className="text-2xl font-bold leading-none mb-0.5">+</span>
        Log
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Create App.tsx with all routes**

Create `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './providers/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { SessionsPage } from './pages/SessionsPage'
import { NewSessionPage } from './pages/NewSessionPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { EditSessionPage } from './pages/EditSessionPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/new" element={<NewSessionPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/sessions/:id/edit" element={<EditSessionPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 5: Create stub page files so the app compiles**

Create `src/pages/LoginPage.tsx`:
```tsx
export function LoginPage() { return <div>Login</div> }
```

Create `src/pages/DashboardPage.tsx`:
```tsx
export function DashboardPage() { return <div className="p-4">Dashboard</div> }
```

Create `src/pages/SessionsPage.tsx`:
```tsx
export function SessionsPage() { return <div className="p-4">Sessions</div> }
```

Create `src/pages/NewSessionPage.tsx`:
```tsx
export function NewSessionPage() { return <div className="p-4">New Session</div> }
```

Create `src/pages/SessionDetailPage.tsx`:
```tsx
export function SessionDetailPage() { return <div className="p-4">Session Detail</div> }
```

Create `src/pages/EditSessionPage.tsx`:
```tsx
export function EditSessionPage() { return <div className="p-4">Edit Session</div> }
```

- [ ] **Step 6: Verify the app compiles and routes work**

```powershell
npm run dev
```

Open the app. You should see "Dashboard" text. Navigate to `/login` — should show "Login". The bottom nav should appear on all protected routes.

- [ ] **Step 7: Commit**

```powershell
git add src/
git commit -m "feat: add auth provider, routing, and app shell"
```

---

## Task 5: Login Page

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Implement LoginPage**

Replace `src/pages/LoginPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

type Tab = 'login' | 'register'

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/dashboard')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('Account created! Check your email to confirm, then log in.')
        setTab('login')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-8 text-indigo-600">GetStrong</h1>

        <div className="flex rounded-xl overflow-hidden border mb-6">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {t === 'login' ? 'Log In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Please wait...' : tab === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test the login page manually**

Open `/login`. Try registering with a test email. Check that toast messages appear. Try logging in — should redirect to `/dashboard`.

- [ ] **Step 3: Commit**

```powershell
git add src/pages/LoginPage.tsx
git commit -m "feat: implement login and register page"
```

---

## Task 6: Grade Utilities + Unit Tests

**Files:**
- Create: `src/utils/grades.ts`
- Create: `src/utils/__tests__/grades.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/utils/__tests__/grades.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  vScaleToFont,
  fontToVScale,
  normalizeToFont,
  fontGradeToIndex,
  FONT_GRADES_ORDERED,
  V_GRADES,
} from '../grades'
import type { GradeMapping } from '../../types'

const MAPPINGS: GradeMapping[] = [
  { v_scale: 'V0', font_equivalent: '4' },
  { v_scale: 'V5', font_equivalent: '6C+' },
  { v_scale: 'V6', font_equivalent: '7A' },
  { v_scale: 'V10', font_equivalent: '7C+' },
]

describe('vScaleToFont', () => {
  it('converts a known V grade to Font', () => {
    expect(vScaleToFont('V6', MAPPINGS)).toBe('7A')
  })
  it('returns null for an unknown grade', () => {
    expect(vScaleToFont('V99', MAPPINGS)).toBeNull()
  })
})

describe('fontToVScale', () => {
  it('converts a known Font grade to V scale', () => {
    expect(fontToVScale('7A', MAPPINGS)).toBe('V6')
  })
  it('returns null for an unknown grade', () => {
    expect(fontToVScale('9C', MAPPINGS)).toBeNull()
  })
})

describe('normalizeToFont', () => {
  it('returns the grade as-is for font system', () => {
    expect(normalizeToFont('font', '7A', MAPPINGS)).toBe('7A')
  })
  it('converts v_scale to font equivalent', () => {
    expect(normalizeToFont('v_scale', 'V6', MAPPINGS)).toBe('7A')
  })
  it('returns null for color system', () => {
    expect(normalizeToFont('color', null, MAPPINGS)).toBeNull()
  })
  it('returns null when grade_value is null', () => {
    expect(normalizeToFont('v_scale', null, MAPPINGS)).toBeNull()
  })
})

describe('fontGradeToIndex', () => {
  it('returns the correct index for a known grade', () => {
    const idx = FONT_GRADES_ORDERED.indexOf('7A')
    expect(fontGradeToIndex('7A')).toBe(idx)
  })
  it('returns -1 for an unknown grade', () => {
    expect(fontGradeToIndex('99Z')).toBe(-1)
  })
})

describe('V_GRADES', () => {
  it('starts with VB and ends with V17', () => {
    expect(V_GRADES[0]).toBe('VB')
    expect(V_GRADES[V_GRADES.length - 1]).toBe('V17')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx vitest run src/utils/__tests__/grades.test.ts
```

Expected: FAIL — "Cannot find module '../grades'"

- [ ] **Step 3: Implement grades.ts**

Create `src/utils/grades.ts`:

```typescript
import type { GradeMapping, GradeSystem } from '../types'

export const FONT_GRADES_ORDERED = [
  '3', '4', '5', '5+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A',
]

export const V_GRADES = [
  'VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8',
  'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
]

export function vScaleToFont(vGrade: string, mappings: GradeMapping[]): string | null {
  return mappings.find(m => m.v_scale === vGrade)?.font_equivalent ?? null
}

export function fontToVScale(fontGrade: string, mappings: GradeMapping[]): string | null {
  return mappings.find(m => m.font_equivalent === fontGrade)?.v_scale ?? null
}

export function normalizeToFont(
  gradeSystem: GradeSystem,
  gradeValue: string | null,
  mappings: GradeMapping[],
): string | null {
  if (gradeSystem === 'color' || gradeValue === null) return null
  if (gradeSystem === 'font') return gradeValue
  return vScaleToFont(gradeValue, mappings)
}

export function fontGradeToIndex(grade: string): number {
  return FONT_GRADES_ORDERED.indexOf(grade)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx vitest run src/utils/__tests__/grades.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/utils/
git commit -m "feat: add grade normalization utilities with tests"
```

---

## Task 7: Stats Utilities + Unit Tests

**Files:**
- Create: `src/utils/stats.ts`
- Create: `src/utils/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/utils/__tests__/stats.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { totalSessions, totalProblems, totalSends, sendRate } from '../stats'
import type { Session, Problem } from '../../types'

const SESSIONS: Session[] = [
  { id: 's1', user_id: 'u1', date: '2026-05-20', location: 'Gym', duration_minutes: 90, notes: null, created_at: '' },
  { id: 's2', user_id: 'u1', date: '2026-05-22', location: 'Kilter', duration_minutes: 60, notes: null, created_at: '' },
]

const PROBLEMS: Problem[] = [
  { id: 'p1', session_id: 's1', user_id: 'u1', grade_system: 'font', grade_value: '7A', color: null, attempts: 3, sent: true, notes: null, created_at: '' },
  { id: 'p2', session_id: 's1', user_id: 'u1', grade_system: 'v_scale', grade_value: 'V5', color: null, attempts: 1, sent: false, notes: null, created_at: '' },
  { id: 'p3', session_id: 's2', user_id: 'u1', grade_system: 'font', grade_value: '6B+', color: null, attempts: 2, sent: true, notes: null, created_at: '' },
]

describe('totalSessions', () => {
  it('returns session count', () => {
    expect(totalSessions(SESSIONS)).toBe(2)
  })
  it('returns 0 for empty array', () => {
    expect(totalSessions([])).toBe(0)
  })
})

describe('totalProblems', () => {
  it('returns problem count', () => {
    expect(totalProblems(PROBLEMS)).toBe(3)
  })
})

describe('totalSends', () => {
  it('counts only sent problems', () => {
    expect(totalSends(PROBLEMS)).toBe(2)
  })
  it('returns 0 when nothing sent', () => {
    const unsent = PROBLEMS.map(p => ({ ...p, sent: false }))
    expect(totalSends(unsent)).toBe(0)
  })
})

describe('sendRate', () => {
  it('returns send rate as integer percentage', () => {
    expect(sendRate(PROBLEMS)).toBe(67)
  })
  it('returns 0 when no problems', () => {
    expect(sendRate([])).toBe(0)
  })
  it('returns 100 when all sent', () => {
    const allSent = PROBLEMS.map(p => ({ ...p, sent: true }))
    expect(sendRate(allSent)).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx vitest run src/utils/__tests__/stats.test.ts
```

Expected: FAIL — "Cannot find module '../stats'"

- [ ] **Step 3: Implement stats.ts**

Create `src/utils/stats.ts`:

```typescript
import { subDays, startOfWeek, format, eachWeekOfInterval } from 'date-fns'
import type { Session, Problem, GradeMapping } from '../types'
import { normalizeToFont, fontGradeToIndex } from './grades'

export function totalSessions(sessions: Session[]): number {
  return sessions.length
}

export function totalProblems(problems: Problem[]): number {
  return problems.length
}

export function totalSends(problems: Problem[]): number {
  return problems.filter(p => p.sent).length
}

export function sendRate(problems: Problem[]): number {
  if (problems.length === 0) return 0
  return Math.round((totalSends(problems) / problems.length) * 100)
}

export interface WeekBucket {
  week: string
  count: number
}

export function sessionsByWeek(sessions: Session[], days = 90): WeekBucket[] {
  const now = new Date()
  const cutoff = subDays(now, days)
  const recent = sessions.filter(s => new Date(s.date) >= cutoff)

  const weekStarts = eachWeekOfInterval({ start: cutoff, end: now }, { weekStartsOn: 1 })

  const weekMap = new Map<string, number>()
  for (const session of recent) {
    const key = format(startOfWeek(new Date(session.date), { weekStartsOn: 1 }), 'MMM d')
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1)
  }

  return weekStarts.map(ws => ({
    week: format(ws, 'MMM d'),
    count: weekMap.get(format(ws, 'MMM d')) ?? 0,
  }))
}

export interface GradeDataPoint {
  date: string
  fontGrade: string
  fontIndex: number
  vGrade: string | null
}

export function hardestSentPerSession(
  sessions: Session[],
  problems: Problem[],
  mappings: GradeMapping[],
  days = 90,
): GradeDataPoint[] {
  const now = new Date()
  const cutoff = subDays(now, days)

  return sessions
    .filter(s => new Date(s.date) >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .flatMap(session => {
      const fontGrades = problems
        .filter(p => p.session_id === session.id && p.sent)
        .map(p => normalizeToFont(p.grade_system, p.grade_value, mappings))
        .filter((g): g is string => g !== null)

      if (fontGrades.length === 0) return []

      const hardest = fontGrades.sort((a, b) => fontGradeToIndex(b) - fontGradeToIndex(a))[0]
      return [{
        date: session.date,
        fontGrade: hardest,
        fontIndex: fontGradeToIndex(hardest),
        vGrade: mappings.find(m => m.font_equivalent === hardest)?.v_scale ?? null,
      }]
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx vitest run src/utils/__tests__/stats.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run all tests together**

```powershell
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/stats.ts src/utils/__tests__/stats.test.ts
git commit -m "feat: add dashboard stats utilities with tests"
```

---

## Task 8: Zustand Session Store

**Files:**
- Create: `src/store/sessionStore.ts`

- [ ] **Step 1: Create the session store**

Create `src/store/sessionStore.ts`:

```typescript
import { create } from 'zustand'

interface SessionStore {
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}))
```

- [ ] **Step 2: Commit**

```powershell
git add src/store/
git commit -m "feat: add Zustand session store"
```

---

## Task 9: TanStack Query Hooks

**Files:**
- Create: `src/hooks/useSessions.ts`
- Create: `src/hooks/useProblems.ts`
- Create: `src/hooks/useExercises.ts`
- Create: `src/hooks/useDashboard.ts`

- [ ] **Step 1: Create useSessions.ts**

Create `src/hooks/useSessions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session } from '../types'

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      return data as Session[]
    },
  })
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Session
    },
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Session, 'id' | 'user_id' | 'created_at'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...values, user_id: session!.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Session
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Omit<Session, 'user_id' | 'created_at'>> & { id: string }) => {
      const { data, error } = await supabase
        .from('sessions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Session
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['sessions', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

- [ ] **Step 2: Create useProblems.ts**

Create `src/hooks/useProblems.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Problem } from '../types'

export function useAllProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('problems').select('*')
      if (error) throw error
      return data as Problem[]
    },
  })
}

export function useSessionProblems(sessionId: string) {
  return useQuery({
    queryKey: ['problems', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problems')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Problem[]
    },
  })
}

export function useAddProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Problem, 'id' | 'user_id' | 'created_at'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase
        .from('problems')
        .insert({ ...values, user_id: session!.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Problem
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

- [ ] **Step 3: Create useExercises.ts**

Create `src/hooks/useExercises.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Exercise } from '../types'

export function useSessionExercises(sessionId: string) {
  return useQuery({
    queryKey: ['exercises', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Exercise[]
    },
  })
}

export function useAddExercise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Exercise, 'id' | 'user_id' | 'created_at'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...values, user_id: session!.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Exercise
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercises', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

- [ ] **Step 4: Create useDashboard.ts**

Create `src/hooks/useDashboard.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session, Problem, GradeMapping } from '../types'

interface DashboardData {
  sessions: Session[]
  problems: Problem[]
  gradeMappings: GradeMapping[]
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const [sessionsRes, problemsRes, mappingsRes] = await Promise.all([
        supabase.from('sessions').select('*').order('date', { ascending: false }),
        supabase.from('problems').select('*'),
        supabase.from('grade_mappings').select('*'),
      ])
      if (sessionsRes.error) throw sessionsRes.error
      if (problemsRes.error) throw problemsRes.error
      if (mappingsRes.error) throw mappingsRes.error
      return {
        sessions: sessionsRes.data as Session[],
        problems: problemsRes.data as Problem[],
        gradeMappings: mappingsRes.data as GradeMapping[],
      }
    },
  })
}
```

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/
git commit -m "feat: add TanStack Query hooks for sessions, problems, exercises, and dashboard"
```

---

## Task 10: Shared UI Components

**Files:**
- Create: `src/components/BottomSheet.tsx`
- Create: `src/components/FAB.tsx`
- Create: `src/components/StatCard.tsx`
- Create: `src/components/SessionCard.tsx`

- [ ] **Step 1: Create BottomSheet**

Create `src/components/BottomSheet.tsx`:

```tsx
import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create FAB**

Create `src/components/FAB.tsx`:

```tsx
interface FABProps {
  onClick: () => void
  label?: string
}

export function FAB({ onClick, label = 'Add' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-3xl leading-none"
    >
      +
    </button>
  )
}
```

- [ ] **Step 3: Create StatCard**

Create `src/components/StatCard.tsx`:

```tsx
interface StatCardProps {
  label: string
  value: string | number
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}
```

- [ ] **Step 4: Create SessionCard**

Create `src/components/SessionCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { Session, Problem } from '../types'
import { sendRate } from '../utils/stats'

interface SessionCardProps {
  session: Session
  problems: Problem[]
}

export function SessionCard({ session, problems }: SessionCardProps) {
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="block bg-white border rounded-xl p-4 hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{session.location}</p>
          <p className="text-sm text-gray-500">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-sm text-gray-400">{session.duration_minutes} min</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">{problems.length} problem{problems.length !== 1 ? 's' : ''}</p>
          {problems.length > 0 && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
              {sendRate(problems)}% sent
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 5: Commit**

```powershell
git add src/components/BottomSheet.tsx src/components/FAB.tsx src/components/StatCard.tsx src/components/SessionCard.tsx
git commit -m "feat: add shared UI components (BottomSheet, FAB, StatCard, SessionCard)"
```

---

## Task 11: Problem Form and Exercise Form

**Files:**
- Create: `src/components/ProblemForm.tsx`
- Create: `src/components/ExerciseForm.tsx`

- [ ] **Step 1: Create ProblemForm**

Create `src/components/ProblemForm.tsx`:

```tsx
import { useForm } from 'react-hook-form'
import type { Problem, GradeSystem } from '../types'
import { V_GRADES, FONT_GRADES_ORDERED } from '../utils/grades'

type FormValues = {
  grade_system: GradeSystem
  grade_value: string
  color: string
  attempts: number
  sent: boolean
  notes: string
}

interface ProblemFormProps {
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}

export function ProblemForm({ onSubmit, isSubmitting }: ProblemFormProps) {
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      grade_system: 'font',
      grade_value: '',
      color: '',
      attempts: 1,
      sent: false,
      notes: '',
    },
  })

  const gradeSystem = watch('grade_system')
  const attempts = watch('attempts')

  const submit = (values: FormValues) => {
    onSubmit({
      grade_system: values.grade_system,
      grade_value: values.grade_value || null,
      color: values.color || null,
      attempts: values.attempts,
      sent: values.sent,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Grade System</label>
        <div className="flex rounded-lg overflow-hidden border">
          {(['v_scale', 'font', 'color'] as const).map(system => (
            <button
              key={system}
              type="button"
              onClick={() => { setValue('grade_system', system); setValue('grade_value', '') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                gradeSystem === system ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {system === 'v_scale' ? 'V-Scale' : system === 'font' ? 'Font' : 'Color'}
            </button>
          ))}
        </div>
      </div>

      {gradeSystem !== 'color' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
          <select
            {...register('grade_value')}
            className="w-full border rounded-lg px-3 py-2.5"
          >
            <option value="">Select grade</option>
            {(gradeSystem === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED).map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {gradeSystem === 'color' ? 'Color' : 'Gym Color (optional)'}
        </label>
        <input
          {...register('color')}
          type="text"
          placeholder="e.g. Red, Blue, Yellow"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Attempts</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setValue('attempts', Math.max(1, attempts - 1))}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            −
          </button>
          <span className="text-xl font-semibold w-8 text-center">{attempts}</span>
          <button
            type="button"
            onClick={() => setValue('attempts', attempts + 1)}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input {...register('sent')} id="sent" type="checkbox" className="w-5 h-5 accent-indigo-600" />
        <label htmlFor="sent" className="text-sm font-medium text-gray-700">Sent (completed)</label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Any notes..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Add Problem'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create ExerciseForm**

Create `src/components/ExerciseForm.tsx`:

```tsx
import { useForm } from 'react-hook-form'
import type { Exercise } from '../types'

type FormValues = {
  name: string
  type: 'reps' | 'time'
  sets: number
  reps: number
  duration_seconds: number
  notes: string
}

interface ExerciseFormProps {
  onSubmit: (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}

export function ExerciseForm({ onSubmit, isSubmitting }: ExerciseFormProps) {
  const { register, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      name: '',
      type: 'reps',
      sets: 3,
      reps: 10,
      duration_seconds: 30,
      notes: '',
    },
  })

  const exerciseType = watch('type')

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      type: values.type,
      sets: values.sets || null,
      reps: values.type === 'reps' ? values.reps : null,
      duration_seconds: values.type === 'time' ? values.duration_seconds : null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Exercise Name</label>
        <input
          {...register('name', { required: true })}
          type="text"
          placeholder="e.g. Hangboard — 20mm edge"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <div className="flex rounded-lg overflow-hidden border">
          {(['reps', 'time'] as const).map(t => (
            <label
              key={t}
              className={`flex-1 py-2 text-sm font-medium text-center cursor-pointer transition-colors ${
                exerciseType === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              <input {...register('type')} type="radio" value={t} className="sr-only" />
              {t === 'reps' ? 'Reps' : 'Time'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sets</label>
        <input
          {...register('sets', { valueAsNumber: true })}
          type="number"
          min="1"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      {exerciseType === 'reps' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reps per Set</label>
          <input
            {...register('reps', { valueAsNumber: true })}
            type="number"
            min="1"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration per Set (seconds)</label>
          <input
            {...register('duration_seconds', { valueAsNumber: true })}
            type="number"
            min="1"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Add Exercise'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/components/ProblemForm.tsx src/components/ExerciseForm.tsx
git commit -m "feat: add ProblemForm and ExerciseForm components"
```

---

## Task 12: Sessions Pages

**Files:**
- Modify: `src/pages/SessionsPage.tsx`
- Modify: `src/pages/NewSessionPage.tsx`
- Modify: `src/pages/EditSessionPage.tsx`

- [ ] **Step 1: Implement SessionsPage**

Replace `src/pages/SessionsPage.tsx`:

```tsx
import { useSessions } from '../hooks/useSessions'
import { useAllProblems } from '../hooks/useProblems'
import { SessionCard } from '../components/SessionCard'

export function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessions()
  const { data: problems = [] } = useAllProblems()

  if (isLoading) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-bold">Sessions</h1>
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          problems={problems.filter(p => p.session_id === session.id)}
        />
      ))}
      {sessions.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          No sessions yet. Tap Log to start your first session.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement NewSessionPage**

Replace `src/pages/NewSessionPage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useCreateSession } from '../hooks/useSessions'

type FormValues = {
  date: string
  location: string
  duration_minutes: string
  notes: string
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const createSession = useCreateSession()
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      location: '',
      duration_minutes: '',
      notes: '',
    },
  })

  const onSubmit = (values: FormValues) => {
    createSession.mutate(
      {
        date: values.date,
        location: values.location,
        duration_minutes: values.duration_minutes ? parseInt(values.duration_minutes) : null,
        notes: values.notes || null,
      },
      {
        onSuccess: (session) => navigate(`/sessions/${session.id}`),
        onError: () => toast.error('Failed to create session'),
      },
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">New Session</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            {...register('date', { required: true })}
            type="date"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            {...register('location', { required: true })}
            type="text"
            placeholder="Gym name, Kilter Board, crag..."
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes, optional)</label>
          <input
            {...register('duration_minutes')}
            type="number"
            min="1"
            placeholder="90"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <button
          type="submit"
          disabled={createSession.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {createSession.isPending ? 'Creating...' : 'Start Session'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Implement EditSessionPage**

Replace `src/pages/EditSessionPage.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useSession, useUpdateSession } from '../hooks/useSessions'

type FormValues = {
  date: string
  location: string
  duration_minutes: string
  notes: string
}

export function EditSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(id!)
  const updateSession = useUpdateSession()
  const { register, handleSubmit, reset } = useForm<FormValues>()

  useEffect(() => {
    if (session) {
      reset({
        date: session.date,
        location: session.location,
        duration_minutes: session.duration_minutes?.toString() ?? '',
        notes: session.notes ?? '',
      })
    }
  }, [session, reset])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const onSubmit = (values: FormValues) => {
    updateSession.mutate(
      {
        id: id!,
        date: values.date,
        location: values.location,
        duration_minutes: values.duration_minutes ? parseInt(values.duration_minutes) : null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => navigate(`/sessions/${id}`),
        onError: () => toast.error('Failed to update session'),
      },
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Edit Session</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            {...register('date', { required: true })}
            type="date"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            {...register('location', { required: true })}
            type="text"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes, optional)</label>
          <input
            {...register('duration_minutes')}
            type="number"
            min="1"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <button
          type="submit"
          disabled={updateSession.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {updateSession.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Test sessions flow manually**

- Log in → tap Log → fill in a session → tap Start Session
- Should redirect to the session detail stub page
- Navigate to /sessions → should see the session card
- Tap the card → session detail
- Navigate to /sessions/:id/edit → should see the edit form pre-filled

- [ ] **Step 5: Commit**

```powershell
git add src/pages/SessionsPage.tsx src/pages/NewSessionPage.tsx src/pages/EditSessionPage.tsx
git commit -m "feat: implement sessions list, new session, and edit session pages"
```

---

## Task 13: Session Detail Page

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`

- [ ] **Step 1: Implement SessionDetailPage**

Replace `src/pages/SessionDetailPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../hooks/useSessions'
import { useSessionProblems, useAddProblem } from '../hooks/useProblems'
import { useSessionExercises, useAddExercise } from '../hooks/useExercises'
import { useSessionStore } from '../store/sessionStore'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { ProblemForm } from '../components/ProblemForm'
import { ExerciseForm } from '../components/ExerciseForm'
import type { Problem, Exercise } from '../types'

type SheetTab = 'problem' | 'exercise'

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('problem')

  const { data: session, isLoading } = useSession(id!)
  const { data: problems = [] } = useSessionProblems(id!)
  const { data: exercises = [] } = useSessionExercises(id!)
  const addProblem = useAddProblem()
  const addExercise = useAddExercise()
  const setActiveSessionId = useSessionStore(s => s.setActiveSessionId)

  useEffect(() => {
    setActiveSessionId(id ?? null)
    return () => setActiveSessionId(null)
  }, [id, setActiveSessionId])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const handleAddProblem = (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at'>) => {
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: () => { setSheetOpen(false); toast.success('Problem added') },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  const handleAddExercise = (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => {
    addExercise.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: () => { setSheetOpen(false); toast.success('Exercise added') },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  return (
    <div className="p-4 pb-32 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{session.location}</h1>
          <p className="text-gray-500 text-sm">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-gray-400 text-sm">{session.duration_minutes} min</p>
          )}
          {session.notes && <p className="text-gray-500 text-sm mt-1">{session.notes}</p>}
        </div>
        <Link to={`/sessions/${id}/edit`} className="text-sm text-indigo-600 font-medium">
          Edit
        </Link>
      </div>

      {problems.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Problems ({problems.length})</h2>
          <div className="space-y-2">
            {problems.map(problem => (
              <div key={problem.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {problem.grade_value ?? '—'}
                    {problem.grade_value && problem.color && (
                      <span className="text-gray-400 text-sm font-normal ml-1">· {problem.color}</span>
                    )}
                    {!problem.grade_value && problem.color && (
                      <span>{problem.color}</span>
                    )}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    problem.sent ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {problem.sent ? 'Sent' : 'Project'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">
                  {problem.attempts} attempt{problem.attempts !== 1 ? 's' : ''}
                </p>
                {problem.notes && <p className="text-gray-500 text-sm mt-0.5">{problem.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Exercises ({exercises.length})</h2>
          <div className="space-y-2">
            {exercises.map(exercise => (
              <div key={exercise.id} className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium">{exercise.name}</p>
                <p className="text-gray-400 text-sm">
                  {exercise.sets != null && `${exercise.sets} sets × `}
                  {exercise.type === 'reps'
                    ? `${exercise.reps} reps`
                    : `${exercise.duration_seconds}s`}
                </p>
                {exercise.notes && <p className="text-gray-500 text-sm mt-0.5">{exercise.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {problems.length === 0 && exercises.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          Nothing logged yet. Tap + to add a problem or exercise.
        </p>
      )}

      <FAB onClick={() => setSheetOpen(true)} label="Add problem or exercise" />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add to Session"
      >
        <div className="flex rounded-lg overflow-hidden border mb-4">
          {(['problem', 'exercise'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSheetTab(tab)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                sheetTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {tab === 'problem' ? 'Problem' : 'Exercise'}
            </button>
          ))}
        </div>
        {sheetTab === 'problem' ? (
          <ProblemForm onSubmit={handleAddProblem} isSubmitting={addProblem.isPending} />
        ) : (
          <ExerciseForm onSubmit={handleAddExercise} isSubmitting={addExercise.isPending} />
        )}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 2: Test the session detail page manually**

- Create a session → land on the detail page
- Tap the FAB (+) → bottom sheet opens with Problem / Exercise tabs
- Add a problem: select Font grade, add color, set attempts, toggle sent → save
- Sheet closes, problem appears in the list
- Switch tab to Exercise, add an exercise with type Reps → save
- Exercise appears in the list
- Reload the page — all items should still be there (persisted to Supabase)

- [ ] **Step 3: Commit**

```powershell
git add src/pages/SessionDetailPage.tsx
git commit -m "feat: implement session detail page with problem and exercise logging"
```

---

## Task 14: Dashboard Page

**Files:**
- Create: `src/components/GradeProgressionChart.tsx`
- Create: `src/components/SessionFrequencyChart.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create GradeProgressionChart**

Create `src/components/GradeProgressionChart.tsx`:

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { GradeDataPoint } from '../utils/stats'
import type { GradeMapping } from '../types'
import { FONT_GRADES_ORDERED } from '../utils/grades'

interface Props {
  data: GradeDataPoint[]
  gradeScale: 'font' | 'v_scale'
  mappings: GradeMapping[]
}

export function GradeProgressionChart({ data, gradeScale, mappings }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
        No graded sends yet
      </div>
    )
  }

  const formatGrade = (fontIndex: number): string => {
    const grade = FONT_GRADES_ORDERED[fontIndex]
    if (!grade) return String(fontIndex)
    if (gradeScale === 'v_scale') {
      return mappings.find(m => m.font_equivalent === grade)?.v_scale ?? grade
    }
    return grade
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={formatGrade} tick={{ fontSize: 10 }} width={36} />
        <Tooltip
          formatter={(value: unknown) => [formatGrade(value as number), 'Grade']}
          labelStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="fontIndex"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={{ r: 4, fill: '#4f46e5' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Create SessionFrequencyChart**

Create `src/components/SessionFrequencyChart.tsx`:

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { WeekBucket } from '../utils/stats'

interface Props {
  data: WeekBucket[]
}

export function SessionFrequencyChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
        <Tooltip labelStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill="#4f46e5" name="Sessions" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Implement DashboardPage**

Replace `src/pages/DashboardPage.tsx`:

```tsx
import { useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'
import { StatCard } from '../components/StatCard'
import { SessionCard } from '../components/SessionCard'
import { GradeProgressionChart } from '../components/GradeProgressionChart'
import { SessionFrequencyChart } from '../components/SessionFrequencyChart'
import {
  totalSessions,
  totalProblems,
  totalSends,
  sendRate,
  hardestSentPerSession,
  sessionsByWeek,
} from '../utils/stats'

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard()
  const [gradeScale, setGradeScale] = useState<'font' | 'v_scale'>('font')

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load dashboard.</div>
  if (!data) return null

  const { sessions, problems, gradeMappings } = data
  const gradeData = hardestSentPerSession(sessions, problems, gradeMappings)
  const weekData = sessionsByWeek(sessions)
  const recentSessions = sessions.slice(0, 5)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Sessions" value={totalSessions(sessions)} />
        <StatCard label="Problems" value={totalProblems(problems)} />
        <StatCard label="Sends" value={totalSends(problems)} />
        <StatCard label="Send Rate" value={`${sendRate(problems)}%`} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Grade Progression</h2>
          <div className="flex rounded-lg overflow-hidden border text-xs">
            <button
              onClick={() => setGradeScale('font')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'font' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              Font
            </button>
            <button
              onClick={() => setGradeScale('v_scale')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'v_scale' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              V-Scale
            </button>
          </div>
        </div>
        <GradeProgressionChart
          data={gradeData}
          gradeScale={gradeScale}
          mappings={gradeMappings}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Sessions per Week</h2>
        <SessionFrequencyChart data={weekData} />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Recent Sessions</h2>
        <div className="space-y-2">
          {recentSessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              problems={problems.filter(p => p.session_id === session.id)}
            />
          ))}
          {recentSessions.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-4">
              No sessions yet. Tap Log to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Test the dashboard manually**

- Log in → navigate to Dashboard
- Create 2-3 sessions with problems of different grades
- Return to Dashboard — stat cards should update
- Grade Progression chart should show plotted points for sessions with sent problems
- Toggle Font / V-Scale — labels on Y-axis and tooltip should switch
- Session Frequency chart should show bar(s) in the current week

- [ ] **Step 5: Run all tests**

```powershell
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Build to verify no TypeScript errors**

```powershell
npm run build
```

Expected: Build completes with no errors. Output in `dist/`.

- [ ] **Step 7: Commit**

```powershell
git add src/components/GradeProgressionChart.tsx src/components/SessionFrequencyChart.tsx src/pages/DashboardPage.tsx
git commit -m "feat: implement dashboard with charts and stat cards"
```

---

## Phase 1 Complete

At this point the app is fully functional:

- Users can register and log in
- Sessions can be created, edited, and browsed
- Problems (V-scale, Font, or color) and exercises (reps or time) can be logged within each session
- The dashboard shows total stats and progress charts with a V/Font scale toggle

**To deploy to Vercel:**

```powershell
npm install -g vercel
vercel
```

Follow the prompts. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel project settings.

**To access on mobile:** Open the Vercel URL in Safari (iOS) or Chrome (Android). Add to home screen for a near-native experience.
