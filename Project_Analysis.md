# Railway Ticketing System — Complete Project Analysis

> **Generated:** 2026-03-16  
> **Version:** 2.0.0  
> **Architecture:** Full-stack web application (React SPA + Flask REST API + Zoho Creator DB)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Database Schema (Zoho Creator)](#4-database-schema-zoho-creator)
5. [API Endpoints Reference](#5-api-endpoints-reference)
6. [Authentication & Security](#6-authentication--security)
7. [AI / NLP Layer](#7-ai--nlp-layer)
8. [Business Rules](#8-business-rules)
9. [Known Limitations](#9-known-limitations)

---

## 1. System Overview

### Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite 5 | SPA with role-based routing |
| **Backend** | Python 3.9, Flask 2.3.2 | REST API with blueprint architecture |
| **Database** | Zoho Creator (REST API v2) | Cloud-hosted low-code platform |
| **Hosting** | Zoho Catalyst AppSail | Port 3002 (backend), Port 3001 (frontend dev) |
| **AI Engine** | Google Gemini 2.0 Flash | NLP search, chat, recommendations |
| **Auth** | JWT (HS256) + Header-based legacy | Dual auth with migration path |

### High-Level Architecture

```
┌─────────────────────────────┐
│      React SPA (Vite)       │  Port 3001 (dev)
│  Admin Panel + Passenger UI │
└─────────┬───────────────────┘
          │  Axios (JWT + X-User-* headers)
          │  Vite proxy: /api/* → localhost:3002
          ▼
┌─────────────────────────────┐
│   Flask REST API (v2.0)     │  Port 3002
│  17 Blueprint modules       │
│  + AI routes + Analytics    │
└─────────┬───────────────────┘
          │  OAuth 2.0 (refresh token flow)
          ▼
┌─────────────────────────────┐
│  Zoho Creator REST API v2   │
│  15 Forms / 15 Reports      │
│  Criteria-based querying    │
└─────────────────────────────┘
          ▲
          │  API Key
┌─────────┴───────────────────┐
│  Google Gemini 2.0 Flash    │
│  NLP → Zoho criteria        │
│  Chat, Recommendations      │
└─────────────────────────────┘
```

---

## 2. Frontend Architecture

### Stack & Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.2.0 | UI framework |
| `react-dom` | ^18.2.0 | DOM rendering |
| `react-router-dom` | ^6.22.0 | Client-side routing |
| `axios` | ^1.6.7 | HTTP client |
| `formik` | ^2.4.5 | Form state management |
| `yup` | ^1.3.3 | Schema validation |
| `date-fns` | ^3.3.1 | Date utilities |
| `vite` | ^5.1.0 | Build tool + dev server |
| `@vitejs/plugin-react` | ^4.2.1 | React JSX/HMR support |

### Directory Structure

```
src/
├── main.jsx                    # Entry point, renders <App />
├── App.jsx                     # Role-based routing (Admin vs Passenger)
├── components/                 # Shared UI components
│   ├── AdminLayout.jsx         # Sidebar + topbar for Admin role
│   ├── PassengerLayout.jsx     # Sidebar + topbar for Passenger role
│   ├── AdminMasterLayout.jsx   # Master data admin layout
│   ├── AIChatWidget.jsx        # Floating AI chat assistant (Ctrl+/)
│   ├── CRUDTable.jsx           # Generic CRUD table component
│   ├── ErrorBoundary.jsx       # React error boundary
│   ├── FormFields.jsx          # Reusable form field components
│   ├── Layout.jsx              # Base layout wrapper
│   ├── LoginModal.jsx          # Login modal component
│   ├── RequireAuth.jsx         # Auth guard HOC
│   ├── SignInModal.jsx         # Sign-in modal
│   └── UI.jsx                  # SVG icon library + shared UI primitives
├── context/
│   ├── ToastContext.jsx         # Toast notification system (success/error/warning/info)
│   └── SettingsContext.jsx      # App-wide settings from Zoho Settings table
├── hooks/
│   └── useApi.js               # useApi() + useMutation() — generic data-fetching hooks
├── pages/
│   ├── admin/
│   │   ├── TrainRoutesAdmin.jsx # Route + stop management
│   │   └── MasterDataAdmin.jsx  # Quotas, fares, inventory admin
│   ├── AdminDashboard.jsx       # Admin overview dashboard
│   ├── BookingsPage.jsx         # All bookings management
│   ├── TrainsPage.jsx           # Train CRUD
│   ├── StationsPage.jsx         # Station CRUD
│   ├── UsersPage.jsx            # User management
│   ├── FaresPage.jsx            # Fare management
│   ├── InventoryPage.jsx        # Train inventory
│   ├── ReportsPage.jsx          # Revenue & occupancy reports
│   ├── AdminLogsPage.jsx        # Audit logs viewer
│   ├── ZohoExplorerPage.jsx     # Raw Zoho data explorer (debug)
│   ├── OverviewPage.jsx         # System overview
│   ├── AnnouncementsPage.jsx    # Announcements management
│   ├── SettingsPage.jsx         # System settings
│   ├── ReservationChartPage.jsx # Reservation chart
│   ├── ChartVacancy.jsx         # Seat chart & vacancy
│   ├── TrainRoutesPage.jsx      # Train routes viewer
│   ├── TrainSchedule.jsx        # Schedule viewer (passenger)
│   ├── SearchPage.jsx           # Train search (passenger)
│   ├── PNRStatus.jsx            # PNR lookup (passenger)
│   ├── CancelTicket.jsx         # Ticket cancellation (passenger)
│   ├── MyBookings.jsx           # User's bookings (passenger)
│   ├── PassengerHome.jsx        # Passenger dashboard
│   ├── PassengerExplorerPage.jsx# AI assistant explorer (passenger)
│   ├── ProfilePage.jsx          # User profile editor
│   ├── ChangePasswordPage.jsx   # Password change
│   └── LoginPage.jsx            # Full-screen login
├── services/
│   └── api.js                   # Axios client + all API service modules
└── styles/
    └── global.css               # CSS custom properties, dark theme, layout tokens
```

### Role-Based Routing

The app uses **two completely separate layouts** based on user role:

**Admin Routes** (`AdminLayout`):
| Route | Page | Description |
|-------|------|-------------|
| `/` `/admin` `/admin/dashboard` | AdminDashboard | Overview dashboard |
| `/trains` | TrainsPage | Train CRUD |
| `/stations` | StationsPage | Station CRUD |
| `/users` | UsersPage | User management |
| `/bookings` | BookingsPage | All bookings |
| `/train-routes` | TrainRoutesAdmin | Route + stops |
| `/fares` | MasterDataAdmin | Fare management |
| `/inventory` | MasterDataAdmin | Inventory |
| `/reports` | ReportsPage | Revenue/occupancy |
| `/admin-logs` | AdminLogsPage | Audit trail |
| `/settings` | SettingsPage | System config |
| `/zoho-explorer` | ZohoExplorerPage | Debug tool |

**Passenger Routes** (`PassengerLayout`):
| Route | Page | Description |
|-------|------|-------------|
| `/` | PassengerHome | Dashboard |
| `/search` | SearchPage | Train search + booking |
| `/my-bookings` | MyBookings | User's bookings |
| `/pnr-status` | PNRStatus | PNR lookup |
| `/cancel-ticket` | CancelTicket | Ticket cancellation |
| `/train-schedule` | TrainSchedule | Schedule viewer |
| `/chart-vacancy` | ChartVacancy | Seat availability |
| `/ai-assistant` | PassengerExplorerPage | AI assistant |
| `/profile` | ProfilePage | Profile editor |
| `/change-password` | ChangePasswordPage | Security |

### Admin Detection Logic

```javascript
function isAdmin(user) {
  if (!user) return false;
  const email = (user.Email || '').trim().toLowerCase();
  if (email.endsWith('@admin.com')) return true;       // Domain match
  if ((user.Role || '').toLowerCase() === 'admin') return true; // Role field
  return false;
}
```

### API Client Architecture (`services/api.js`)

- **Base URL**: Uses `VITE_API_BASE_URL` env var; defaults to `/` (Vite proxy in dev)
- **Interceptors**: Request interceptor injects JWT + `X-User-*` legacy headers
- **401 Handler**: Automatic JWT refresh with queue for concurrent requests
- **Response unwrapping**: `client.interceptors.response` extracts `res.data` automatically
- **Auth error pass-through**: `/auth/*` errors returned as resolved (no throw)
- **Zoho response helpers**: `extractRecords()`, `getRecordId()`, `getLookupLabel()`
- **Date converters**: `parseZohoDate()`, `toZohoDateTime()`, `displayZohoDate()`

### 18 API Service Modules

| Module | Prefix | Operations |
|--------|--------|------------|
| `authApi` | `/auth/` | login, register, logout, refresh, changePassword, forgotPassword, resetPassword |
| `stationsApi` | `/stations` | CRUD + bulk + manifest |
| `trainsApi` | `/trains` | CRUD + bulk + searchByStation + runningStatus + cancelOnDate |
| `usersApi` | `/users` | CRUD + updateProfile + updateStatus + insights |
| `bookingsApi` | `/bookings` | CRUD + confirm + markPaid + cancel + partialCancel + PNR + ticket + chart |
| `faresApi` | `/fares` | CRUD + calculate |
| `trainRoutesApi` | `/train-routes` | Route CRUD + stop CRUD + connections |
| `quotasApi` | `/quotas` | CRUD |
| `coachApi` | `/coach-layouts` | CRUD |
| `inventoryApi` | `/inventory` | CRUD |
| `announcementsApi` | `/announcements` | CRUD + getActive |
| `settingsApi` | `/settings` | CRUD |
| `userBookingsApi` | `/users/:id/bookings` | getByUser + getUpcoming |
| `trainInfoApi` | `/trains/:id/` | schedule + vacancy |
| `overviewApi` | `/overview/stats` | Admin stats |
| `reportsApi` | `/reports/` | revenue + occupancy |
| `adminLogsApi` | `/admin/logs` | getAll + create |
| `aiApi` | `/ai/` | search, chat, agent, recommendations, analyze, predict |
| `analyticsApi` | `/analytics/` | overview, trends, topTrains, routes, revenue |
| `mcpApi` | `/debug/` | health, config, system, rawReport, aiTranslate |
| `connectingTrainsApi` | `/trains/connecting` | Multi-leg search |

### Design System

- **Theme**: Dark mode only (CSS custom properties in `global.css`)
- **Color palette**: Navy/slate backgrounds (`#060911`, `#0a0d14`), cyan/blue/purple accents
- **Fonts**: Syne (display), DM Sans (body), DM Mono (monospace)
- **Icons**: Custom SVG icon library in `UI.jsx` (30+ icons)
- **Toast notifications**: Context-based system (success/error/warning/info)
- **Layout tokens**: `--sidebar-width: 240px`, `--topbar-height: 64px`

---

## 3. Backend Architecture

### Directory Structure

```
Backend/appsail-python/
├── app.py                       # Flask entry point, health check, debug endpoints, SSE stream
├── config.py                    # Environment config, seat maps, cancellation constants
├── run.py                       # Alternative entry point
├── gunicorn.conf.py             # Production WSGI config
├── requirements.txt             # Python dependencies
├── core/
│   ├── security.py              # JWT, bcrypt, rate limiter, auth decorators
│   └── exceptions.py            # Custom exception hierarchy
├── middleware/
│   └── auth.py                  # Auth shim (delegates to core/security.py)
├── repositories/
│   ├── zoho_repository.py       # CriteriaBuilder + Zoho CRUD with retry/cache
│   └── cache_manager.py         # TTL-based in-memory cache
├── services/
│   ├── zoho_service.py          # Low-level Zoho API wrapper
│   ├── zoho_token_manager.py    # OAuth token lifecycle
│   ├── booking_service.py       # Booking orchestration (create/cancel/refund)
│   ├── user_service.py          # User business logic
│   └── analytics_service.py     # Analytics/stats computation
├── utils/
│   ├── seat_allocation.py       # Berth assignment, waitlist promotion
│   ├── fare_helper.py           # IRCTC fare calculation
│   ├── date_helpers.py          # Zoho date format converters
│   ├── validators.py            # Input validation
│   ├── admin_logger.py          # Audit log writer
│   └── log_helper.py            # Logging utilities
├── routes/                      # Flask Blueprints (thin HTTP handlers)
│   ├── __init__.py              # Blueprint registration
│   ├── auth.py                  # /api/auth/*
│   ├── trains.py                # /api/trains/*
│   ├── stations.py              # /api/stations/*
│   ├── bookings.py              # /api/bookings/*
│   ├── users.py                 # /api/users/*
│   ├── fares.py                 # /api/fares/*
│   ├── train_routes.py          # /api/train-routes/*
│   ├── quotas.py                # /api/quotas/*
│   ├── coaches.py               # /api/coaches/*
│   ├── coach_layouts.py         # /api/coach-layouts/*
│   ├── inventory.py             # /api/inventory/*
│   ├── announcements.py         # /api/announcements/*
│   ├── settings.py              # /api/settings/*
│   ├── overview.py              # /api/overview/*
│   ├── admin_logs.py            # /api/admin/logs/*
│   ├── admin_reports.py         # /api/reports/*
│   └── ai_routes.py             # /api/ai/*
└── ai/
    ├── nlp_search.py            # NLP → Zoho criteria translation
    ├── gemini_agent.py          # Gemini API integration
    ├── claude_agent.py          # Claude API integration (backup)
    ├── circuit_breaker.py       # Resilience: circuit breaker + key rotation
    └── prompts.py               # AI prompt templates
```

### 17 Flask Blueprints

| Blueprint | URL Prefix | Module |
|-----------|-----------|--------|
| `auth_bp` | `/api/auth` | `routes/auth.py` |
| `bookings_bp` | `/api/bookings` | `routes/bookings.py` |
| `stations_bp` | `/api/stations` | `routes/stations.py` |
| `trains_bp` | `/api/trains` | `routes/trains.py` |
| `users_bp` | `/api/users` | `routes/users.py` |
| `train_routes_bp` | `/api/train-routes` | `routes/train_routes.py` |
| `coaches_bp` | `/api/coaches` | `routes/coaches.py` |
| `coach_layouts_bp` | `/api/coach-layouts` | `routes/coach_layouts.py` |
| `inventory_bp` | `/api/inventory` | `routes/inventory.py` |
| `quotas_bp` | `/api/quotas` | `routes/quotas.py` |
| `overview_bp` | `/api/overview` | `routes/overview.py` |
| `fares_bp` | `/api/fares` | `routes/fares.py` |
| `settings_bp` | `/api/settings` | `routes/settings.py` |
| `announcements_bp` | `/api/announcements` | `routes/announcements.py` |
| `ai_bp` | `/api/ai` | `routes/ai_routes.py` |
| `admin_logs_bp` | `/api/admin/logs` | `routes/admin_logs.py` |
| `admin_reports_bp` | `/api/reports` | `routes/admin_reports.py` |

### Service Layer Pattern

```
HTTP Request → Route (Blueprint) → Service → Repository → Zoho API
                                     ↓
                                  Utils (fare calc, seat alloc, date helpers)
```

### Key Services

| Service | Responsibility |
|---------|---------------|
| `BookingService` | PNR generation, seat allocation, booking limits, cancellation + refund |
| `UserService` | User CRUD, profile updates, Aadhaar verification |
| `AnalyticsService` | Overview stats, booking trends, top trains, route popularity, class revenue |
| `ZohoService` | Low-level Zoho Creator API calls (CRUD, criteria queries) |
| `TokenManager` | OAuth 2.0 token refresh lifecycle for Zoho API |

### Repository Layer

**`ZohoRepository`** provides:
- `CriteriaBuilder`: Safe, typed query construction (prevents injection)
- **Caching**: TTL-based in-memory cache via `cache_manager.py`
- **Retry**: Exponential backoff on HTTP 429/503
- **Batch**: Sequential multi-record operations with rollback support

### Python Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | 2.3.2 | Web framework |
| Flask-Cors | 3.0.10 | CORS support |
| requests | latest | HTTP client for Zoho API |
| python-dotenv | latest | Environment variable loading |
| PyJWT | 2.8.0 | JWT token generation/validation |
| bcrypt | 4.1.2 | Password hashing |
| cachetools | 5.3.2 | TTL cache |

---

## 4. Database Schema (Zoho Creator)

### Overview

The system uses **Zoho Creator** as a cloud database, accessed via REST API v2. Data is organized into **Forms** (for creating records) and **Reports** (for reading/updating/deleting records).

### Form ↔ Report Mapping

| Entity | Form Name | Report Name |
|--------|-----------|-------------|
| Stations | `Stations` | `All_Stations` |
| Trains | `Trains` | `All_Trains` |
| Users | `Users` | `All_Users` |
| Bookings | `Bookings` | `All_Bookings` |
| Fares | `Fares` | `All_Fares` |
| Train Routes | `Train_Routes` | `All_Train_Routes` |
| Route Stops | `Route_Stops` | `All_Route_Stops` |
| Coach Layouts | `Coach_Layouts` | `All_Coach_Layouts` |
| Train Inventory | `Train_Inventory` | `Train_Inventory_Report` |
| Quotas | `Quotas` | `All_Quotas` |
| Passengers | `Passengers` | `All_Passengers` |
| Announcements | `Announcements` | `All_Announcements` |
| Admin Logs | `Admin_Logs` | `All_Admin_Logs` |
| Password Reset | `Password_Reset_Tokens` | `All_Reset_Tokens` |
| Settings | `Settings` | `All_Setting` |

---

### Entity: Users

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Zoho auto-generated record ID |
| `Full_Name` | string | Required |
| `Email` | string | Lowercase, unique |
| `Phone_Number` | string | |
| `Password` | string | bcrypt hash (new) or SHA-256 (legacy) |
| `Role` | enum | `Admin` \| `User` |
| `Account_Status` | enum | `Active` \| `Blocked` \| `Suspended` |
| `Aadhar_Verified` / `Is_Aadhar_Verified` | bool | Stored as string `"true"` / `"false"` |
| `Last_Login` | datetime | Updated on each login |
| `Date_of_Birth` | date | Optional |
| `ID_Proof_Type` | string | Optional |
| `ID_Proof_Number` | string | Optional |

---

### Entity: Trains

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `Train_Number` | string | e.g. `12028` |
| `Train_Name` | string | e.g. `Chennai Express` |
| `Train_Type` | string | EXPRESS, SUPERFAST, SF, RAJDHANI, SHATABDI, etc. |
| `From_Station` | lookup | `{ ID, display_value: "MAS-Chennai Central" }` |
| `To_Station` | lookup | Same as above |
| `Departure_Time` | time | `HH:MM` |
| `Arrival_Time` | time | `HH:MM` |
| `Duration` | string | |
| `Distance` | float | Kilometers |
| `Run_Days` | string | Comma-separated: `Mon,Wed,Fri` |
| `Is_Active` | bool | |
| `Pantry_Car_Available` | bool | |
| `Running_Status` | string | `On Time` \| `Delayed` |
| `Delay_Minutes` | int | |
| **Per-class fares:** | | |
| `Fare_SL` | float | Sleeper base fare |
| `Fare_3A` | float | 3rd AC base fare |
| `Fare_2A` | float | 2nd AC base fare |
| `Fare_1A` | float | 1st AC base fare |
| `Fare_CC` | float | Chair Car base fare |
| `Fare_EC` | float | Executive Chair fare |
| `Fare_2S` | float | Second Sitting fare |
| **Per-class seat totals:** | | |
| `Total_Seats_SL` | int | |
| `Total_Seats_3A` | int | |
| `Total_Seats_2A` | int | |
| `Total_Seats_1A` | int | |
| `Total_Seats_CC` | int | |
| **Available seat counts:** | | |
| `Available_Seats_SL` | int | Runtime-managed |
| `Available_Seats_3A` | int | |
| `Available_Seats_2A` | int | |
| `Available_Seats_1A` | int | |
| `Available_Seats_CC` | int | |

---

### Entity: Stations

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `Station_Code` | string | 2–5 uppercase chars: `MAS`, `SBC`, `NDLS` |
| `Station_Name` | string | Full name |
| `City` | string | |
| `State` | string | |
| `Zone` | string | Railway zone code |
| `Division` | string | |
| `Station_Type` | string | |
| `Number_of_Platforms` | int | |
| `Latitude` | float | |
| `Longitude` | float | |
| `Is_Active` | bool | |

---

### Entity: Bookings

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `PNR` | string | 11-char: `PNR` + 8 alphanumeric |
| `Users` | lookup | User record ID |
| `Trains` | lookup | Train record ID |
| `Journey_Date` | date | Stored as `dd-MMM-yyyy` in Zoho |
| `Class` | enum | SL, 2S, 3A, 3AC, 2A, 2AC, 1A, 1AC, CC, EC |
| `Quota` | enum | General, TQ (Tatkal), PT (Premium Tatkal) |
| `Num_Passengers` | int | 1–6 max |
| `Total_Fare` | float | Auto-calculated |
| `Booking_Status` | enum | `confirmed` \| `waitlisted` \| `cancelled` |
| `Payment_Status` | enum | `pending` \| `paid` \| `refunded` |
| `Passengers` | JSON string | Array of passenger objects (must JSON.parse) |
| `Refund_Amount` | float | Set on cancellation |
| `Boarding_Station` | lookup | Optional override |
| `Deboarding_Station` | lookup | Optional override |
| `Booking_Time` | datetime | Auto-set on creation |

**Passenger JSON structure** (inside `Bookings.Passengers`):

```json
{
  "Passenger_Name": "string",
  "Age": 30,
  "Gender": "Male | Female | Other",
  "Is_Child": false,
  "Current_Status": "CNF/S1/14 | WL/5 | RAC/12",
  "Coach": "S1",
  "Seat_Number": 14,
  "Berth": "Lower | Middle | Upper | Side Lower | Side Upper | Window | Aisle",
  "Cancelled": false
}
```

---

### Entity: Fares

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `Train` | lookup | Train record ID |
| `From_Station` | lookup | Station record ID |
| `To_Station` | lookup | Station record ID |
| `Class` | string | SL, 3AC, 2AC, 1AC, CC, etc. |
| `Base_Fare` | float | |
| `Dynamic_Fare` | float | Overrides base fare when > 0 |
| `Tatkal_Fare` | float | Specific tatkal surcharge |
| `Concession_Type` | string | General, Senior, Student, Disabled, Armed Forces |
| `Concession_Percent` | float | |
| `Distance_KM` | float | |
| `Effective_From` | date | Active date range start |
| `Effective_To` | date | Active date range end |
| `Is_Active` | bool | |

---

### Entity: Train Routes (Parent-Child)

**Parent: `Train_Routes`**

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Route record ID |
| `Train` | lookup | Train record ID |
| `Notes` | string | |

**Child: `Route_Stops`** (subform of Train_Routes)

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Stop record ID |
| `Sequence` | int | Stop order (1 = origin) |
| `Station_Name` | string | |
| `Station_Code` | string | IRCTC code |
| `Stations` | lookup | Optional link to Stations form |
| `Arrival_Time` | time | |
| `Departure_Time` | time | |
| `Halt_Minutes` | int | |
| `Distance_KM` | float | |
| `Day_Count` | int | 1 = same day, 2 = next day |

---

### Entity: Quotas

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| Quota code, name, surcharge | — | General, Tatkal, Premium Tatkal, Ladies, etc. |
| `Surcharge_Percentage` | float | Applied to base fare |

---

### Entity: Announcements

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `Title` | string | Required |
| `Message` | string | Required |
| `Priority` | string | Optional |
| `Start_Date` | date | Active range |
| `End_Date` | date | Active range |
| `Trains` | lookup | Optional — scope to specific trains |
| `Stations` | lookup | Optional — scope to specific stations |

---

### Entity: Admin Logs

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| `Action` | string | e.g. `CREATE`, `UPDATE`, `DELETE` |
| `Resource_Type` | string | e.g. `Train`, `Booking`, `User` |
| `Details` | string | Human-readable description |
| Timestamp, User info | — | Auto-captured |

---

### Entity: Coach Layouts

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| Class, coach prefix, capacity, berth configuration | — | Defines physical coach structure |

---

### Entity: Train Inventory (Daily Ledger)

| Field | Type | Notes |
|-------|------|-------|
| `ID` | string | Record ID |
| Train, date, class-wise available/booked/waitlisted counts | — | Per-train per-date snapshot |

---

### Entity: Settings

| Field | Type | Notes |
|-------|------|-------|
| `Key` | string | Setting identifier (e.g. `dropdown_classes`) |
| `Value` | string | Setting value; comma-separated for dropdowns |

---

### Entity Relationship Diagram

```
Users ──────────────┐
                    │ 1:N
                    ▼
Stations ──┐    Bookings ◄──── Passengers (JSON)
           │     ▲   ▲
           │     │   │
           │  1:N│   │1:N
           │     │   │
Trains ────┴─────┘   │
  │                   │
  │ 1:1              │
  ▼                   │
Train_Routes          │
  │                   │
  │ 1:N              │
  ▼                   │
Route_Stops           │
                      │
Fares ────────────────┘
  (Train × Station × Station × Class)

Quotas ─── (referenced in booking fare calculation)
Announcements ─── (optionally scoped to Trains/Stations)
Admin_Logs ─── (audit trail, standalone)
Coach_Layouts ─── (coach configuration, standalone)
Train_Inventory ─── (daily seat ledger per train)
Settings ─── (key-value config store)
Password_Reset_Tokens ─── (OTP tokens for forgot-password)
```

---

## 5. API Endpoints Reference

### Auth — `/api/auth/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | None | Register new user |
| POST | `/login` | None | Login → JWT + user object |
| POST | `/logout` | User | Invalidate session |
| POST | `/refresh` | None | Refresh JWT token |
| POST | `/setup-admin` | ADMIN_SETUP_KEY | Create/reset admin |
| POST | `/change-password` | User | Change password |
| POST | `/forgot-password` | None | Request OTP |
| POST | `/reset-password` | None | Reset with OTP |

### Stations — `/api/stations`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Search/list stations |
| POST | `/` | Admin | Create station |
| POST | `/bulk` | Admin | Bulk create |
| GET | `/{id}` | None | Get by ID |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete |
| GET | `/{id}/manifest` | Admin | Boarding/deboarding manifest |

### Trains — `/api/trains`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Search trains (source, destination, date) |
| POST | `/` | Admin | Create train |
| POST | `/bulk` | Admin | Bulk create |
| GET | `/{id}` | None | Get by ID |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete |
| GET | `/{id}/schedule` | None | Full stop list |
| GET | `/{id}/vacancy` | None | Class-wise seat availability |
| GET | `/{id}/running-status` | None | Current status |
| PUT | `/{id}/running-status` | Admin | Update running status |
| POST | `/{id}/cancel-on-date` | Admin | Cancel train for a date |
| GET | `/search-by-station` | None | Trains at a station |
| GET | `/connecting` | None | Multi-leg journey search |

### Bookings — `/api/bookings`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | List bookings |
| POST | `/` | None | Create booking |
| GET | `/pnr/{pnr}` | None | PNR lookup |
| GET | `/{id}` | None | Get by ID |
| PUT | `/{id}` | None | Update |
| DELETE | `/{id}` | Admin | Hard delete |
| POST | `/{id}/confirm` | None | Confirm booking |
| POST | `/{id}/pay` | None | Mark as paid |
| POST | `/{id}/cancel` | None | Cancel + auto-refund |
| POST | `/{id}/partial-cancel` | None | Cancel specific passengers |
| GET | `/{id}/ticket` | None | Printable ticket |
| GET | `/chart` | Admin | Reservation chart |
| GET | `/stream` | None | SSE: live booking updates |

### Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin | List/search users |
| POST | `/` | None | Create user |
| GET | `/{id}` | Admin | Get by ID |
| PUT | `/{id}` | Admin | Update all fields |
| DELETE | `/{id}` | Admin | Delete |
| GET | `/{id}/bookings` | None | User's bookings |
| PUT | `/{id}/profile` | None | Self-service profile update |
| PUT | `/{id}/status` | Admin | Block/unblock user |

### Fares — `/api/fares`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | List fares |
| POST | `/` | Admin | Create fare record |
| GET | `/{id}` | None | Get by ID |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete |
| POST | `/calculate` | None | Full IRCTC-style fare breakdown |

### AI — `/api/ai/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/search` | None | NLP → Zoho search results |
| POST | `/chat` | None | Multi-turn booking assistant |
| POST | `/agent` | None | AI agent with role context |
| GET | `/recommendations` | None | Personalised train recommendations |
| POST | `/analyze` | Admin | Gemini-powered analytics |
| GET | `/predict-availability` | None | Seat availability prediction |
| GET | `/cache-stats` | Admin | AI cache statistics |
| POST | `/cache/invalidate` | Admin | Invalidate AI cache |

### Analytics — `/api/analytics/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/overview` | None | Overview stats |
| GET | `/trends` | None | Booking trends (N days) |
| GET | `/top-trains` | None | Top N popular trains |
| GET | `/routes` | None | Route popularity |
| GET | `/revenue` | None | Class-wise revenue |

### Other Endpoints

| Path | Description |
|------|-------------|
| `GET /api/health` | Health check + credential status |
| `GET /api/debug/config` | Config status (secrets redacted) |
| `GET /api/debug/system` | System constants |
| `GET /api/debug/raw` | Raw Zoho record pass-through |

---

## 6. Authentication & Security

### Dual Auth System

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **JWT (v2.0)** | HS256 tokens, 60-min access + 7-day refresh | New standard |
| **Header-based (legacy)** | `X-User-Email` + `X-User-Role` headers | Backward compat |

### Password Security

| Method | Algorithm | Usage |
|--------|-----------|-------|
| **New registrations** | bcrypt (cost factor 12) | Default |
| **Legacy accounts** | SHA-256 | Auto-migrated on next login |

### Role Resolution Priority

1. Email ends with `@admin.com` → **Admin**
2. `Role` field == `"Admin"` → **Admin**
3. Everything else → **User**

### Rate Limiting

- In-memory per-IP rate limiter
- Auth endpoints: 100 requests per 60-second window
- Configurable via `RATE_LIMIT_AUTH` and `RATE_LIMIT_WINDOW` env vars

### IRCTC Maintenance Window

- Daily: **23:45 – 00:15** (bookings blocked)

### Frontend Auth Flow

```
Login → POST /api/auth/login
  ↓
Store JWT in sessionStorage (access_token)
Store refresh_token in localStorage
Store user object in sessionStorage ('rail_user')
  ↓
Every request → Interceptor adds:
  Authorization: Bearer <jwt>
  X-User-Email: <email>      (legacy)
  X-User-Role: <role>        (legacy)
  X-User-ID: <id>
  ↓
On 401 → Auto-refresh JWT via /api/auth/refresh
  ↓
If refresh fails → Clear all tokens, dispatch 'auth:expired' event
```

---

## 7. AI / NLP Layer

### Architecture

```
User query (natural language)
         ↓
   Gemini 2.0 Flash API
   (with schema context)
         ↓
   Zoho Creator criteria string
         ↓
   Zoho API query execution
         ↓
   Formatted results returned
```

### AI Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| **NLP Search** | `POST /ai/search` | Translates natural language to Zoho criteria |
| **Chat Assistant** | `POST /ai/chat` | Multi-turn booking assistant |
| **Agent** | `POST /ai/agent` | Role-aware AI agent |
| **Recommendations** | `GET /ai/recommendations` | Personalised train suggestions |
| **Analytics** | `POST /ai/analyze` | Admin analytics insights |
| **Prediction** | `GET /ai/predict-availability` | Seat availability forecasting |

### Resilience

- **Circuit Breaker**: Protects against Gemini API failures
- **API Key Rotation**: Multiple keys with automatic failover
- **Caching**: TTL-based response caching for repeated queries
- **Fallback**: Regex-based parsing when AI APIs are unavailable

---

## 8. Business Rules

### Booking Rules

| Rule | Value |
|------|-------|
| Max passengers per booking | 6 |
| Advance booking window | 120 days |
| Monthly limit (unverified) | 6 bookings |
| Monthly limit (Aadhaar-verified) | 12 bookings |
| Tatkal opens | 10:00 AM, day before journey |
| Maintenance window | 23:45 – 00:15 daily |
| Duplicate check | Same user + train + date (non-cancelled) |
| Past date booking | Not allowed |

### Fare Calculation (IRCTC-Style, Per Passenger)

```
1. Base Fare (from Fares table → fallback: Train.Fare_{class})
2. + Reservation Charge (₹15–₹60 by class)
3. + Superfast Surcharge (if SUPERFAST/SF train, ₹30–₹75 by class)
4. + Tatkal Premium (30% of base, with min/max caps)
5. − Concession Discount (Senior: 40%, Student/Disabled/Armed: 50%)
6. = Taxable Subtotal
7. + GST 5% (AC classes only)
8. + Catering (₹0–₹350 if opted in)
9. × passenger_count
10. + Convenience Fee (₹17.70 non-AC, ₹35.40 AC per ticket)
= Grand Total
```

### Seat Classes

| Code | Name | Coach Prefix | Seats/Coach | Berth Cycle |
|------|------|-------------|-------------|-------------|
| SL | Sleeper | S | 72 | Lower, Middle, Upper, Side Lower, Side Upper |
| 2S | Second Sitting | S | 100 | Shares SL pool |
| 3A/3AC | 3rd AC | B | 64 | Lower, Middle, Upper, Side Lower, Side Upper |
| 2A/2AC | 2nd AC | A | 46 | Lower, Upper, Side Lower, Side Upper |
| 1A/1AC | 1st AC | H | 18 | Lower, Upper |
| CC | Chair Car | C | 78 | Window, Aisle, Middle |
| EC | Executive Chair | EC | 56 | Window, Aisle |

### Cancellation Refund Policy

| Hours Before Departure | Deduction |
|------------------------|-----------|
| > 48 hours | max(minimum_deduction, 25% of fare) |
| 48–12 hours | 25% of fare |
| 12–4 hours | 50% of fare |
| < 4 hours | 100% (no refund) |

**Tatkal bookings**: No refund ever.  
**Admin-cancelled trains**: Full 100% refund automatically.

### Minimum Deductions by Class

| Class | Min Deduction (₹) |
|-------|--------------------|
| 1A/1AC | 240 |
| 2A/2AC | 200 |
| 3A/3AC | 180 |
| CC/EC | 90 |
| SL/2S | 60 |

---

## 9. Known Limitations

| # | Issue | Impact | Recommendation |
|---|-------|--------|----------------|
| 1 | SHA-256 passwords for legacy accounts | Security risk | bcrypt migration in progress; complete for all users |
| 2 | OTP returned in API response | Demo-only; insecure | Send OTP via email/SMS in production |
| 3 | Header-based admin auth (legacy) | Spoofable from client | Fully migrate to JWT-only auth |
| 4 | No payment gateway | Payments marked manually | Integrate Razorpay/Stripe |
| 5 | In-memory rate limiter | Lost on restart; single-process only | Use Redis-backed rate limiter |
| 6 | In-memory cache | Lost on restart | Use Redis for persistent caching |
| 7 | Train Inventory gaps | Fallback to Train.Total_Seats_* | Ensure inventory records exist for all active trains |
| 8 | No WebSocket for real-time | SSE polling every 30s | Consider WebSocket for lower latency |
| 9 | Single Zoho refresh token | No HA/failover | Implement token redundancy |
| 10 | Zoho Creator rate limits | May throttle under load | Implement request queuing/batching |

---

*End of analysis document.*
