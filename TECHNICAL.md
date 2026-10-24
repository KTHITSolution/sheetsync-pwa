# 🛠️ My Bank: Technical Architecture & System Design

## 1. System Design
My Bank uses a static PWA, IndexedDB, and an authenticated Apps Script backend. A fresh unlock requires a connection; an unlocked page can record offline until the browser locks. The browser cache is unencrypted. See [SECURITY_STATUS.md](SECURITY_STATUS.md) for the retention policy, audit recovery, tests, and deployment checks.

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
        J --> K{Verify private key hash and server role}
        K -->|Fail| L((Reject: Access Denied))
        K -->|Pass| M[Request Script Lock <br>LockService.tryLock]
        
        M --> N{Lock Acquired?}
        N -->|No| O[Return 'Server Busy' Error]
        
        N -->|Yes| P{Action Type}
        P -->|Append| Q[Validate and deduplicate IDs]
        P -->|Edit or Delete| R[Validate and capture before and after data]
        
        Q --> S[Flush PENDING audit intent for every affected ID]
        R --> S
        
        S --> T[Apply financial mutation and flush]
        T --> Z[Flush COMMITTED audit state]
        Z --> U[Return matching accepted IDs and release lock]
    end
    
    %% Post-Sync Resolution
    O -.->|Frontend Retries Later| H
    
    U --> V[Frontend Receives Success]
    V --> W[Mark only unchanged confirmed records synced <br>Retain every unconfirmed record or queued change]
    W --> X[Pull latest 50 rows without overwriting pending changes]
    X --> Y([✅ Update UI to Green Checkmarks])

    classDef user fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff;
    classDef frontend fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px;
    classDef backend fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    classDef error fill:#fee2e2,stroke:#dc2626,stroke-width:2px;

    class A,Y user;
    class B,C,D,E,F,H,I,V,W,X frontend;
    class K,M,N,P,Q,R,S,T,U backend;
    class L,O error;
```

An audit write must succeed before a mutation starts. If mutation or completion fails, the durable PENDING or UNCERTAIN entry retains recovery data; the owner must reconcile it with the ledger. Separate Sheets calls are not an atomic transaction. Each append response includes `accepted_ids`, including already stored identical IDs on a retry. Conflicting reuse of an ID is rejected.

Sync requests are serialized within a tab. Editing waits for in-flight sync and writes the local record and edit job in one IndexedDB transaction. Locking clears credentials and rendered records, cancels requests, and prevents a late response from changing the newly locked session. Unlock requires the private key again; lock timeouts do not revoke the underlying bearer key on the server.
