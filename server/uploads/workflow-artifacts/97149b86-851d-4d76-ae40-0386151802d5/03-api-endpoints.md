# API Endpoints & Integration

## Overview

DinGaming integrates with multiple backend services via REST APIs. The primary backend is Supabase, with additional integrations for analytics and payment processing.

## Base URLs

| Service | Base URL | Purpose |
|---------|----------|---------|
| Supabase API | `https://[project-id].supabase.co` | Database, Auth, Storage |
| Supabase Auth | `https://[project-id].supabase.co/auth/v1` | Authentication |
| Flock Analytics | `/~api/analytics` | Privacy-focused analytics |
| Payment Gateway | Various | MobilePay, PayPal, Card |

---

## Authentication API

### Supabase Auth Endpoints

#### 1. User Registration
```http
POST /auth/v1/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "data": {
    "username": "gamer123",
    "shards_balance": 500
  }
}
```

**Response (201 Created)**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": {
      "username": "gamer123",
      "shards_balance": 500
    }
  },
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_in": 3600
  }
}
```

#### 2. User Login
```http
POST /auth/v1/token?grant_type=password
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200 OK)**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "refresh-token",
  "user": { ... }
}
```

#### 3. Password Reset
```http
POST /auth/v1/recover
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### 4. Update Password
```http
PUT /auth/v1/user
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "password": "new_password"
}
```

#### 5. Refresh Token
```http
POST /auth/v1/token?grant_type=refresh_token
Content-Type: application/json

{
  "refresh_token": "refresh-token-here"
}
```

#### 6. Logout
```http
POST /auth/v1/logout
Authorization: Bearer {access_token}
```

#### 7. Get Current User
```http
GET /auth/v1/user
Authorization: Bearer {access_token}
```

**Response (200 OK)**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "user_metadata": {
    "username": "gamer123",
    "shards_balance": 1250
  }
}
```

---

## Database API (Supabase REST)

### Products

#### Get All Products
```http
GET /rest/v1/products?select=*
Authorization: Bearer {anon_key}
apikey: {anon_key}
```

**Response**
```json
[
  {
    "id": 1,
    "slug": "two-point-hospital-pc-steam",
    "name": "Two Point Hospital PC Steam Account",
    "platform": "steam",
    "price": 149.00,
    "discount_price": 99.00,
    "discount_percentage": 33,
    "image_url": "https://r2.dingaming.dk/products/two-point-hospital.jpg",
    "description": "Bygge og drift hospital simulator",
    "stock": "in_stock",
    "region": "Global",
    "created_at": "2024-01-10T12:00:00Z"
  }
]
```

#### Get Product by Slug
```http
GET /rest/v1/products?slug=eq.{slug}&select=*
Authorization: Bearer {anon_key}
apikey: {anon_key}
```

#### Filter by Platform
```http
GET /rest/v1/products?platform=eq.steam&select=*
Authorization: Bearer {anon_key}
apikey: {anon_key}
```

#### Search Products
```http
GET /rest/v1/products?name=ilike.*fifa*&select=*
Authorization: Bearer {anon_key}
apikey: {anon_key}
```

#### Get Deals (Discounted Products)
```http
GET /rest/v1/products?discount_percentage=gt.0&order=discount_percentage.desc&select=*
Authorization: Bearer {anon_key}
apikey: {anon_key}
```

---

### Orders & Purchases

#### Create Order
```http
POST /rest/v1/orders
Authorization: Bearer {access_token}
apikey: {anon_key}
Content-Type: application/json

{
  "user_id": "uuid",
  "total_amount": 199.00,
  "payment_method": "mobilepay",
  "status": "pending",
  "items": [
    {
      "product_id": 1,
      "quantity": 1,
      "price": 199.00
    }
  ]
}
```

**Response (201 Created)**
```json
{
  "id": 12345,
  "user_id": "uuid",
  "total_amount": 199.00,
  "status": "pending",
  "created_at": "2024-03-14T10:30:00Z",
  "payment_url": "https://mobilepay.dk/pay/xyz"
}
```

#### Get User Orders
```http
GET /rest/v1/orders?user_id=eq.{user_id}&select=*,order_items(*)
Authorization: Bearer {access_token}
apikey: {anon_key}
```

**Response**
```json
[
  {
    "id": 12345,
    "user_id": "uuid",
    "total_amount": 199.00,
    "status": "completed",
    "created_at": "2024-03-14T10:30:00Z",
    "order_items": [
      {
        "product_id": 1,
        "product_name": "FIFA 24 PC",
        "quantity": 1,
        "price": 199.00,
        "game_key": "XXXX-YYYY-ZZZZ-AAAA"
      }
    ]
  }
]
```

---

### User Profile & Shards

#### Get User Profile
```http
GET /rest/v1/profiles?id=eq.{user_id}&select=*
Authorization: Bearer {access_token}
apikey: {anon_key}
```

**Response**
```json
{
  "id": "uuid",
  "username": "gamer123",
  "email": "user@example.com",
  "shards_balance": 1250,
  "total_purchases": 15,
  "member_since": "2024-01-15",
  "loyalty_tier": "silver"
}
```

#### Update Shards Balance
```http
PATCH /rest/v1/profiles?id=eq.{user_id}
Authorization: Bearer {access_token}
apikey: {anon_key}
Content-Type: application/json

{
  "shards_balance": 1300
}
```

#### Get Shards Transaction History
```http
GET /rest/v1/shards_transactions?user_id=eq.{user_id}&order=created_at.desc
Authorization: Bearer {access_token}
apikey: {anon_key}
```

**Response**
```json
[
  {
    "id": 1,
    "user_id": "uuid",
    "amount": 50,
    "type": "daily_bonus",
    "description": "Daily login bonus",
    "created_at": "2024-03-14T09:00:00Z"
  },
  {
    "id": 2,
    "user_id": "uuid",
    "amount": 2,
    "type": "cashback",
    "description": "1% cashback on order #12345",
    "related_order_id": 12345,
    "created_at": "2024-03-13T15:30:00Z"
  }
]
```

---

### Casino Games (Customer Club)

#### Get User Casino Stats
```http
GET /rest/v1/casino_stats?user_id=eq.{user_id}
Authorization: Bearer {access_token}
apikey: {anon_key}
```

**Response**
```json
{
  "user_id": "uuid",
  "total_games_played": 150,
  "total_shards_won": 500,
  "total_shards_wagered": 1200,
  "favorite_game": "blackjack",
  "win_rate": 0.42
}
```

#### Record Casino Game Result
```http
POST /rest/v1/casino_games
Authorization: Bearer {access_token}
apikey: {anon_key}
Content-Type: application/json

{
  "user_id": "uuid",
  "game_type": "blackjack",
  "bet_amount": 10,
  "result": "win",
  "payout": 20,
  "shards_delta": 10
}
```

---

## Analytics API

### Flock Analytics (Privacy-focused)

#### Track Page View
```http
POST /~api/analytics/event
Content-Type: application/json

{
  "event": "pageview",
  "page": "/products/fifa-24",
  "referrer": "https://google.com",
  "session_id": "session-uuid"
}
```

#### Track Custom Event
```http
POST /~api/analytics/event
Content-Type: application/json

{
  "event": "purchase_completed",
  "properties": {
    "order_id": 12345,
    "total_amount": 199.00,
    "payment_method": "mobilepay"
  },
  "session_id": "session-uuid"
}
```

---

## Payment Integration

### MobilePay

#### Create Payment
```http
POST /api/payments/mobilepay/create
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "order_id": 12345,
  "amount": 199.00,
  "currency": "DKK",
  "return_url": "https://dingaming.dk/checkout/success",
  "callback_url": "https://dingaming.dk/api/webhooks/mobilepay"
}
```

**Response**
```json
{
  "payment_id": "mobilepay-xyz",
  "payment_url": "https://mobilepay.dk/pay/xyz",
  "expires_at": "2024-03-14T11:00:00Z"
}
```

### PayPal

#### Create PayPal Order
```http
POST /api/payments/paypal/create
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "order_id": 12345,
  "amount": 199.00,
  "currency": "DKK"
}
```

### Card Payment

#### Process Card Payment
```http
POST /api/payments/card/charge
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "order_id": 12345,
  "amount": 199.00,
  "currency": "DKK",
  "card_token": "tok_visa_xxxx"
}
```

---

## Game Key Delivery

### Email Service Integration

After successful payment, game keys are delivered via email:

```http
POST /api/email/send-game-key
Authorization: Bearer {service_key}
Content-Type: application/json

{
  "to": "user@example.com",
  "order_id": 12345,
  "product_name": "FIFA 24 PC Steam",
  "game_key": "XXXX-YYYY-ZZZZ-AAAA",
  "activation_instructions": "https://dingaming.dk/support/activation"
}
```

**SLA**: Delivered within 30 seconds of payment confirmation

---

## Support API

### Submit Support Ticket
```http
POST /api/support/tickets
Content-Type: application/json

{
  "name": "John Doe",
  "email": "user@example.com",
  "subject": "Game key not working",
  "message": "I received a key but it says it's already activated",
  "order_id": 12345
}
```

**Response (201 Created)**
```json
{
  "ticket_id": 789,
  "status": "open",
  "created_at": "2024-03-14T10:30:00Z",
  "estimated_response": "2024-03-15T10:30:00Z"
}
```

---

## Rate Limits

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Authentication | 5 requests | 1 hour |
| Database Reads | 100 requests | 1 minute |
| Database Writes | 20 requests | 1 minute |
| Analytics | 1000 requests | 1 hour |
| Payments | 10 requests | 1 minute |

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect",
    "status": 401
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 422 | Invalid request data |
| `SERVER_ERROR` | 500 | Internal server error |

---

## Webhooks

### Payment Confirmation
```http
POST /api/webhooks/payment-confirmed
Content-Type: application/json
X-Webhook-Signature: sha256=xxx

{
  "event": "payment.completed",
  "order_id": 12345,
  "payment_method": "mobilepay",
  "amount": 199.00,
  "timestamp": "2024-03-14T10:30:00Z"
}
```

**Handler Response (200 OK)**
```json
{
  "received": true,
  "order_id": 12345,
  "game_key_sent": true
}
```

---

## SDK & Client Libraries

### Supabase JavaScript Client

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://[project-id].supabase.co',
  'anon-public-key'
)

// Fetch products
const { data, error } = await supabase
  .from('products')
  .select('*')
  .eq('platform', 'steam')

// Create order
const { data: order } = await supabase
  .from('orders')
  .insert({
    user_id: user.id,
    total_amount: 199.00,
    status: 'pending'
  })
  .select()
```

---

## API Security

### Authentication Headers
```http
Authorization: Bearer {access_token}
apikey: {supabase_anon_key}
```

### CORS Policy
- Allowed Origins: `https://dingaming.dk`
- Allowed Methods: `GET, POST, PATCH, DELETE`
- Allowed Headers: `Authorization, Content-Type, apikey`

### Request Signing (Webhooks)
- Algorithm: HMAC-SHA256
- Header: `X-Webhook-Signature`
- Verify before processing
