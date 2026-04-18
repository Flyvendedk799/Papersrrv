# User Flows & Features

## Overview

This document details all user flows and features available in the DinGaming platform, including authentication, purchasing, Customer Club, and support.

---

## 1. Authentication Flows

### 1.1 User Registration (Signup)

**Entry Point**: `/signup`

#### Flow Steps

1. **Navigate to Signup Page**
   - User clicks "Sign Up" from navigation or login page
   - Lands on `/signup`

2. **Fill Registration Form**
   - Username (3-20 characters, unique)
   - Email address (valid format)
   - Password (minimum 8 characters)
   - Confirm password (must match)

3. **Submit Form**
   - Client-side validation
   - POST request to Supabase Auth

4. **Account Creation**
   - Account created in Supabase
   - User profile created
   - **500 Shards Welcome Bonus** credited

5. **Confirmation & Redirect**
   - Success message displayed
   - Redirect to `/login` or Customer Club dashboard

#### Benefits Highlighted
- **500 Shards welcome bonus**
- 1% cashback on all purchases
- Daily login bonuses
- Exclusive Customer Club access

---

### 1.2 User Login

**Entry Points**:
- `/login` (direct)
- `/club` (redirect if not authenticated)
- Any protected route

#### Flow Steps

1. **Navigate to Login Page**
   - User visits `/login` or protected route
   - Login form displayed with Customer Club benefits

![Login Page](../screenshots/auth/02-login-page.png)

2. **Enter Credentials**
   - Email address
   - Password

![Form Filled](../screenshots/auth/03-form-filled.png)

3. **Optional: Password Reset**
   - Click "Forgot Password" link
   - Redirect to `/forgot-password`

4. **Submit Login**
   - POST to Supabase Auth
   - Credentials validated

5. **Session Created**
   - Access token and refresh token issued
   - Stored in localStorage/cookies
   - User object available

6. **Daily Login Bonus Check**
   - Check if bonus claimed today
   - If not, credit 10-50 Shards based on login streak
   - Update `last_login_bonus` timestamp

7. **Redirect**
   - Redirect to `/club` or previous protected page
   - Dashboard loads with user data

#### Login Features
- Remember me functionality
- Password visibility toggle
- Error messaging for invalid credentials
- Rate limiting (5 attempts per hour)

---

### 1.3 Password Reset

**Entry Point**: `/forgot-password`

#### Flow Steps

1. **Navigate to Password Reset**
   - Click "Forgot Password" on login page
   - Or direct navigation to `/forgot-password`

2. **Enter Email**
   - User inputs registered email address
   - Submit form

3. **Email Sent**
   - Supabase sends password reset email
   - Contains secure reset link (24-hour expiry)
   - Success message displayed

4. **Click Reset Link**
   - User opens email
   - Clicks reset link
   - Redirected to password reset page with token

5. **Set New Password**
   - Enter new password
   - Confirm new password
   - Submit

6. **Password Updated**
   - Password updated in Supabase
   - Success message
   - Redirect to login page

---

## 2. Shopping & Purchase Flow

### 2.1 Product Discovery

**Entry Points**: Multiple discovery paths

#### A. Homepage (`/`)
- Hero section with featured deals
- Platform categories (Steam, PlayStation, Xbox, Nintendo)
- Daily deals section
- Testimonials and trust signals

#### B. Deals Page (`/deals`)
- Flash deals with countdown timers
- Up to 70% discounts
- Sorted by discount percentage
- Limited-time offers highlighted

#### C. Search (`/search`)
- Keyword search across product catalog
- Real-time search results
- Filters by platform, price, genre

#### D. Categories (`/categories`)
- Browse by platform
- Genre filters
- Sort by price, popularity, release date

---

### 2.2 Product Detail Page

**Route**: `/product/:slug`

#### Page Elements

1. **Product Information**
   - Game title
   - Platform badge (Steam, PlayStation, etc.)
   - Region information (Global, EU, etc.)
   - Publisher and release date

2. **Pricing**
   - Original price (if on sale)
   - Current price
   - Discount percentage badge
   - Deal expiry countdown (if applicable)

3. **Product Description**
   - Game overview
   - Key features
   - System requirements (for PC)

4. **Purchase Section**
   - "Add to Cart" button
   - "Buy Now" button (direct checkout)
   - Stock status indicator
   - Delivery time (within 30 seconds)

5. **Trust Signals**
   - Customer rating (1-5 stars)
   - Number of reviews
   - Instant delivery badge
   - Secure payment icons

![Product Detail](../screenshots/auth/01-initial-page.png)

---

### 2.3 Checkout Flow

**Entry Point**: `/checkout`

#### Flow Steps

1. **Cart Review**
   - List of products in cart
   - Quantity adjustment
   - Remove items
   - Subtotal calculation

2. **Apply Shards Discount** (if logged in)
   - Display current Shards balance
   - Option to use Shards (1 Shard = 1 DKK discount)
   - Updated total after discount

3. **Email Confirmation**
   - Enter email for game key delivery
   - Pre-filled if logged in

4. **Payment Method Selection**
   - **MobilePay** (recommended for Danish users)
   - **Card** (Visa, Mastercard)
   - **PayPal**

5. **Payment Processing**
   - Redirect to payment provider
   - Complete payment
   - Return to DinGaming

6. **Order Confirmation**
   - Order number displayed
   - Confirmation email sent
   - Game key delivered within 30 seconds

7. **Receive Game Key**
   - Email arrives with:
     - Order details
     - Game key(s)
     - Activation instructions
     - Support link

---

## 3. Customer Club Features

### 3.1 Club Dashboard (`/club`)

**Requires**: Authentication

#### Dashboard Components

1. **Welcome Banner**
   - Personalized greeting
   - Current Shards balance (prominent display)
   - Loyalty tier badge

2. **Quick Stats**
   - Total Shards earned
   - Total purchases
   - Member since date
   - Current login streak

3. **Available Activities**
   - **Club Games** → `/club/games`
   - **Club Cases** → `/club/cases`
   - **Club Casino** → `/club/casino`
   - **Rewards** → `/club/rewards`
   - **History** → `/club/history`

4. **Daily Login Bonus**
   - Claim button (if not claimed today)
   - Streak counter
   - Next bonus amount preview

---

### 3.2 Shards Rewards System

#### Earning Shards

| Activity | Shards Earned |
|----------|---------------|
| Sign up | 500 Shards |
| Daily login | 10-50 Shards (based on streak) |
| Purchase cashback | 1% of order value |
| Casino wins | Variable |
| Special promotions | Variable |

#### Spending Shards

- **Discounts**: 1 Shard = 1 DKK discount on purchases
- **Casino games**: Bet Shards to win more
- **Exclusive deals**: Shards-only promotions

#### Loyalty Tiers

| Tier | Shards Required | Benefits |
|------|-----------------|----------|
| Bronze | 0-999 | Standard benefits |
| Silver | 1,000-4,999 | 1.2x daily bonus |
| Gold | 5,000-9,999 | 1.5x daily bonus, priority support |
| Platinum | 10,000+ | 2x daily bonus, exclusive deals |

---

### 3.3 Club Casino (`/club/casino`)

**Requires**: Authentication

#### Available Games

##### A. Blackjack (`/club/casino/blackjack`)
- Classic blackjack rules
- Bet Shards, win up to 2x payout
- Dealer stands on 17
- Split and double down available

##### B. Roulette (`/club/casino/roulette`)
- European roulette (single zero)
- Bet on red/black, odd/even, numbers
- Payouts from 1:1 to 35:1

##### C. Dice (`/club/casino/dice`)
- Roll two dice
- Predict over/under 7
- Payout: 2x on win

##### D. Hi-Lo (`/club/casino/hilo`)
- Guess if next card is higher or lower
- Streak-based multipliers
- Cash out anytime

##### E. Lines (`/club/casino/lines`)
- Match patterns on paylines
- Slot-style gameplay
- Progressive multipliers

##### F. Mines (`/club/casino/mines`)
- Grid-based minesweeper
- Reveal safe tiles
- Cash out before hitting a mine
- Higher risk = higher reward

#### Casino Flow

1. **Select Game**
   - Choose from casino hub
   - Load game interface

2. **Set Bet Amount**
   - Use slider or input field
   - Minimum: 1 Shard
   - Maximum: User's balance

3. **Play Game**
   - Make choices (hit/stand, bet on red, etc.)
   - Game logic executes
   - Result displayed

4. **Win/Loss**
   - Shards updated immediately
   - Result recorded in `casino_games` table
   - Statistics updated

5. **Continue or Exit**
   - Play again
   - Change game
   - Return to club

---

### 3.4 Transaction History (`/club/history`)

**Requires**: Authentication

#### Displayed Information

1. **Purchase History**
   - All orders placed
   - Order number, date, total
   - Products purchased
   - Payment method
   - Game keys (re-download)

2. **Shards Transactions**
   - Date and time
   - Transaction type (bonus, cashback, casino, etc.)
   - Amount (+ or -)
   - Balance after transaction
   - Description

3. **Filters**
   - Date range
   - Transaction type
   - Sort by date/amount

---

## 4. Support Flow

### 4.1 Support Center (`/support`)

#### Available Resources

1. **FAQ Section**
   - How to activate game keys
   - Refund policy
   - Delivery information
   - Payment methods
   - Account management

2. **Activation Guides**
   - Platform-specific instructions
   - Steam activation
   - PlayStation redemption
   - Xbox code entry
   - Nintendo eShop

3. **Refund Policy**
   - Conditions for refunds
   - Unused key policy
   - Refund processing time

4. **Contact Form**
   - Name
   - Email
   - Subject
   - Message
   - Optional: Order number
   - Submit to support@dingaming.dk

#### Support SLA
- **Response Time**: Within 24 hours
- **Resolution Target**: 48-72 hours
- **Contact**: support@dingaming.dk

---

## 5. Newsletter Signup

**Location**: Footer on all pages

#### Flow

1. **Enter Email**
   - Input field in footer
   - "Get 10% off your first order"

2. **Submit**
   - Email added to newsletter list
   - Discount code sent via email

3. **First Purchase Discount**
   - Apply code at checkout
   - 10% off order total

---

## 6. Mobile/PWA Features

### Progressive Web App Capabilities

1. **Add to Home Screen**
   - Install as app on mobile
   - Full-screen experience
   - App icon on home screen

2. **Offline Support**
   - Cached pages for offline viewing
   - Product browsing (cached)
   - Error messages when offline

3. **Push Notifications** (potential)
   - Deal alerts
   - Order updates
   - Daily login reminders

---

## 7. User Journey Map

### New User Journey

```
1. Discover → 2. Browse → 3. Add to Cart → 4. Checkout → 5. Receive Key
                                              ↓
                                         6. Sign Up for Benefits
                                              ↓
                                         7. Earn Shards
                                              ↓
                                         8. Use Shards for Discount
                                              ↓
                                         9. Engage with Club
```

### Returning User Journey

```
1. Login → 2. Claim Daily Bonus → 3. Browse Deals → 4. Purchase
              ↓                                        ↓
         5. Play Casino Games                    6. Earn Cashback
              ↓                                        ↓
         7. Win Shards                           8. Use for Discount
              ↓                                        ↓
         └──────────────────────────────────────────┘
                    Loyalty Loop
```

---

## 8. Navigation Structure

### Header Navigation

```
┌───────────────────────────────────────────────────┐
│ [Logo: DinGaming] [Search] [Login] [Cart]        │
└───────────────────────────────────────────────────┘
```

### Footer Navigation

```
┌───────────────────────────────────────────────────┐
│ Newsletter Signup                                 │
│ [CTA: Opret Gratis Konto]                        │
│ Trust: 50,000+ customers | 4.9/5 Trustpilot      │
└───────────────────────────────────────────────────┘
```

### Customer Club Menu

```
Club Dashboard
├── Games
├── Cases
├── Casino
│   ├── Blackjack
│   ├── Roulette
│   ├── Dice
│   ├── Hi-Lo
│   ├── Lines
│   └── Mines
├── History
└── Rewards
```

---

## 9. Error Handling & Edge Cases

### Authentication Errors
- Invalid credentials → Show error, suggest password reset
- Account locked → Display lockout message with time remaining
- Email not verified → Resend verification email

### Purchase Errors
- Out of stock → Notify user, suggest alternatives
- Payment failed → Retry or choose different method
- Cart empty at checkout → Redirect to homepage

### Club Errors
- Insufficient Shards for casino → Display balance, suggest earning more
- Daily bonus already claimed → Show next available time
- Game error → Refund bet, log error

---

## 10. Conversion Optimization Features

### Trust Signals
- **Trustpilot Rating**: 4.9/5 with 50,000+ customers
- **Instant Delivery**: Within 30 seconds
- **Secure Payment**: SSL encryption, PCI DSS compliant
- **Money-Back Guarantee**: Refund policy clearly stated

### Urgency & Scarcity
- Countdown timers on deals
- "Limited stock" indicators
- "Flash deal" badges
- "Expires in X hours" messaging

### Social Proof
- Customer testimonials on homepage
- "X people bought this today"
- Review count on products
- Platform badges (Steam, PlayStation verified)

---

## Summary

DinGaming provides a comprehensive gaming marketplace experience with:
- Seamless authentication and user onboarding
- Multi-path product discovery and purchasing
- Engaging loyalty program with gamification
- Responsive support and help resources
- Mobile-optimized PWA experience

All flows are designed to maximize conversion while maintaining user trust and satisfaction.
