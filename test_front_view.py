import sys, time
from playwright.sync_api import sync_playwright

artifacts_dir = 'C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto('http://localhost:5173/')
    page.wait_for_timeout(3000)
    page.click('#btn-to-creator')
    page.wait_for_timeout(1000)

    # Ninja female
    page.click('#creator-class-pills [data-class="Ninja"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1000)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.ui && app.ui.creatorPreview) {
            app.ui.creatorPreview.characterGroup.rotation.y = Math.PI;
        }
    }''')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{artifacts_dir}/ninja_front.png')

    # Shaman female
    page.click('#creator-class-pills [data-class="Shaman"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1000)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.ui && app.ui.creatorPreview) {
            app.ui.creatorPreview.characterGroup.rotation.y = Math.PI;
        }
    }''')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{artifacts_dir}/shaman_front.png')

    browser.close()
    print('DONE')
