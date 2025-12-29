# Auto Sorter for Firefox

**Auto Sorter** is a power-user browser extension that automatically organizes your bookmarks into meaningful folder structures using customizable rules or **AI-powered classification**.

It helps you maintain a clean, organized library of links without manual effort.

## ✨ Key Features

### 🧠 AI Smart Categorization
*   **Auto-Classify**: Right-click any bookmark to let Google Gemini or OpenAI analyze the content and file it into the best folder.
*   **Smart Suggestions**: The "Smart Suggest" feature analyzes your *uncategorized* bookmarks and suggests new folder structures and keywords based on your actual browsing habits.
*   **Batch Processing**: Classify your entire messy "Other Bookmarks" folder in one go.

### 📂 Advanced Folder Management
*   **Visual Tree Editor**: Manage your folder structure with a drag-and-drop interface. No need to edit JSON manually (though you can if you want!).
*   **Flexible Rules**: Define folders with **Keywords** (simple matching) or **Regex** (power matching).
*   **Recursive Renaming**: Renaming a parent folder automatically updates all sorting rules for sub-folders.

### 💾 Flexible Storage Options
*   **Local Database Mode (Default)**: Keeps your URLs clean. Tags and metadata are stored in a local indexedDB.
*   **URL Hash Mode (Portable)**: Embeds tags directly into the bookmark URL (e.g., `...#tags=folder:dev`). This makes your sorting **portable**—sync your bookmarks, and your tags travel with them!
*   **Migration Tool**: Easily switch between storage modes at any time.

### 🛠️ Productivity Tools
*   **Tab Sorter**: Select multiple tabs -> Right-click "Sort Selected Tabs" to bookmark, organize, and close them instantly.
*   **URL Cleaner**: Automatically strips tracking parameters (`utm_source`, `fbclid`, etc.) before saving bookmarks.
*   **Configuration Sync**: Your folder rules and AI settings automatically sync across your Firefox devices (if signed in).
*   **Dark Mode**: Fully supports your system's dark mode preference.

## 🚀 Getting Started

### 1. Installation
1.  Download the latest release.
2.  Open Firefox and go to `about:debugging`.
3.  Click **This Firefox** > **Load Temporary Add-on...**.
4.  Select the `manifest.json` file.

### 2. Configuration (The "Options" Page)
Click the extension icon and select **Settings** (or right-click the icon > Manage Extension > Options).

#### **The Interface**
*   **Left Sidebar**:
    *   **AI Configuration**: Enter your Gemini API Key or OpenAI credentials.
    *   **Database Management**: Choose your Storage Mode, Migrate tags, or Backup your database.
    *   **Folder Rules Backup**: Import/Export your configuration rules to JSON.
*   **Main Window**: 
    *   **Folder Tree**: Drag and drop folders to reorder. Click a folder to edit its keywords/regex.
    *   **Smart Suggest**: Click this to let AI analyze your unsorted bookmarks and suggest new categories.

### 3. Usage
*   **Auto-Sort**: New bookmarks are automatically checked against your rules when created.
*   **Context Menu**: Right-click any bookmark and classify it with AI.
*   **Popup Menu**: Click the toolbar icon to access:
    *   **Organize All**: Run rules on all bookmarks.
    *   **Classify All**: Run AI on all bookmarks.
    *   **Clear Tags**: Reset categorization.

## 🔒 Privacy & Permissions
*   **Local Processing**: By default, *all* rule-based sorting happens locally on your machine.
*   **AI Privacy**: If you enable AI features, only the specific URLs/Titles you choose to classify are sent to the AI provider (Google Gemini or OpenAI) for analysis. No other data is shared.
*   **Permissions**:
    *   `bookmarks`: To organize your library.
    *   `tabs`: For the "Sort Selected Tabs" feature.
    *   `storage`: To save your settings.
    *   `notifications`: To tell you when batch jobs are done.
