import math
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
    
    # Freeze auto rotation
    page.evaluate('''() => {
        window.gameApp.ui.creatorPreview.rotationSpeed = 0;
    }''')
    
    for deg in [0, 90, 180, 270]:
        rad = deg * math.pi / 180.0
        page.evaluate(f'''() => {{
            window.gameApp.ui.creatorPreview.characterGroup.rotation.y = {rad};
        }}''')
        page.wait_for_timeout(300)
        page.screenshot(path=f'{artifacts_dir}/ninja_{deg}.png')

    browser.close()
print('ROTATION CHECKS SAVED')
