# Authentication System Documentation

## Overview

DinGaming implements a comprehensive authentication system using Supabase Auth, supporting user registration, login, password recovery, and session management.

## Authentication Provider

**Provider**: Supabase Auth
**Method**: Email & Password
**Session Storage**: Client-side (localStorage/cookies)

## Authentication Flows

### 1. User Registration (Signup)

#### Endpoint
`POST /auth/v1/signup` (Supabase)

#### User Journey
1. User navigates to `/signup`
2. Enters registration details:
   - Username
   - Email address
   - Password
   - Confirm password
3. Submits form
4. Account created in Supabase
5. **Welcome Bonus**: 500 Shards credited to account
6. Redirect to login or dashboard

#### Request Payload
```json
{
  "email": "user@example.com",
  "password": "secure_password_123",
  "data": {
    "username": "user123",
    "shards_balance": 500
  }
}
```

#### Response
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "user_metadata": {
      "username": "user123",
      "shards_balance": 500
    }
  },
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token"
  }
}
```

#### Validation Rules
- **Email**: Valid format, unique
- **Password**: Minimum 8 characters (Supabase default)
- **Username**: Required, 3-20 characters
- **Confirm Password**: Must match password

---

### 2. User Login

#### Endpoint
`POST /auth/v1/token?grant_type=password` (Supabase)

#### User Journey
1. User navigates to `/login` or `/club` (auto-redirect)
2. Enters credentials:
   - Email address
   - Password
3. Optional: Click "Forgot Password" → `/forgot-password`
4. Submits form
5. Supabase validates credentials
6. Session token issued
7. Redirect to Customer Club (`/club`) or previous protected page

#### Entry Points
- Direct: `/login`
- Redirect: Accessing `/club` or any protected route while unauthenticated

#### Request Payload
```json
{
  "email": "user@example.com",
  "password": "secure_password_123"
}
```

#### Response (Success)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": {
      "username": "user123",
      "shards_balance": 1250
    }
  }
}
```

#### Error Handling
```json
{
  "error": "Invalid login credentials",
  "error_description": "Email or password is incorrect"
}
```

#### Login Page Features
- Customer Club benefits displayed:
  - 1% cashback (Shards)
  - Daily login bonuses
  - Exclusive rewards
- "Forgot Password" link
- "Sign Up" link for new users

![Login Page](../screenshots/auth/02-login-page.png)

---

### 3. Password Reset

#### Endpoint
`POST /auth/v1/recover` (Supabase)

#### User Journey
1. User clicks "Forgot Password" on login page
2. Navigate to `/forgot-password`
3. Enter email address
4. Submit form
5. Supabase sends password reset email
6. User clicks link in email
7. Redirect to password reset page
8. Enter new password
9. Password updated, redirect to login

#### Request Payload
```json
{
  "email": "user@example.com"
}
```

#### Email Template
```
Subject: Reset Your DinGaming Password

Hi [Username],

Click the link below to reset your password:
https://dingaming.dk/reset-password?token=RESET_TOKEN

This link expires in 24 hours.

If you didn't request this, please ignore this email.

Best,
DinGaming Team
```

#### Reset Password Request
```json
{
  "token": "reset_token_from_email",
  "password": "new_secure_password"
}
```

---

### 4. Session Management

#### Token Storage
- **Access Token**: Stored in localStorage or cookies
- **Refresh Token**: Stored securely for session renewal
- **Expiry**: 1 hour (default Supabase)

#### Session Refresh
```javascript
// Automatic refresh before token expiry
POST /auth/v1/token?grant_type=refresh_token

{
  "refresh_token": "refresh_token_here"
}
```

#### Session Validation
```javascript
// Check if user is authenticated
GET /auth/v1/user
Headers: Authorization: Bearer {access_token}
```

#### Logout
```javascript
POST /auth/v1/logout
Headers: Authorization: Bearer {access_token}
```

---

## Protected Routes

Routes that require authentication:

| Route | Description | Redirect on Unauthorized |
|-------|-------------|-------------------------|
| `/club` | Customer Club dashboard | `/login` |
| `/club/games` | Club games | `/login` |
| `/club/cases` | Loot cases | `/login` |
| `/club/casino` | Casino hub | `/login` |
| `/club/casino/blackjack` | Blackjack game | `/login` |
| `/club/casino/roulette` | Roulette game | `/login` |
| `/club/casino/dice` | Dice game | `/login` |
| `/club/casino/hilo` | Hi-Lo game | `/login` |
| `/club/casino/lines` | Lines game | `/login` |
| `/club/casino/mines` | Mines game | `/login` |
| `/club/history` | Transaction history | `/login` |
| `/club/rewards` | Rewards dashboard | `/login` |

---

## Authentication State Management

### Client-Side Implementation

```javascript
// Check authentication status
const user = supabase.auth.user()

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    // Redirect to club or previous page
    window.location.href = '/club'
  }
  if (event === 'SIGNED_OUT') {
    // Clear local state, redirect to home
    window.location.href = '/'
  }
})
```

### Route Protection

```javascript
// Route guard example (React Router)
function ProtectedRoute({ children }) {
  const user = supabase.auth.user()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
```

---

## Security Considerations

### Password Security
- **Hashing**: bcrypt (Supabase default)
- **Minimum Length**: 8 characters
- **Salt**: Automatically generated per password
- **Storage**: Never stored in plaintext

### Session Security
- **HTTPS Only**: All authentication requests over HTTPS
- **Token Expiry**: 1-hour access tokens
- **Refresh Rotation**: Refresh tokens rotated on use
- **CSRF Protection**: Built into Supabase Auth

### Rate Limiting
- Login attempts: Limited by Supabase (default: 5 attempts/hour)
- Password reset: Limited to prevent abuse
- Signup: IP-based rate limiting

### Account Security
- Email verification (optional, configure in Supabase)
- Password complexity requirements
- Secure password reset flow

---

## User Metadata Structure

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-03-14T14:20:00Z",
  "user_metadata": {
    "username": "gamer123",
    "shards_balance": 1250,
    "total_purchases": 15,
    "member_since": "2024-01-15",
    "last_login_bonus": "2024-03-14",
    "loyalty_tier": "silver"
  },
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  }
}
```

---

## Integration with Customer Club

### Post-Login Flow
1. User successfully authenticates
2. Fetch user profile and Shards balance
3. Check for daily login bonus eligibility
4. Credit bonus if applicable
5. Update `last_login_bonus` timestamp
6. Redirect to `/club` dashboard

### Shards Integration
- **Welcome Bonus**: 500 Shards on signup
- **Daily Login**: 10-50 Shards (based on streak)
- **Purchase Cashback**: 1% of purchase value in Shards
- Balance stored in `user_metadata.shards_balance`

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| `400` | Invalid email or password | Malformed input |
| `401` | Invalid login credentials | Wrong email/password |
| `422` | Email already registered | Signup with existing email |
| `429` | Too many requests | Rate limit exceeded |
| `500` | Internal server error | Supabase service error |

---

## Testing Credentials

**Note**: These are test credentials from the workflow context.

```
Email: tobiasflyvende@gmail.com
Password: abe12345
```

---

## Future Enhancements

### Planned Features
- **Social Login**: Google, Facebook, Discord
- **Two-Factor Authentication (2FA)**: TOTP-based
- **Email Verification**: Mandatory for new accounts
- **Account Recovery**: Security questions
- **Session Management**: View active sessions, remote logout
- **Login History**: Audit log of login attempts

### Security Roadmap
- Implement CAPTCHA for login/signup
- Add device fingerprinting
- Suspicious activity detection
- Brute force protection
