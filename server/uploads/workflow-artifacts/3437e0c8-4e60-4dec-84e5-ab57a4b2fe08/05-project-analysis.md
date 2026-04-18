# DinGaming — Project Analysis

> Converted from `analysis-output.json`

## Project Source

https://dingaming.dk/

---

## Project Name

**DinGaming**

---

## Description

Danish digital game keys marketplace. Buy game keys for Steam, PlayStation, Xbox, and Nintendo. Instant delivery via email within 30 seconds. Customer Club loyalty program with Shards.

---

## Tech Stack

### Frontend

| Property | Value |
|----------|-------|
| Framework | React |
| Bundler | Vite |
| Routing | Client-side routing (SPA) |
| Fonts | DM Sans, Playfair Display |
| Language | Danish (da) |

### Backend

| Property | Value |
|----------|-------|
| Database | Supabase |
| Auth | Supabase Auth (email/password) |

### Hosting

| Property | Value |
|----------|-------|
| Static | Standard web hosting |
| Assets | R2 (Cloudflare) for images and media |

### Analytics

| Property | Value |
|----------|-------|
| Provider | Flock |
| Proxy Path | /~api/analytics |

### Platform

| Property | Value |
|----------|-------|
| PWA | true |
| Meta | apple-mobile-web-app-capable, theme-color, mobile-web-app-capable |

### Payment

| Property | Value |
|----------|-------|
| Methods | MobilePay, Card, PayPal |

---

## Sitemap

### Public Routes

| Path | Title | Description |
|------|-------|-------------|
| / | Home | Landing page with hero, deals, testimonials, platform keys |
| /deals | Dagens Tilbud | Daily deals, flash deals, up to 70% discount |
| /categories | Categories | Browse game categories |
| /search | Søg efter spil | Search for games in catalog |
| /support | Support & Hjælp | FAQ, activation guide, refund policy, contact form |
| /checkout | Checkout | Payment flow (redirects to home when cart empty) |

### Auth Routes

| Path | Title | Description |
|------|-------|-------------|
| /login | Log ind | Customer Club login with email and password |
| /signup | Opret konto | Register with username, email, password. 500 Shards welcome bonus |
| /forgot-password | Glemt adgangskode | Password reset via email link |

### Protected Routes

| Path | Title |
|------|-------|
| /club | Customer Club |
| /club/games | Club Games |
| /club/cases | Club Cases |
| /club/casino | Club Casino |
| /club/casino/blackjack | Blackjack |
| /club/casino/roulette | Roulette |
| /club/casino/dice | Dice |
| /club/casino/hilo | Hi-Lo |
| /club/casino/lines | Lines |
| /club/casino/mines | Mines |
| /club/history | Club History |
| /club/rewards | Club Rewards |

### Dynamic Routes

| Path | Title | Description |
|------|-------|-------------|
| /product/:slug | Product detail | Individual game key product page |

---

## Flow List

### 1. Login flow (auth-login)

- **Entry points:** /login, /club
- **Requires auth:** No
- **Steps:**
  1. User visits /login or /club
  2. Enter email and password
  3. Optional: Forgot password → /forgot-password
  4. Submit → Supabase Auth
  5. Redirect to Customer Club or previous page

### 2. Signup flow (auth-signup)

- **Entry points:** /signup
- **Requires auth:** No
- **Steps:**
  1. User visits /signup
  2. Enter username, email, password, confirm password
  3. Submit → Create account
  4. Receive 500 Shards welcome bonus
  5. Redirect to login or dashboard

### 3. Password reset flow (auth-forgot-password)

- **Entry points:** /login, /forgot-password
- **Requires auth:** No
- **Steps:**
  1. User visits /forgot-password
  2. Enter email
  3. Receive reset link via email
  4. Click link → Reset password

### 4. Game purchase flow (purchase-flow)

- **Entry points:** /, /deals, /search, /categories
- **Requires auth:** No
- **Steps:**
  1. Find game: Home, /search, /categories, or /deals
  2. Add to cart
  3. Go to checkout (/checkout)
  4. Pay with MobilePay, card, or PayPal
  5. Receive key via email within 30 seconds

### 5. Customer Club rewards flow (club-rewards)

- **Entry points:** /club
- **Requires auth:** Yes
- **Steps:**
  1. Log in to Customer Club (/club)
  2. Earn Shards (1% cashback on purchases)
  3. Daily login bonuses
  4. Exchange Shards for discounts
  5. Optional: Play casino games

### 6. Support flow (support-flow)

- **Entry points:** /support
- **Requires auth:** No
- **Steps:**
  1. Visit /support
  2. Browse FAQ
  3. Optional: Submit contact form
  4. Support at support@dingaming.dk, response within 24 hours

---

## Navigation Structure

### Header

- Logo: DinGaming → /
- Links: Search (/search), Login (/login), Kurv (Cart) (checkout/cart)

### Footer

- Newsletter: Email signup for 10% first order discount
- CTA: Opret Gratis Konto → /signup
- Stats: 50.000+ customers, 4.9/5 Trustpilot

### Auth Links

- Login: /login
- Signup: /signup
- Forgot Password: /forgot-password

---

## Key Features

- Instant game key delivery (< 30 seconds)
- Steam, PlayStation, Xbox, Nintendo keys
- Customer Club with Shards (loyalty points)
- Daily deals and flash sales
- 14-day money-back guarantee
- 24/7 Danish support
- Trustpilot integration (4.9/5)
- MobilePay, card, PayPal payment
