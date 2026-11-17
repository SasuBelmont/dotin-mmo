import sys, time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))
    page.on('pageerror', lambda err: console_logs.append(f'[PAGE_ERROR] {err}'))

    print('Navigating to http://localhost:5173/...')
    page.goto('http://localhost:5173/')
    page.wait_for_timeout(3000)

    print('Initial page loaded. Console logs:')
    for log in console_logs:
        print(' ', log)

    btn = page.query_selector('#btn-to-creator')
    print('#btn-to-creator present:', btn is not None)
    if btn:
        print('Clicking #btn-to-creator...')
        btn.click()
        page.wait_for_timeout(2000)

    print('\nAfter clicking #btn-to-creator:')
    for log in console_logs:
        print(' ', log)

    login_disp = page.evaluate("() => document.getElementById('homescreen-login-card')?.style.display")
    creator_disp = page.evaluate("() => document.getElementById('homescreen-creator-card')?.style.display")
    print(f'homescreen-login-card display: {login_disp}')
    print(f'homescreen-creator-card display: {creator_disp}')

    page.screenshot(path='C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4/playwright_test_1.png')
    print('Screenshot saved: playwright_test_1.png')

    browser.close()
