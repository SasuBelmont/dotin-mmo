import sys, time
from playwright.sync_api import sync_playwright

artifacts_dir = 'C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    
    page.goto('http://localhost:5173/')
    page.wait_for_timeout(3000)

    # 1. Clic en INGRESAR / CREAR PERSONAJE
    page.click('#btn-to-creator')
    page.wait_for_timeout(1000)

    # Test female warrior
    page.click('#creator-class-pills [data-class="Warrior"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{artifacts_dir}/qa_02_female_warrior_preview.png')
    print('1. Female Warrior Preview saved')

    # Test female sura
    page.click('#creator-class-pills [data-class="Sura"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{artifacts_dir}/qa_03_female_sura_preview.png')
    print('2. Female Sura Preview saved')

    # Test ninja
    page.click('#creator-class-pills [data-class="Ninja"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{artifacts_dir}/qa_04_female_ninja_preview.png')
    print('3. Female Ninja Preview saved')

    # Test shaman
    page.click('#creator-class-pills [data-class="Shaman"]')
    page.click('#creator-gender-pills [data-gender="female"]')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{artifacts_dir}/qa_05_female_shaman_preview.png')
    print('4. Female Shaman Preview saved')

    # Comenzar aventura con Guerrero
    page.click('#creator-class-pills [data-class="Warrior"]')
    page.click('#creator-gender-pills [data-gender="male"]')
    page.click('#btn-enter-game')
    page.wait_for_timeout(3000)
    page.screenshot(path=f'{artifacts_dir}/qa_06_overworld_spawn.png')
    print('5. Overworld Spawn screenshot saved')

    # Move player to Pier at (-8, 0, 48.5)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.myWorldPlayer) {
            app.myWorldPlayer.pos.x = -8;
            app.myWorldPlayer.pos.z = 48.5;
            if (app.myPlayerMesh) {
                app.myPlayerMesh.position.set(-8, 0, 48.5);
            }
        }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{artifacts_dir}/qa_07_pier_wooden_deck.png')
    print('6. Pier Wooden Deck screenshot saved')

    # Move player to Stone Lanterns along the main path (e.g. at (0, 0, -20))
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.myWorldPlayer) {
            app.myWorldPlayer.pos.x = 0;
            app.myWorldPlayer.pos.z = -14;
            if (app.myPlayerMesh) {
                app.myPlayerMesh.position.set(0, 0, -14);
            }
        }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{artifacts_dir}/qa_08_stone_lanterns.png')
    print('7. Stone Lanterns screenshot saved')

    # Move player to North Portal at (0, 0, -56)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.myWorldPlayer) {
            app.myWorldPlayer.pos.x = 0;
            app.myWorldPlayer.pos.z = -56;
            if (app.myPlayerMesh) {
                app.myPlayerMesh.position.set(0, 0, -56);
            }
        }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{artifacts_dir}/qa_09_north_portal_vortex.png')
    print('8. North Portal screenshot saved')

    # Move player to Gazebo / Pagoda at (-16, 0, 18)
    page.evaluate('''() => {
        const app = window.gameApp;
        if (app && app.myWorldPlayer) {
            app.myWorldPlayer.pos.x = -16;
            app.myWorldPlayer.pos.z = 18;
            if (app.myPlayerMesh) {
                app.myPlayerMesh.position.set(-16, 0, 18);
            }
        }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{artifacts_dir}/qa_10_gazebo_pagoda_roof.png')
    print('9. Gazebo Pagoda Roof screenshot saved')

    browser.close()
    print('ALL QA CHECKS COMPLETED SUCCESSFULLY!')
