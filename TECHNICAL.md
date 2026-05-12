# 🛠️ My Bank: Technical Architecture & System Design

## 1. System Design
My Bank follows a **Serverless, Offline-First Progressive Web App (PWA)** architecture. It decouples the frontend from the backend to ensure the app works seamlessly without an internet connection.

### Architecture Diagram
```mermaid
graph TD
    %% User Interaction
    A([👤 User Adds/Edits Transaction]) --> B[Frontend: Validate Input & Convert Currency]
    
    %% Local Storage (Offline First)
    B --> C[Frontend: Save to Local IndexedDB]
    C --> D[Mark as 'Pending' <br>synced: 0 / Add to syncQueue]
    D --> E[Update UI & Charts Instantly]
    
    %% Network Check
    E --> F{Device Online?}
    F -->|No| G((Wait for Signal...))
    G -.->|Network Restored| H
    
    %% Sync Process
    F -->|Yes| H[SyncManager Triggered]
    H --> I[Fetch Pending Data from IndexedDB]
    I --> J[POST Request to Google Apps Script]
    
    %% Backend Processing (Google Cloud)
    subgraph Google Sheets Backend (Server)
        J --> K{Verify APP_SECRET}
        K -->|Fail| L((Reject: Access Denied))
        K -->|Pass| M[Request Script Lock <br>LockService.tryLock]
        
        M --> N{Lock Acquired?}
        N -->|No| O[Return 'Server Busy' Error]
        
        N -->|Yes| P{Action Type}
        P -->|Append| Q[Batch Append New Rows]
        P -->|Edit| R[O 1 Search & Single Batch Update]
        
        Q --> S[Log Action to Audit_Log]
        R --> S
        
        S --> T[Release Lock]
        T --> U[Return Success 200 OK]
    end
    
    %% Post-Sync Resolution
    O -.->|Frontend Retries Later| H
    
    U --> V[Frontend Receives Success]
    V --> W[Mark Local DB as synced: 1 <br> Clear syncQueue]
    W --> X[PULL latest 500 rows to ensure sync]
    X --> Y([✅ Update UI to Green Checkmarks])

    classDef user fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff;
    classDef frontend fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px;
    classDef backend fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    classDef error fill:#fee2e2,stroke:#dc2626,stroke-width:2px;

    class A,Y user;
    class B,C,D,E,F,H,I,V,W,X frontend;
    class K,M,N,P,Q,R,S,T,U backend;
    class L,O error;