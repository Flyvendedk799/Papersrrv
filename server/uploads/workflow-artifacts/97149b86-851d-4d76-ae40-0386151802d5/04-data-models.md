# Data Models & Database Schema

## Overview

DinGaming uses Supabase (PostgreSQL) as the primary database. This document outlines the data models, relationships, and schema design.

---

## Entity Relationship Diagram

```
┌─────────────────┐
│     Users       │
│  (auth.users)   │
└────────┬────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐       1:N        ┌─────────────────┐
│    Profiles     │◄──────────────────│     Orders      │
│                 │                   │                 │
│ - username      │       1:N        │ - total_amount  │
│ - shards_balance│◄──────────────┐  │ - status        │
│ - loyalty_tier  │               │  │ - payment_method│
└────────┬────────┘               │  └────────┬────────┘
         │                        │           │
         │ 1:N                    │           │ 1:N
         ▼                        │           ▼
┌─────────────────┐               │  ┌─────────────────┐
│Shards Transactions│             │  │  Order Items    │
│                 │               │  │                 │
│ - amount        │               │  │ - product_id    │
│ - type          │               │  │ - game_key      │
│ - description   │               │  │ - price         │
└─────────────────┘               │  └────────┬────────┘
                                  │           │
┌─────────────────┐               │           │ N:1
│  Casino Games   │               │           ▼
│                 │               │  ┌─────────────────┐
│ - game_type     │───────────────┘  │    Products     │
│ - bet_amount    │                  │                 │
│ - result        │                  │ - name          │
│ - payout        │                  │ - platform      │
└─────────────────┘                  │ - price         │
                                     │ - discount_price│
                                     └─────────────────┘
```

---

## Core Tables

### 1. Users (auth.users)

Managed by Supabase Auth. Contains authentication credentials.

```sql
CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  encrypted_password VARCHAR(255) NOT NULL,
  email_confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sign_in_at TIMESTAMP WITH TIME ZONE,
  raw_user_meta_data JSONB,
  raw_app_meta_data JSONB
);
```

**User Metadata (JSONB)**
```json
{
  "username": "gamer123",
  "shards_balance": 1250,
  "member_since": "2024-01-15",
  "last_login_bonus": "2024-03-14",
  "loyalty_tier": "silver"
}
```

---

### 2. Profiles

Extended user profile information.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  shards_balance INTEGER DEFAULT 500,
  total_purchases INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  loyalty_tier VARCHAR(20) DEFAULT 'bronze',
  member_since DATE DEFAULT CURRENT_DATE,
  last_login_bonus DATE,
  login_streak INTEGER DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_loyalty_tier ON profiles(loyalty_tier);
```

**Sample Record**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "gamer123",
  "email": "user@example.com",
  "shards_balance": 1250,
  "total_purchases": 15,
  "total_spent": 2985.00,
  "loyalty_tier": "silver",
  "member_since": "2024-01-15",
  "last_login_bonus": "2024-03-14",
  "login_streak": 7,
  "avatar_url": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-03-14T09:00:00Z"
}
```

**Loyalty Tiers**
- `bronze`: 0-999 Shards
- `silver`: 1000-4999 Shards
- `gold`: 5000-9999 Shards
- `platinum`: 10000+ Shards

---

### 3. Products

Game catalog with pricing and metadata.

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  platform VARCHAR(50) NOT NULL, -- steam, playstation, xbox, nintendo
  price DECIMAL(10, 2) NOT NULL,
  discount_price DECIMAL(10, 2),
  discount_percentage INTEGER DEFAULT 0,
  image_url TEXT,
  thumbnail_url TEXT,
  stock_status VARCHAR(20) DEFAULT 'in_stock', -- in_stock, low_stock, out_of_stock
  region VARCHAR(50) DEFAULT 'Global', -- Global, EU, DK, etc.
  genre VARCHAR(100),
  release_date DATE,
  publisher VARCHAR(255),
  rating DECIMAL(3, 2), -- 0.00 to 5.00
  total_reviews INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_deal BOOLEAN DEFAULT FALSE,
  deal_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_platform ON products(platform);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_is_deal ON products(is_deal);
CREATE INDEX idx_products_discount_percentage ON products(discount_percentage DESC);
```

**Sample Record**
```json
{
  "id": 1,
  "slug": "two-point-hospital-pc-steam",
  "name": "Two Point Hospital PC Steam Account",
  "description": "Byg og drift dit eget hospital i dette sjove simulator spil",
  "platform": "steam",
  "price": 149.00,
  "discount_price": 99.00,
  "discount_percentage": 33,
  "image_url": "https://r2.dingaming.dk/products/two-point-hospital.jpg",
  "thumbnail_url": "https://r2.dingaming.dk/products/thumbs/two-point-hospital.jpg",
  "stock_status": "in_stock",
  "region": "Global",
  "genre": "Simulation",
  "release_date": "2018-08-30",
  "publisher": "SEGA",
  "rating": 4.6,
  "total_reviews": 1250,
  "is_featured": true,
  "is_deal": true,
  "deal_expires_at": "2024-03-15T23:59:59Z",
  "created_at": "2024-01-10T12:00:00Z",
  "updated_at": "2024-03-14T10:00:00Z"
}
```

**Platform Values**
- `steam`: Steam (PC)
- `playstation`: PlayStation (PS4/PS5)
- `xbox`: Xbox (One/Series X|S)
- `nintendo`: Nintendo Switch

---

### 4. Orders

Purchase transactions.

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  shards_used INTEGER DEFAULT 0,
  shards_earned INTEGER DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL, -- mobilepay, card, paypal
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded
  transaction_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'processing', -- processing, completed, cancelled
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

**Sample Record**
```json
{
  "id": 12345,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "order_number": "DG-2024-12345",
  "total_amount": 199.00,
  "shards_used": 0,
  "shards_earned": 2,
  "payment_method": "mobilepay",
  "payment_status": "completed",
  "transaction_id": "mobilepay-xyz-123",
  "status": "completed",
  "email": "user@example.com",
  "created_at": "2024-03-14T10:30:00Z",
  "completed_at": "2024-03-14T10:30:25Z",
  "refunded_at": null
}
```

---

### 5. Order Items

Line items for each order.

```sql
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  product_slug VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  game_key TEXT, -- Encrypted game key
  key_delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
```

**Sample Record**
```json
{
  "id": 1001,
  "order_id": 12345,
  "product_id": 1,
  "product_name": "Two Point Hospital PC Steam Account",
  "product_slug": "two-point-hospital-pc-steam",
  "platform": "steam",
  "quantity": 1,
  "unit_price": 199.00,
  "total_price": 199.00,
  "game_key": "XXXX-YYYY-ZZZZ-AAAA",
  "key_delivered_at": "2024-03-14T10:30:25Z",
  "created_at": "2024-03-14T10:30:00Z"
}
```

---

### 6. Shards Transactions

Loyalty points transaction log.

```sql
CREATE TABLE shards_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL, -- Positive for credit, negative for debit
  balance_after INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL, -- welcome_bonus, daily_bonus, cashback, purchase, casino_win, casino_loss
  description TEXT,
  related_order_id INTEGER REFERENCES orders(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shards_user_id ON shards_transactions(user_id);
CREATE INDEX idx_shards_created_at ON shards_transactions(created_at DESC);
CREATE INDEX idx_shards_type ON shards_transactions(type);
```

**Sample Records**
```json
[
  {
    "id": 1,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 500,
    "balance_after": 500,
    "type": "welcome_bonus",
    "description": "Welcome bonus for new account",
    "related_order_id": null,
    "created_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": 2,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 50,
    "balance_after": 550,
    "type": "daily_bonus",
    "description": "Daily login bonus (day 1)",
    "related_order_id": null,
    "created_at": "2024-01-16T09:00:00Z"
  },
  {
    "id": 3,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 2,
    "balance_after": 552,
    "type": "cashback",
    "description": "1% cashback on order #12345",
    "related_order_id": 12345,
    "created_at": "2024-03-14T10:30:25Z"
  }
]
```

**Transaction Types**
- `welcome_bonus`: 500 Shards on signup
- `daily_bonus`: Daily login (10-50 Shards based on streak)
- `cashback`: 1% of purchase amount
- `purchase`: Shards spent on discounts
- `casino_win`: Won Shards from casino games
- `casino_loss`: Lost Shards in casino games

---

### 7. Casino Games

Game history for Customer Club casino.

```sql
CREATE TABLE casino_games (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  game_type VARCHAR(50) NOT NULL, -- blackjack, roulette, dice, hilo, lines, mines
  bet_amount INTEGER NOT NULL,
  result VARCHAR(20) NOT NULL, -- win, loss, tie
  payout INTEGER DEFAULT 0,
  shards_delta INTEGER NOT NULL, -- Net change (payout - bet)
  game_data JSONB, -- Game-specific data (cards, numbers, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_casino_user_id ON casino_games(user_id);
CREATE INDEX idx_casino_game_type ON casino_games(game_type);
CREATE INDEX idx_casino_created_at ON casino_games(created_at DESC);
```

**Sample Records**
```json
[
  {
    "id": 1,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "game_type": "blackjack",
    "bet_amount": 10,
    "result": "win",
    "payout": 20,
    "shards_delta": 10,
    "game_data": {
      "player_cards": ["A♠", "K♦"],
      "dealer_cards": ["10♥", "9♣"],
      "player_score": 21,
      "dealer_score": 19
    },
    "created_at": "2024-03-14T11:00:00Z"
  },
  {
    "id": 2,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "game_type": "roulette",
    "bet_amount": 5,
    "result": "loss",
    "payout": 0,
    "shards_delta": -5,
    "game_data": {
      "bet_type": "red",
      "result_number": 18,
      "result_color": "black"
    },
    "created_at": "2024-03-14T11:05:00Z"
  }
]
```

---

### 8. Casino Stats (Materialized View)

Aggregated casino statistics per user.

```sql
CREATE MATERIALIZED VIEW casino_stats AS
SELECT
  user_id,
  COUNT(*) AS total_games_played,
  SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS total_wins,
  SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS total_losses,
  SUM(bet_amount) AS total_shards_wagered,
  SUM(payout) AS total_shards_won,
  SUM(shards_delta) AS net_shards_change,
  ROUND(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::NUMERIC / COUNT(*), 2) AS win_rate,
  MAX(game_type) FILTER (WHERE result = 'win') AS favorite_game
FROM casino_games
GROUP BY user_id;

-- Refresh periodically
CREATE INDEX idx_casino_stats_user_id ON casino_stats(user_id);
```

---

### 9. Support Tickets

Customer support requests.

```sql
CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved, closed
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  related_order_id INTEGER REFERENCES orders(id),
  assigned_to VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_support_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_status ON support_tickets(status);
CREATE INDEX idx_support_created_at ON support_tickets(created_at DESC);
```

---

## Database Functions & Triggers

### 1. Auto-update Loyalty Tier

```sql
CREATE OR REPLACE FUNCTION update_loyalty_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shards_balance >= 10000 THEN
    NEW.loyalty_tier := 'platinum';
  ELSIF NEW.shards_balance >= 5000 THEN
    NEW.loyalty_tier := 'gold';
  ELSIF NEW.shards_balance >= 1000 THEN
    NEW.loyalty_tier := 'silver';
  ELSE
    NEW.loyalty_tier := 'bronze';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_loyalty_tier_trigger
BEFORE UPDATE ON profiles
FOR EACH ROW
WHEN (OLD.shards_balance IS DISTINCT FROM NEW.shards_balance)
EXECUTE FUNCTION update_loyalty_tier();
```

### 2. Award Cashback on Order Completion

```sql
CREATE OR REPLACE FUNCTION award_cashback()
RETURNS TRIGGER AS $$
DECLARE
  cashback_amount INTEGER;
  new_balance INTEGER;
BEGIN
  IF NEW.payment_status = 'completed' AND OLD.payment_status != 'completed' THEN
    -- Calculate 1% cashback
    cashback_amount := FLOOR(NEW.total_amount * 0.01);

    -- Update profile balance
    UPDATE profiles
    SET shards_balance = shards_balance + cashback_amount
    WHERE id = NEW.user_id
    RETURNING shards_balance INTO new_balance;

    -- Record transaction
    INSERT INTO shards_transactions (user_id, amount, balance_after, type, description, related_order_id)
    VALUES (NEW.user_id, cashback_amount, new_balance, 'cashback', '1% cashback on order #' || NEW.id, NEW.id);

    -- Update order with earned shards
    NEW.shards_earned := cashback_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER award_cashback_trigger
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION award_cashback();
```

### 3. Daily Login Bonus

```sql
CREATE OR REPLACE FUNCTION claim_daily_bonus(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  last_bonus DATE;
  current_streak INTEGER;
  bonus_amount INTEGER;
  new_balance INTEGER;
BEGIN
  SELECT last_login_bonus, login_streak INTO last_bonus, current_streak
  FROM profiles WHERE id = p_user_id;

  -- Check if already claimed today
  IF last_bonus = CURRENT_DATE THEN
    RETURN 0;
  END IF;

  -- Calculate streak
  IF last_bonus = CURRENT_DATE - INTERVAL '1 day' THEN
    current_streak := current_streak + 1;
  ELSE
    current_streak := 1;
  END IF;

  -- Calculate bonus (10 base + 5 per streak day, max 50)
  bonus_amount := LEAST(10 + (current_streak - 1) * 5, 50);

  -- Update profile
  UPDATE profiles
  SET
    shards_balance = shards_balance + bonus_amount,
    last_login_bonus = CURRENT_DATE,
    login_streak = current_streak
  WHERE id = p_user_id
  RETURNING shards_balance INTO new_balance;

  -- Record transaction
  INSERT INTO shards_transactions (user_id, amount, balance_after, type, description)
  VALUES (p_user_id, bonus_amount, new_balance, 'daily_bonus', 'Daily login bonus (day ' || current_streak || ')');

  RETURN bonus_amount;
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security (RLS)

### Profiles Table

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

### Orders Table

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders
CREATE POLICY "Users can view own orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);

-- Users can create orders
CREATE POLICY "Users can create orders"
ON orders FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### Shards Transactions

```sql
ALTER TABLE shards_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own transactions
CREATE POLICY "Users can view own shards transactions"
ON shards_transactions FOR SELECT
USING (auth.uid() = user_id);
```

---

## Data Validation Constraints

```sql
-- Products: Price validation
ALTER TABLE products ADD CONSTRAINT check_price_positive CHECK (price > 0);
ALTER TABLE products ADD CONSTRAINT check_discount_valid CHECK (discount_price IS NULL OR discount_price < price);

-- Orders: Amount validation
ALTER TABLE orders ADD CONSTRAINT check_total_positive CHECK (total_amount > 0);

-- Profiles: Shards cannot be negative
ALTER TABLE profiles ADD CONSTRAINT check_shards_non_negative CHECK (shards_balance >= 0);

-- Casino: Bet amount must be positive
ALTER TABLE casino_games ADD CONSTRAINT check_bet_positive CHECK (bet_amount > 0);
```

---

## Backup & Retention Policy

- **Daily Backups**: Automated via Supabase
- **Retention**: 30 days
- **Point-in-Time Recovery**: Available within 7 days
- **Archive**: Orders older than 2 years moved to cold storage
