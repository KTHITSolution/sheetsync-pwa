Here is a polished, professional **README.md** template based on your provided text. You can copy and paste this directly into your GitHub repository or project root.

I have added standard open-source badges, a table of contents, and code formatting to make it look like a high-quality software product.

---

```markdown
# 🏦 My Bank - SheetSync PWA

**A powerful, offline-first financial management frontend for Google Sheets.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stack: Google Apps Script](https://img.shields.io/badge/Stack-Google%20Apps%20Script-4285F4)](https://developers.google.com/apps-script)
[![Platform: PWA](https://img.shields.io/badge/Platform-PWA-purple)](https://web.dev/progressive-web-apps/)
[![Status: Production](https://img.shields.io/badge/Status-Stable-green)]()

## 📖 About

**My Bank** is a Progressive Web App (PWA) designed to solve the "Mobile Data Entry" problem for Google Sheets users. It acts as a fast, native-feeling frontend that allows you to track expenses, income, and assets in multiple currencies (THB, USD, MMK) without needing a constant internet connection.

Unlike standard finance apps, **you own your data**. Everything is stored in your private Google Sheet, giving you complete control and privacy.

---

## 🚀 Key Features

### 🔌 Offline-First Architecture
* **Zero Latency:** Works completely offline.
* **Auto-Sync:** Transactions are queued locally and synchronized automatically when the internet connection is restored.
* **Conflict Resolution:** Uses smart syncing to handle data integrity.

### 💰 Financial Intelligence
* **Multi-Currency:** Native support for **THB, USD, and MMK**. The app automatically converts values to your base currency (THB) for reporting.
* **Asset Tracking:** Distinguishes between "Daily Expenses" and "Asset/Savings" accumulation.
* **Liquid Balance:** Real-time calculation of actual cash on hand vs. net worth.

### 🛡️ Security & Privacy
* **Google Sheets Backend:** Your data lives in your Google Drive, not on a third-party server.
* **Privacy Mode:** Click the 👁️ icon to hide sensitive financial numbers when in public.
* **Audit Logging:** Tracks *exactly* who made changes (Identity Management) and logs every action to a secure "Audit_Log" sheet.
* **RBAC:** Role-Based Access Control for Admins and Editors.

### 📊 Interactive Dashboard
* **Drill-Down Charts:** Click on chart slices to drill down from Main Categories to Sub-Categories.
* **Smart Analysis:** Visual breakdown of spending habits.

---

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (No heavy frameworks).
* **Database:** `IndexedDB` (Local Storage) + Google Sheets (Cloud Backend).
* **Backend:** Google Apps Script (GAS).
* **PWA:** Service Worker for caching, installability, and offline logic.

---

## ⚙️ Installation & Setup

### Part 1: Backend (Google Sheets)

1.  **Create a Sheet:** Create a new Google Sheet.
2.  **Setup Tabs:**
    * Rename the first tab to `Transactions`.
    * Create a second tab named `Audit_Log` (Right-click > Protect sheet to prevent accidental edits).
3.  **Install Script:**
    * Go to **Extensions > Apps Script**.
    * Copy the code from `backend.gs` into the script editor.
4.  **Configure Backend:**
    * Replace `SHEET_ID` in the code with your actual Spreadsheet ID.
    * Update `USER_DIRECTORY` with your email and role (e.g., `'ADMIN'`).
5.  **Deploy:**
    * Click **Deploy > New Deployment**.
    * **Type:** Web App.
    * **Execute as:** `Me`.
    * **Who has access:** `Anyone` *(Required for the PWA to connect without Google login prompts)*.
    * **Copy the Web App URL** generated.

### Part 2: Frontend (PWA)

1.  Open `index.html` in your source code.
2.  Find the configuration line:
    ```javascript
    const SCRIPT_URL = 'YOUR_WEB_APP_URL_HERE';
    ```
3.  Paste the Web App URL you copied in Part 1.
4.  **Host the App:** Upload `index.html`, `sw.js`, and `manifest.json` to any static host:
    * [GitHub Pages](https://pages.github.com/) (Recommended)
    * Netlify / Vercel
    * Firebase Hosting

---

## 📱 How to Use

1.  **Initial Load:** Open your hosted URL. The app will cache resources for offline use.
2.  **Identity:** Select your user profile (e.g., "Me" or "Partner") on the first launch. This tag accompanies every transaction for the Audit Log.
3.  **Add Transaction:**
    * Click **+ Income** or **- Expense**.
    * Toggle Currency (THB / USD / MMK).
    * Select Category & Sub-Category.
    * Click **Save**.
4.  **Sync Status:**
    * ✅ **Green Check:** Data is synced with Google Sheets.
    * 🕒 **Orange Clock:** Data is saved locally and will sync when online.

---

## 🔧 Configuration

### Customizing Categories
You can change the category structure by editing the `CATEGORY_CONFIG` object in `index.html`:

```javascript
let CATEGORY_CONFIG = {
    "Daily Living": { 
        "type": "EXPENSE", 
        "subs": ["Food", "Transport", "Utilities"] 
    },
    "Assets": { 
        "type": "ASSET", 
        "subs": ["Gold", "Land", "Stocks"] 
    },
    "Loans": {
        "type": "LIABILITY",
        "subs": ["Mortgage", "Car Loan"]
    }
};

```

### Changing Budget Limits

Edit the `DEFAULT_LIMITS` object in the code or use the **Settings (⚙️)** button inside the app to set monthly spending alerts.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch: `git checkout -b feature/NewFeature`
3. Commit your changes: `git commit -m 'Add some NewFeature'`
4. Push to the branch: `git push origin feature/NewFeature`
5. Open a Pull Request.

## 📄 License

This project is open-source and available for personal use under the [MIT License](https://www.google.com/search?q=LICENSE).

```

```