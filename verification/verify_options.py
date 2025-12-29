
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Load the options page directly from the file system
        # Assuming the extension files are in the root
        cwd = os.getcwd()
        page.goto(f'file://{cwd}/options.html')

        # Take a screenshot of the initial state (Gemini selected by default)
        page.screenshot(path='verification/options_default.png')

        # Select OpenAI Compatible
        page.select_option('#aiProvider', 'openai')

        # Take a screenshot of the OpenAI config
        page.screenshot(path='verification/options_openai.png')

        browser.close()

if __name__ == '__main__':
    run()
