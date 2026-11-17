from playwright.sync_api import sync_playwright

artifacts_dir = 'C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto('http://localhost:5173/')
    page.wait_for_timeout(3000)

    # Enter game
    page.click('#btn-to-creator')
    page.wait_for_timeout(500)
    page.click('#btn-enter-game')
    page.wait_for_timeout(3000)

    # Move player right next to lantern at (-4.5, 0, -22)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.myWorldPlayer) {
            app.myWorldPlayer.pos.x = -2.5;
            app.myWorldPlayer.pos.z = -22;
            if (app.myPlayerMesh) {
                app.myPlayerMesh.position.set(-2.5, 0, -22);
            }
        }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{artifacts_dir}/qa_08_stone_lanterns_closeup.png')
    browser.close()
    print('LANTERN CLOSEUP SAVED')
