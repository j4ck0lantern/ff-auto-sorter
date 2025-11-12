# Auto Sorter

Auto Sorter is a browser extension designed to automatically organize your new and existing bookmarks into designated hobby folders. It uses a flexible system of keywords and regular expressions to categorize bookmarks based on their title and URL, helping you maintain a clean and structured bookmark collection.

## Key Features

-   **Automatic Sorting**: Automatically categorizes newly created bookmarks into the appropriate hobby folder.
-   **Duplicate Detection**: Prevents the creation of duplicate bookmarks by checking if the URL already exists.
-   **Existing Bookmark Organization**: Allows you to scan and organize your entire bookmark collection at any time.
-   **Customizable Rules**: Provides a flexible JSON-based configuration to define your own hobby folders and sorting rules.

## How It Works

The extension works by matching the title and URL of a bookmark against a set of user-defined rules. These rules are based on keywords and regular expressions, allowing for a high degree of customization. When a bookmark is created, the extension checks it against the rules and moves it to the appropriate folder.

## Configuration

You can customize the sorting rules by navigating to the extension's options page. The configuration is a JSON object that defines the hobby folders and their corresponding keywords and regular expressions.

Here is an example of the default configuration:

```json
[
  {
    "folder": "Programming/Web",
    "config": {
      "keywords": ["javascript", "react", "css", "html", "node"],
      "regex": [],
      "comment": "Web development projects and articles."
    }
  },
  {
    "folder": "Cooking",
    "config": {
      "keywords": ["recipe", "kitchen", "ingredient", "baking", "cook", "chef"],
      "regex": [
        {
          "pattern": "\\/recipe\\/",
          "comment": "Matches any URL containing '/recipe/'"
        }
      ],
      "comment": "All about food, baking, and culinary arts."
    }
  }
]
```

To add your own rules, simply modify the JSON in the options page and click "Save".

## Installation (Firefox)

To install the extension in Firefox, follow these steps:

1.  Download the extension files from the [releases page](https://github.com/your-repo/releases).
2.  Open Firefox and navigate to `about:debugging`.
3.  Click on "This Firefox" in the sidebar.
4.  Click on "Load Temporary Add-on...".
5.  Select the `manifest.json` file from the extension's folder.

## Privacy Policy

Auto Sorter is designed with privacy in mind. All your data is stored and processed locally on your computer. The extension does not collect or transmit any personal information.
