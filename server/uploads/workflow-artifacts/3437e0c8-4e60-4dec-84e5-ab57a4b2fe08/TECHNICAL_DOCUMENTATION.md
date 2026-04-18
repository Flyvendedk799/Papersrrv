# DinGaming — Technical Documentation

Danmarks hurtigste digitale spilbutik (Denmark's fastest digital game store)

## Architecture

### Frontend Stack
- **Framework**: React Single Page Application (SPA)
- **Build Tool**: Vite (fast module bundler and dev server)
- **Styling**: Tailwind CSS (utility-first CSS framework)
- **UI Components**: Radix UI (headless, accessible component library)
- **Icons**: Lucide React (consistent icon system)
- **State Management**: TanStack Query (React Query) for server state
- **Backend Integration**: Supabase (PostgreSQL + Auth)

The application follows modern React patterns with client-side routing and reactive data fetching. Vite provides fast hot module replacement during development and optimized production builds.

### SPA Architecture Details
- Client-side routing with React Router
- Real-time data synchronization via Supabase
- Component-based UI with Radix primitives
- Responsive design using Tailwind utilities
- Authentication handled through Supabase Auth service

## Routes & Navigation

| Route | Purpose | Description |
|-------|---------|-------------|
| `/` | Home | Browse featured games, new releases, trending titles |
| `/search` | Search | Game discovery with filters and search functionality |
| `/categories` | Categories | Browse games organized by genre/type |
| `/deals` | Deals & Offers | Special promotions and limited-time offers |
| `/club` | Club/Rewards | Member benefits, loyalty program, account management |
| `/support` | Support | Help center, FAQs, customer service |
| `/auth/login` | Authentication | User login form |
| `/auth/register` | Authentication | Account creation |
| `/account` | Profile | User profile and settings |
| `/cart` | Shopping | Shopping cart and checkout |

**Routing Mechanism**: Client-side routing via React Router enables instant navigation without full page reloads, providing a seamless user experience.

## Key User Flows

### Browse & Purchase Flow
1. User lands on homepage or searches for games
2. Browses by category, deals, or trending
3. Selects a game to view details
4. Adds to cart
5. Proceeds to checkout
6. Completes payment

### Authentication Flow
1. User navigates to login/register
2. Enters credentials (username/password or third-party auth)
3. Supabase authenticates and returns session token
4. User is redirected to homepage or their cart
5. Session persists across page navigation

### Club/Rewards Flow
1. Logged-in user accesses Club section
2. Views loyalty points and tier status
3. Browses available rewards
4. Redeems points for discounts or exclusive offers
5. Tracks purchase history and achievements

### Admin Flow
1. Admin user logs in with elevated permissions
2. Accesses admin dashboard
3. Manages game catalog (add, edit, delete games)
4. Monitors orders and customer accounts
5. Configures promotions and deal settings

## Tech Stack Summary

| Category | Technology | Notes |
|----------|------------|-------|
| **Frontend Framework** | React 18+ | Component-based UI |
| **Build & Dev** | Vite | Fast bundling and HMR |
| **Styling** | Tailwind CSS | Utility-first, responsive design |
| **Components** | Radix UI | Unstyled, accessible primitives |
| **Icons** | Lucide React | Consistent icon library |
| **Routing** | React Router | Client-side navigation |
| **Data Fetching** | TanStack Query | Server state management |
| **Authentication** | Supabase Auth | JWT-based, session management |
| **Database** | PostgreSQL | Via Supabase |
| **Backend API** | Supabase REST API | Real-time subscriptions available |
| **Fonts** | DM Sans, Inter | Open-source, modern typefaces |
| **Code Quality** | ESLint, Prettier | Linting and formatting |

## Authentication

### Login Mechanism
- **Provider**: Supabase Authentication
- **Method**: Email/password authentication with optional social login
- **Token Storage**: Session token stored in browser (secure cookie or localStorage)
- **Session Management**: Automatic session restoration on page reload
- **Protected Routes**: Client-side guards ensure unauthenticated users redirect to login

### Supabase Integration
- Real-time PostgreSQL database for user data
- Row-level security (RLS) policies enforce data privacy
- Automatic JWT token handling
- Built-in password hashing and reset flows
- Email verification for new accounts

### User Session Flow
1. User submits credentials on login form
2. Supabase validates and returns `access_token` and `refresh_token`
3. Tokens stored in browser session
4. Authenticated API requests include token in Authorization header
5. Expired tokens automatically refresh via refresh token
6. Logout clears session and redirects to login page

## Performance Optimizations

- **Code Splitting**: Vite automatically chunks code for faster initial load
- **Image Optimization**: Lazy loading and responsive image sizing
- **Caching**: TanStack Query caches API responses to reduce network requests
- **Real-time Updates**: Supabase subscriptions for live inventory and pricing changes

---

**Last Updated**: March 2026
**Project**: DinGaming (https://dingaming.dk)
**Documentation Focus**: Frontend Architecture & User Flows
