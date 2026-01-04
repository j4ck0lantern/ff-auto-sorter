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
*   **Tab Sorter**: Sorts active tabs into bookmarks and closes them.
*   **Deduplication**: Automatically removes duplicate bookmarks during sorting.
*   **Configuration Sync**: Your folder rules and AI settings automatically sync across your Firefox devices (if signed in).
*   **Dark Mode**: Fully supports your system's dark mode preference.

## 🚀 Getting Started

### 1. Installation
Install directly from the [Firefox Add-ons Store](https://addons.mozilla.org/firefox/addon/auto-sorter/).

*(Link will be active once reviewed by Mozilla)*

### 2. Setting Up AI Services
To unlock the full power of Auto Sorter (Smart Suggest, Auto-Classify), you need to configure an AI provider.

#### option A: Google Gemini (Easiest)
1.  Go to [Google AI Studio](https://aistudio.google.com/).
2.  Create a free API Key.
3.  Paste it into the "AI Configuration" section in the extension's options.

#### Option B: OpenAI or Compatible Services (Groq, Local LLMs)
You can use OpenAI's GPT-4o or **any OpenAI-compatible API** (like [Groq](https://groq.com/) for lightning-fast speeds).

**For OpenAI:**
1.  Get your key from [platform.openai.com](https://platform.openai.com/).
2.  Select "OpenAI Compatible" in the extension options.
3.  **Base URL**: Leave default (`https://api.openai.com/v1`).
4.  **Model**: `gpt-3.5-turbo` or `gpt-4o`.

**For Groq (Fast & Cheap):**
1.  Get a key from [console.groq.com](https://console.groq.com/).
2.  Select "OpenAI Compatible".
3.  **Base URL**: `https://api.groq.com/openai/v1`.
4.  **Model**: `llama3-70b-8192` (or similar).

> ⚠️ **Cost Disclaimer & Best Practices**:
> *   **API Costs**: Using third-party APIs (OpenAI, Groq, etc.) may incur costs based on your usage. You are responsible for any fees charged by the AI provider.
> *   **Rate Limits**: If you are classifying thousands of bookmarks, set the "Processing Speed" to **Normal** or **Slow** to avoid hitting rate limits.
> *   **Privacy**: Your bookmark titles, URLs, and **your folder rules/categories** are sent to the provider you select to provide context for AI operations. Do not use AI features if you are uncomfortable sharing this configuration data with the provider.

### 3. Configuration (The "Options" Page)
Click the extension icon and select **Settings** (or right-click the icon > Manage Extension > Options).

#### **The Interface**
*   **Left Sidebar**:
    *   **AI Configuration**: Enter your Gemini API Key or OpenAI credentials.
    *   **Database Management**: Choose your Storage Mode, Migrate tags, or Backup your database.
    *   **Folder Rules Backup**: Import/Export your configuration rules to JSON.
*   **Main Window**: 
    *   **Folder Tree**: Drag and drop folders to reorder. Click a folder to edit its keywords/regex.
    *   **Smart Suggest**: Click this to let AI analyze your unsorted bookmarks and suggest new categories.

### 4. Usage
*   **Auto-Sort**: New bookmarks are automatically checked against your rules when created.
*   **Context Menu**: Right-click any bookmark and classify it with AI.
*   **Popup Menu**: Click the toolbar icon to access:
    *   **Organize All**: Run rules on all bookmarks.
    *   **Classify All**: Run AI on all bookmarks.
    *   **Clear Tags**: Reset categorization.

## 🔒 Privacy & Permissions
*   **Local Processing**: By default, *all* rule-based sorting happens locally on your machine.
*   **AI Privacy**: If you enable AI features, only the specific URLs/Titles you choose to classify—along with your **folder rules and category names**—are sent to the AI provider (Google Gemini or OpenAI) for analysis. This context is required for the AI to suggest the best folders or analyze your rules. No other data is shared.
*   **Permissions**:
    *   `bookmarks`: To organize your library.
    *   `tabs`: For the "Sort Selected Tabs" feature.
    *   `storage`: To save your settings.
    *   `notifications`: To tell you when batch jobs are done.
