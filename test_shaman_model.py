from playwright.sync_api import sync_playwright

artifacts_dir = 'C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto('http://localhost:5173/')
    page.wait_for_timeout(3000)
    page.click('#btn-to-creator')
    page.wait_for_timeout(1000)

    # Shaman female
    page.click('#creator-class-pills [data-class="Shaman"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1000)
    
    # Load test model
    page.evaluate('''async () => {
        const preview = window.gameApp.ui.creatorPreview;
        preview.rotationSpeed = 0;
        while (preview.characterGroup.children.length > 0) {
            preview.characterGroup.remove(preview.characterGroup.children[0]);
        }
        const inst = await window.gameApp.assets.createCharacterInstance('shaman_test');
        if (inst) {
            inst.group.scale.setScalar(0.0125);
            preview.characterGroup.add(inst.group);
            inst.playAnimation('idle');
        }
    }''')
    page.wait_for_timeout(1000)
    
    import math
    for deg in [45, 90, 135, 180, 225, 270]:
        rad = deg * math.pi / 180.0
        page.evaluate(f'''() => {{
            window.gameApp.ui.creatorPreview.characterGroup.rotation.y = {rad};
        }}''')
        page.wait_for_timeout(200)
        page.screenshot(path=f'{artifacts_dir}/shaman_test_{deg}.png')

    browser.close()
    print('SHAMAN TEST SCREENSHOTS SAVED')
