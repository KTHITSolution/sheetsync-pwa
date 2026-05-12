# 🏦 My Bank
### The Ultimate Privacy-First Finance Tracker (PWA)

> **Stop paying subscriptions. Own your financial data.**

**My Bank** is a professional-grade Progressive Web App (PWA) that combines the speed of a native mobile app with the privacy and flexibility of Google Sheets. Unlike standard fintech apps, your data is stored securely in **your own Google Drive**, not on third-party servers.

---

## ✨ Key Features

* **🔒 100% Private:** Your financial data lives in your personal Google Sheet. We cannot see it.
* **⚡ Offline-First:** Add transactions instantly, even in Airplane Mode. Data syncs automatically when you reconnect.
* **💸 Zero Monthly Fees:** You bought the code. You own it forever.
* **🌍 Multi-Currency:** Native support for **THB, USD, and MMK** with auto-conversion.
* **📊 Smart Dashboard:** Interactive drill-down charts to visualize spending habits.
* **🔐 Secure Login:** Password-protected access prevents unauthorized viewing of your sensitive data.

---

## 🚀 Quick Start Guide

**Note:** A detailed, step-by-step **PDF User Guide** is included in this folder.

### 1. Backend Setup (Google Sheets)
1.  Open the **Master Database Link** (provided in your purchase email) and make a copy to your Google Drive.
2.  Open **Extensions > Apps Script**.
3.  **Critical:** Change the `APP_SECRET` variable to your own unique password.
4.  Deploy the script as a **Web App** (Execute as: `Me`, Access: `Anyone`).
5.  Copy the **Web App URL**.

### 2. Frontend Setup (The App)
1.  Go to our [Setup Website](https://your-website-url.com) (or open the User Guide).
2.  Use the **Config Generator** to create your `config.js` file using your Web App URL.
3.  Place the `config.js` file into this folder.

### 3. Go Live
1.  Drag and drop this entire folder onto **[Netlify Drop](https://app.netlify.com/drop)** (free hosting).
2.  Open the resulting link on your phone.
3.  **Add to Home Screen** to install it as a native app.

---

## 🛠️ Under the Hood

Curious about how My Bank handles offline syncing, security, and race conditions? 

We have documented the full system architecture, algorithms, and data structures.
👉 **[Read the Technical Documentation](TECHNICAL.md)**

### Tech Stack
* **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript.
* **Database:** Google Sheets (via Google Apps Script).
* **Local Cache:** IndexedDB (via `idb.js`) for 0ms latency.
* **Visualization:** Chart.js.

---

## 📂 Project Structure

| File | Description |
| :--- | :--- |
| `index.html` | The main application interface and logic. |
| `backend.gs` | The server-side script that runs inside Google Sheets. |
| `config.js` | Configuration file containing your API URL and settings. |
| `sw.js` | Service Worker that powers Offline Mode. |
| `manifest.json`| Allows the app to be installed on Android/iOS. |
| `TECHNICAL.md` | Detailed system architecture and algorithm breakdown. |

---

## 📜 License

**© 2026 My Bank / KTH IT Solution**

* ✅ **Allowed:** Personal use, internal business use, modification for personal needs.
* ❌ **Prohibited:** Reselling, redistributing, or sub-licensing this source code.

*Built with 💙 and Google Sheets.*

> ## 🛠️ Under the Hood
> Curious about how My Bank handles offline syncing and security?
> Check out our **[Technical Architecture & Algorithms](TECHNICAL.md)** document.