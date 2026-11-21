#!/usr/bin/env python3
"""Optional browser smoke test; run with installed Playwright and Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'app/src/main/assets/dosbox'
stub="""
window.emulators={pathPrefix:'',bundle:async()=>({autoexec(){},dosboxConf:'[autoexec]\\nHELLO.COM',jsdosConf:''}),
 dosboxWorker:async()=>({
 width:()=>320,height:()=>200,events:()=>({onFrameSize(){},onFrame(){},onSoundPush(){},onExit(){}}),
 sendKeyEvent(code,down){window._keys.push([code,down]);},sendMouseButton(code,down){window._mouse.push([code,down]);},
 sendMouseMotion(){},pause(){},resume(){},screenshot:async()=>({width:0}),
 persist:async()=>new Uint8Array([0]),soundFrequency:()=>44100,
 simulateKeyPress(code){window._keys.push([code,true]);window._keys.push([code,false]);}
 })};"""
html=(root/'player.html').read_text()
html=html.replace('<meta http-equiv="Content-Security-Policy"', '<meta name="unused-policy"')
html=html.replace('<link rel="stylesheet" href="/player.css">','<style>'+ (root/'player.css').read_text()+'</style>')
for path, js in [('engine/emulators.js',stub),('deluxe-profile.js',(root/'deluxe-profile.js').read_text()),
 ('player.js',(root/'player.js').read_text()),('player-deluxe.js',(root/'player-deluxe.js').read_text())]:
 html=html.replace('<script defer src="/'+path+'"></script>','')
 html=html.replace('</body>','<script>'+js+'</script></body>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':720,'height':1250},device_scale_factor=1,has_touch=True)
    page.on('console',lambda msg:print('CONSOLE',msg.type,msg.text) if msg.type=='error' else None)
    page.on('pageerror',lambda err:print('PAGE ERROR',err))
    page.add_init_script("""window._keys=[];window._mouse=[];window._storage={};
Object.defineProperty(window,'localStorage',{configurable:true,value:{
  getItem:k=>Object.prototype.hasOwnProperty.call(window._storage,k)?window._storage[k]:null,
  setItem:(k,v)=>{window._storage[k]=String(v)},removeItem:k=>{delete window._storage[k]}
}});
window.RetroDosBox={fullscreen:x=>{window._fullscreen=x;},orientation:x=>{window._orientation=x;},status:x=>{window._status=x;}};""")
    page.route('**/engine/emulators.js',lambda route:route.fulfill(body=stub,content_type='text/javascript'))
    page.evaluate("""() => {window._keys=[];window._mouse=[];window._storage={};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>window._storage[k]??null,setItem:(k,v)=>window._storage[k]=String(v),removeItem:k=>delete window._storage[k]
      }});
      window.RetroDosBox={fullscreen:x=>{window._fullscreen=x},orientation:x=>{window._orientation=x},status:x=>{window._status=x}};
    }""")
    page.set_content(html,wait_until='load')
    page.wait_for_function('document.getElementById("pause").disabled === false',timeout=10000)
    assert page.locator('#deluxe-settings').is_hidden()
    assert page.locator('#fullscreen-bar').is_hidden()
    page.locator('#fullscreen-toggle').click()
    assert page.locator('body').evaluate('(el)=>el.classList.contains("dos-fullscreen")')
    assert page.locator('#fullscreen-bar').is_visible()
    assert page.locator('#deluxe-touch').is_visible()
    page.locator('#fullscreen-settings').click()
    assert page.locator('#deluxe-settings').is_visible()
    page.locator('select[data-touch-map="a"]').select_option('32')
    page.locator('#orientation').select_option('landscape')
    page.locator('#settings-close').click()
    assert not page.locator('#deluxe-settings').is_visible()
    data=page.evaluate('JSON.parse(localStorage.getItem("retro-dosbox-deluxe-v1:demo-v1"))')
    assert data['touch']['a']==32 and data['orientation']=='landscape',data
    # Touch controls and current profile, with synthetic pointer sequence.
    page.evaluate('''() => {const b=document.querySelector('[data-touch="a"]');
      const e1=new PointerEvent('pointerdown',{bubbles:true,pointerId:2,isPrimary:true});
      b.setPointerCapture=()=>{};b.dispatchEvent(e1);
      b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:2,isPrimary:true}));
    }''')
    assert [32,True] in page.evaluate('window._keys')
    assert [32,False] in page.evaluate('window._keys')
    # A controller button and analog axis map to keys and release safely on disconnect.
    page.evaluate("""() => {window._keys=[];window._testPad={connected:true,id:'Mock USB Pad',buttons:Array.from({length:16},()=>({pressed:false})),axes:[-1,0]};
      window._testPad.buttons[0].pressed=true;
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window._testPad]});}""")
    page.wait_for_timeout(100)
    keys=page.evaluate('window._keys')
    assert [341,True] in keys and [263,True] in keys, keys
    page.evaluate("""() => {window._testPad.buttons[0].pressed=false;window._testPad.axes[0]=0;}""")
    page.wait_for_timeout(100)
    keys=page.evaluate('window._keys')
    assert [341,False] in keys and [263,False] in keys,keys
    page.locator('#fullscreen-settings').click()
    page.locator('#layout-edit').click()
    assert page.locator('#deluxe-touch').evaluate('(e)=>e.classList.contains("editing")')
    page.locator('#layout-edit-full').click()
    assert not page.locator('#deluxe-touch').evaluate('(e)=>e.classList.contains("editing")')
    page.locator('#fullscreen-exit').click()
    assert not page.locator('body').evaluate('(e)=>e.classList.contains("dos-fullscreen")')
    page.screenshot(path=str(Path(__file__).parents[1]/'docs/dosbox-deluxe-browser-smoke.png'))
    print('PASS browser DOS Deluxe settings, per-game persistence, remapped touch input, layout edit, fullscreen restore')
    browser.close()
 
