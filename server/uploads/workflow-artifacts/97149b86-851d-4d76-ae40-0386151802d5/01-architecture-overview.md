# DinGaming - Architecture Overview

## Project Summary

**Project Name**: DinGaming
**URL**: https://dingaming.dk/
**Type**: Digital Game Keys Marketplace
**Primary Market**: Denmark (Danish language)

### Business Model

DinGaming is a Danish e-commerce platform for purchasing digital game keys with:
- Instant delivery via email (within 30 seconds)
- Multi-platform support (Steam, PlayStation, Xbox, Nintendo)
- Customer Club loyalty program with Shards rewards system
- Casino-style gamification features
- Up to 70% discounts on daily deals

## Technology Stack

### Frontend Architecture

#### Core Framework
- **Framework**: React (Single Page Application)
- **Build Tool**: Vite
- **Routing**: Client-side routing (SPA architecture)
- **Language**: Danish (da)

#### UI/UX Components
- **Typography**:
  - Primary: DM Sans
  - Display: Playfair Display
- **Progressive Web App (PWA)**: Enabled
  - `apple-mobile-web-app-capable`
  - Mobile theme color
  - `mobile-web-app-capable`

#### Asset Delivery
- **CDN**: Cloudflare R2 for images and media
- **Static Hosting**: Standard web hosting
- **Performance**: Optimized for instant load times

### Backend Architecture

#### Database & Auth
- **Database**: Supabase (PostgreSQL-based)
- **Authentication**: Supabase Auth
  - Email/password authentication
  - Password reset via email
  - Session management

#### Analytics
- **Provider**: Flock Analytics
- **Integration**: Proxy endpoint at `/~api/analytics`
- **Privacy**: GDPR-compliant analytics solution

### Payment Infrastructure

Supports multiple payment methods:
- **MobilePay** (Primary - Danish mobile payment)
- **Card** (Credit/debit cards)
- **PayPal**

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   React SPA (Vite)                                    │   │
│  │   - Client-side routing                               │   │
│  │   - PWA capabilities                                  │   │
│  │   - Responsive UI (DM Sans, Playfair Display)        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Supabase    │  │  Cloudflare  │  │  Flock Analytics │  │
│  │  - Auth      │  │  R2 (CDN)    │  │  Proxy Endpoint  │  │
│  │  - Database  │  │  - Images    │  │  /~api/analytics │  │
│  │  - API       │  │  - Assets    │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Payment Gateways                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  MobilePay   │  │  Card        │  │  PayPal      │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## System Components

### 1. Public Marketplace
- Product catalog browsing
- Search functionality
- Category filtering by platform
- Daily deals with countdown timers
- Product detail pages
- Shopping cart and checkout

### 2. Authentication System
- User registration with welcome bonus (500 Shards)
- Email/password login
- Password reset flow
- Session persistence

### 3. Customer Club (Protected Area)
- Loyalty rewards dashboard
- Shards balance management (1% cashback)
- Daily login bonuses
- Game library management
- Transaction history

### 4. Gamification Layer
- **Club Games**: Reward-based gaming
- **Club Cases**: Loot box mechanics
- **Club Casino**: Multiple games
  - Blackjack
  - Roulette
  - Dice
  - Hi-Lo
  - Lines
  - Mines

### 5. Support System
- FAQ and help center
- Activation guides
- Refund policy information
- Contact form (support@dingaming.dk)
- 24-hour response SLA

## Security Architecture

### Authentication Security
- Supabase Auth integration (industry-standard OAuth 2.0)
- Password hashing and secure storage
- Session token management
- HTTPS-only communication

### Data Protection
- GDPR compliance
- Email delivery for sensitive data (game keys)
- Secure payment processing (PCI DSS compliant gateways)

### Client-Side Security
- Environment-based configuration
- Secure API endpoint proxying
- XSS protection via React's built-in escaping

## Performance Considerations

### Frontend Optimization
- Vite's optimized build pipeline
- Code splitting for route-based loading
- PWA caching strategies
- Lazy loading of images from R2

### Backend Optimization
- Supabase's global CDN distribution
- Database query optimization
- Connection pooling

### Monitoring
- Flock Analytics for user behavior
- Performance metrics tracking
- Error logging and monitoring

## Scalability Strategy

### Horizontal Scalability
- **Frontend**: Static assets via CDN (R2)
- **Backend**: Supabase's auto-scaling infrastructure
- **Database**: Supabase PostgreSQL with read replicas

### Vertical Scalability
- Database indexes on frequently queried columns
- Cached query results
- Optimized asset delivery

## Service Level Objectives (SLOs)

- **Game Key Delivery**: Within 30 seconds
- **Support Response**: Within 24 hours
- **Uptime Target**: 99.9%
- **Page Load Time**: < 2 seconds

## External Dependencies

1. **Supabase**: Database, Auth, API
2. **Cloudflare R2**: Asset hosting
3. **Flock Analytics**: User analytics
4. **MobilePay**: Payment processing
5. **PayPal**: Payment processing
6. **Email Service**: Game key delivery

## Future Architecture Considerations

### Potential Enhancements
- Microservices architecture for casino games
- Real-time notifications via WebSockets
- Advanced caching layer (Redis)
- GraphQL API layer
- Mobile native apps (iOS/Android)

### Observability Roadmap
- Distributed tracing
- Centralized logging (ELK/Datadog)
- APM (Application Performance Monitoring)
- Synthetic monitoring for critical flows
