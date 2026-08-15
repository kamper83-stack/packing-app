# 🚀 תוכנית עבודה לפיתוח Packing App (Sprint Plan)

**צוות הפיתוח:** ערן & שירי  
**מנחה טכנולוגי (Tech Lead):** Antigravity AI  
**ענף עבודה ראשי:** `main`

---

## 🎯 יעדי הפרויקט
1. בניית אפליקציית Full-Stack שלמה לניהול חכם של רשימות אריזה לחופשות.
2. תרגול מעשי של React, Express, SQLite/Sequelize, JWT Authentication, ו-API חיצוני.
3. שילוב מודל עסקי (Monetization): 2 נסיעות חינם, מנוי Pro ומסכי Paywall.

---

## 👥 חלוקת תפקידים ואחריות

### 🛠️ ערן – Backend & Architecture Lead
* הגדרת מסד הנתונים וה-Models (Sequelize / SQLite).
* פיתוח שרת ה-Express ו-RESTful APIs.
* אבטחה ואימות: הצפנת סיסמאות (`bcrypt`), הנפקת `JWT` ו-Auth Middleware.
* לוגיקת צד שרת למונטיזציה (Middleware לבדיקת מכסת נסיעות חינמיות).
* אינטגרציה עם Weather API / Mock AI.

### 🎨 שירי – Frontend & UI/UX Lead
* בניית ממשק המשתמש ב-React וב-Tailwind CSS.
* ניהול State מקומי וגלובלי (React Hooks, Context / LocalStorage).
* מסכי Auth: התחברות והרשמה עם ניתוב מוגן (`ProtectedRoute`).
* מסך הדשבורד וטפסי יצירת נסיעה חדשה.
* מסך רשימת אריזה אינטראקטיבי (סימון פריטים, סינון לפי מזוודות/קטגוריות).
* מסך מחירון ומודאל שדרוג למנוי (Paywall & Pricing Modal).

---

## 📋 תוכנית השלבים (Milestones & Sprints)

```mermaid
graph TD
    M1[שלב 1: Auth & DB Core] --> M2[שלב 2: Trip & Packing CRUD]
    M2 --> M3[שלב 3: חיבור צד-לקוח לצד-שרת]
    M3 --> M4[שלב 4: פיצ'רים מתקדמים - מזג אוויר ומונטיזציה]
    M4 --> M5[שלב 5: בדיקות והגשה]
```

---

### 🔹 שלב 1: תשתית ואימות משתמשים (Auth & Core DB)
* **ערן (Backend):** 
  * [Issue #4]: מימוש מודל `User` ב-Sequelize, יצירת נתיבי `/api/auth/register` ו-`/api/auth/login`.
  * הצפנת סיסמאות עם `bcrypt` והחזרת JWT Token.
* **שירי (Frontend):**
  * [Issue #5]: בניית קומפוננטות `Login.jsx` ו-`Signup.jsx` עם טפסים ו-Validation.
  * שמירת ה-Token ב-`localStorage` והגדרת `ProtectedRoute` ב-React Router.
* **משימה משותפת:** בדיקה ידנית שהרשמה והתחברות עובדות מקצה לקצה.

---

### 🔹 שלב 2: ניהול נסיעות ופריטי אריזה (Trips & Packing CRUD)
* **ערן (Backend):**
  * [Issue #6]: יצירת מודלים `Trip` ו-`PackingItem` עם קשרים (`User hasMany Trips`, `Trip hasMany PackingItems`).
  * יצירת REST Endpoints: קבלת נסיעות, יצירת נסיעה, הוספת פריט, ועדכון סטטוס `isPacked`.
* **שירי (Frontend):**
  * [Issue #9]: בניית ה-`Dashboard.jsx` – תצוגת כרטיסי נסיעה וטופס יצירת נסיעה חדשה (יעד, תאריכים, חברת תעופה).
  * [Issue #10]: בניית `TripView.jsx` – תצוגת רשימת הפריטים עם Checkboxes, חלוקה לקטגוריות והוספת פריט ידני.

---

### 🔹 שלב 3: מודל עסקי ומונטיזציה (Monetization & Limits) 💰
* **ערן (Backend):**
  * הוספת שדות ב-User: `freeTripsCount` (ברירת מחדל: 2) ו-`isPro` (boolean).
  * יצירת Middleware בשם `checkTripQuota` – חוסם יצירת נסיעה חדשה עם שגיאת `403 Payment Required` אם המשתמש חרג מ-2 נסיעות ואינו Pro.
  * Endpoint לסימולציית תשלום / שדרוג ל-Pro: `POST /api/auth/upgrade-pro`.
* **שירי (Frontend):**
  * הצגת Badge של "Free Plan (X נסיעות נותרו)" או "Pro" ב-Navbar.
  * בניית `PricingModal` או דף מחירון שקופץ כשהמשתמש מגיע למכסה.
  * כפתור "שדרג ל-Pro" המבצע סימולציית רכישה.

---

### 🔹 שלב 4: פיצ'ר מתקדם – המלצות מזג אוויר 🌦️
* **ערן (Backend):**
  * [Issue #7]: יצירת שירות מזג אוויר מול Weather API (או Mock) המחזיר תחזית ליעד לפי תאריכי הנסיעה.
* **שירי (Frontend):**
  * הצגת ווידג'ט מזג אוויר צבעוני בתוך דף הנסיעה (`TripView`).
  * התראת אריזה מיוחדת (למשל: "צפוי גשם ביעד - מומלץ לארוז מטרייה ומעיל!").

---

## 🛠️ כללי עבודה כצוות (Git Workflow)
1. **לא דוחפים ישירות ל-`main`**:
   * ערן פותח ענף: `feature/eran-auth-backend`
   * שירי פותחת ענף: `feature/shiri-auth-ui`
2. **Code Review ומנטורינג:**
   * כשאתם מסיימים משימה, אתם מבקשים ממני (המנטור) לעשות לכם Code Review.
   * אני אעבור על הקוד, אצביע על דגשים (אבטחה, יעילות, Clean Code) ואאשר לכם למזג.
