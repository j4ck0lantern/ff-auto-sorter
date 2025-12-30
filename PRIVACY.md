# Privacy Policy for Auto Sorter

**Effective Date:** December 29, 2025

This Privacy Policy explains how the **Auto Sorter** extension ("we", "us", or "the extension") handles your data. We are committed to protecting your privacy. This extension is designed with a "local-first" philosophy, meaning your data primarily stays on your device.

## 1. Data Collection and Storage

### Local Processing
The core functionality of Auto Sorter (sorting bookmarks, analyzing folder rules, and cleaning tabs) processing occurs entirely **locally** on your device. We do not operate any servers to collect, store, or analyze your browsing history or bookmarks.

### Firefox Sync
If you enable configuration sync, your extension settings (folder rules, preferences) are stored using **Firefox Sync** (`browser.storage.sync`). This data is encrypted and handled by Mozilla's infrastructure according to the [Firefox Privacy Note](https://www.mozilla.org/en-US/privacy/firefox/). We do not have access to this data.

## 2. Third-Party Services (AI Features)

The extension includes optional "Smart Suggest" and "Auto-Classify" features powered by Artificial Intelligence (AI). **These features are disabled by default.**

If you verify and choose to enable these features by providing your own API Key:

*   **Data Sent**: To classify a bookmark or suggest folders, the extension sends the **Title** and **URL** of the specific bookmarks you select (or your folder configuration) to your chosen AI provider.
*   **Providers**:
    *   **Google Gemini**: If you use a Gemini API key, data is processed by Google. [Google Privacy Policy](https://policies.google.com/privacy)
    *   **OpenAI**: If you use an OpenAI API key, data is processed by OpenAI. [OpenAI Enterprise Privacy](https://openai.com/enterprise-privacy)
*   **Retention**: We do not retain this data. It is sent strictly for the purpose of receiving a classification response and is then discarded by the extension.

**If you do not add an API key, no data is ever sent to these third parties.**

## 3. Permissions Explained

The extension requests the following permissions to function:

*   **`bookmarks`**: Required to read your bookmarks structure and move them into folders.
*   **`tabs`**: Required for the "Sort & Clean Tabs" feature to identify open tabs and convert them to bookmarks.
*   **`storage`**: Required to save your folder rules and preferences locally.
*   **`unlimitedStorage`**: To allow for large local backups of your configuration.
*   **Host Permissions (`*://*/*`)**: Strictly required **only** if you use the "Fetch Title" feature for URL-only bookmarks, or to communicate with the AI Provider APIs (Google/OpenAI) if enabled.

## 4. Analytical Data

This extension **does not** use any third-party analytics scripts (like Google Analytics, Mixpanel, etc.). We do not track your usage of the extension.

## 5. Contact

If you have questions about this policy, you may contact the developer via the support links provided on the Add-on listing page.
